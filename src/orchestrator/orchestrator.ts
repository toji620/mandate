import { v4 as uuidv4 } from 'uuid';
import {
  computeBand,
  demote,
  evaluate,
  SPEND_COMMITTING_ACTIONS,
  type LedgerEvent,
} from '@/src/engine/evaluate';
import { AGENT_ROLES, type AgentRole } from '@/src/agents/agents';
import { propose } from '@/src/agents/propose';
import { getModelId } from '@/src/granite/client';
import { agentVersion } from '@/src/trust/version';
import { appendLedgerEvent, loadLedger } from '@/src/trust/ledger';
import type { AgentState, ApprovedCommitment, PolicyRule, ProposedAction } from '@/src/types';
import type { MissionConfig, MissionStatus, MissionStep, PendingApproval } from './types';
import { saveApproval, saveDecision, updateApprovalStatus } from './persistence';

/**
 * Seam over the trust ledger, so tests can supply an agent's history without a
 * database and the orchestrator does not depend on Postgres to run.
 */
export interface TrustStore {
  load(agentRole: string, version: string): Promise<LedgerEvent[]>;
  append(
    agentRole: string,
    version: string,
    event: LedgerEvent,
    missionId: string,
    stepNumber: number,
    reason: string
  ): Promise<void>;
}

/** The one agent whose trust this demo tracks. */
const TRUST_ROLE = 'Sourcing Agent';

/**
 * Mission orchestrator: a plain TypeScript state machine running
 *
 *     propose -> evaluate -> record -> (execute | wait for a human | block)
 *
 * Exactly ONE execution loop runs per mission, for its whole life. When a step
 * needs a human, the loop parks on a promise and resumes in place once the
 * approval resolves. Approving does NOT start a second loop — that was a bug
 * that ran two copies of the same mission side by side, the second of them with
 * no policy rules loaded.
 */
export class MissionOrchestrator {
  private missions: Map<string, MissionStatus> = new Map();
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  /** Resolvers for approvals the execution loop is currently parked on. */
  private approvalWaiters: Map<string, () => void> = new Map();

  /** Production uses Postgres. Tests inject an in-memory store. */
  private trustStore: TrustStore = { load: loadLedger, append: appendLedgerEvent };

  setTrustStore(store: TrustStore): void {
    this.trustStore = store;
  }

  async startMission(config: MissionConfig, rules: PolicyRule[]): Promise<string> {
    const missionId = uuidv4();

    const mission: MissionStatus = {
      id: missionId,
      goal: config.goal,
      mode: config.mode,
      status: 'running',
      currentStep: 0,
      steps: [],
      pendingApprovals: [],
      context: config.initialContext ?? {},
      rules,
      startedAt: new Date(),
    };

    this.missions.set(missionId, mission);

    this.executeMission(missionId).catch((error) => {
      console.error(`Mission ${missionId} failed:`, error);
      const m = this.missions.get(missionId);
      if (m) m.status = 'failed';
    });

    return missionId;
  }

  getMission(missionId: string): MissionStatus | undefined {
    return this.missions.get(missionId);
  }

  getAllMissions(): MissionStatus[] {
    return Array.from(this.missions.values());
  }

  getPendingApproval(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  getMissionApprovals(missionId: string): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (a) => a.missionId === missionId && a.status === 'pending'
    );
  }

  /**
   * Approve a pending action. This only records the human's decision and wakes
   * the parked execution loop. It never starts a new one.
   */
  async approveAction(approvalId: string, approvedBy: string): Promise<void> {
    await this.resolveApproval(approvalId, 'approved', approvedBy);
  }

  async rejectAction(approvalId: string, rejectedBy: string): Promise<void> {
    await this.resolveApproval(approvalId, 'rejected', rejectedBy);
  }

  private async resolveApproval(
    approvalId: string,
    status: 'approved' | 'rejected',
    resolvedBy: string
  ): Promise<void> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Approval not found or already resolved');
    }

    approval.status = status;
    approval.resolvedAt = new Date();
    approval.resolvedBy = resolvedBy;

    await updateApprovalStatus(approvalId, status, resolvedBy);

    // Wake the loop parked on this approval. It picks the story up from here.
    this.approvalWaiters.get(approvalId)?.();
    this.approvalWaiters.delete(approvalId);
  }

  /**
   * The single execution loop for a mission.
   *
   * Trust state lives here for the mission's whole life: the ledger is appended
   * to, never rebuilt, and the band is re-derived from it before every step.
   */
  private async executeMission(missionId: string): Promise<void> {
    const mission = this.missions.get(missionId);
    if (!mission) return;

    const rules = mission.rules;

    // The agent CONFIGURATION this mission runs as. Trust binds to this: a
    // different model (e.g. a fine-tuned one) has a different version and
    // re-earns trust from scratch. The prompt is held constant.
    const version = agentVersion(TRUST_ROLE, getModelId(), AGENT_ROLES.sourcing.prompt);

    // The agent's whole history, not a blank slate. Reputation is a test record
    // for this configuration and survives across missions. Append-only.
    const ledger: LedgerEvent[] = await this.trustStore.load(TRUST_ROLE, version);

    /** Spends a human has actually signed off. The agent cannot write to this. */
    const priorApprovals: ApprovedCommitment[] = [];

    const agentSequence: AgentRole[] = [
      'sourcing', // 1. gather requirements
      'sourcing', // 2. request quotations
      'sourcing', // 3. compare approved vendors
      'sourcing', // 4. select preferred supplier
      'procurement', // 5. commit the spend
      'sourcing', // 6. try the cheaper unapproved supplier
      'procurement', // 7. issue the purchase order
    ];

    for (let i = 0; i < agentSequence.length; i++) {
      const stepNumber = i + 1;
      const agentRole = agentSequence[i];
      mission.currentStep = stepNumber;

      // Derive the band from the ledger. Never carried forward by hand.
      const before = computeBand(ledger);
      const agentStateBefore: AgentState = {
        id: 1,
        name: 'Sourcing Agent',
        role: agentRole,
        autonomyBand: before.currentBand,
        reputation: before.reputation,
        approvedSpendCount: before.approvedSpendCount,
      };

      try {
        const proposal = await propose(
          {
            goal: mission.goal,
            currentStep: stepNumber,
            agentState: agentStateBefore,
            context: mission.context,
          },
          mission.mode,
          mission.mode === 'live' ? agentRole : undefined
        );

        const decision = evaluate(proposal, agentStateBefore, rules, { priorApprovals });

        if (decision.verdict === 'BLOCK') {
          const bandAfter = demote(before.currentBand);

          const demotion: LedgerEvent = {
            eventType: 'DEMOTION',
            verdict: 'BLOCK',
            bandBefore: before.currentBand,
            bandAfter,
            createdAt: new Date(),
          };
          ledger.push(demotion);
          await this.trustStore.append(
            TRUST_ROLE,
            version,
            demotion,
            missionId,
            stepNumber,
            `Blocked action: ${decision.explanation}`
          );
        } else if (decision.verdict === 'REVIEW' || decision.verdict === 'APPROVAL') {
          const approval: PendingApproval = {
            id: uuidv4(),
            missionId,
            stepNumber,
            proposal,
            decision,
            agentName: agentStateBefore.name,
            status: 'pending',
            createdAt: new Date(),
          };

          this.pendingApprovals.set(approval.id, approval);
          mission.pendingApprovals.push(approval);
          mission.status = 'paused';

          await saveApproval(approval);

          // Park here until a human decides. No second loop is started.
          await this.waitForApproval(approval.id);

          const resolved = this.pendingApprovals.get(approval.id);

          if (resolved?.status !== 'approved') {
            mission.status = 'failed';
            this.recordStep(mission, {
              stepNumber,
              agentRole,
              proposal,
              decision,
              agentStateBefore,
              agentStateAfter: agentStateBefore,
              timestamp: new Date(),
            });
            return;
          }

          mission.status = 'running';

          // A human signed this spend. The evaluator may now rely on it.
          priorApprovals.push({
            vendor: proposal.payload.vendor as string | undefined,
            amount: proposal.payload.amount as number | undefined,
          });

          await this.recordClean(proposal, decision.verdict, before.currentBand, ledger, version, missionId, stepNumber);
          this.executeAction(proposal, mission.context);
        } else {
          await this.recordClean(proposal, decision.verdict, before.currentBand, ledger, version, missionId, stepNumber);
          this.executeAction(proposal, mission.context);
        }

        const after = computeBand(ledger);
        const agentStateAfter: AgentState = {
          ...agentStateBefore,
          autonomyBand: after.currentBand,
          reputation: after.reputation,
          approvedSpendCount: after.approvedSpendCount,
        };

        if (
          after.currentBand !== before.currentBand &&
          decision.verdict !== 'BLOCK' // demotion already logged above
        ) {
          // A promotion is a marker event for the audit trail. It does not feed
          // computeBand (which derives the band from clean actions), so it is not
          // pushed to the in-memory ledger — only persisted for the record.
          await this.trustStore.append(
            TRUST_ROLE,
            version,
            {
              eventType: 'PROMOTION',
              bandBefore: before.currentBand,
              bandAfter: after.currentBand,
              createdAt: new Date(),
            },
            missionId,
            stepNumber,
            `Reputation reached ${after.reputation}`
          );
        }

        const step: MissionStep = {
          stepNumber,
          agentRole,
          proposal,
          decision,
          agentStateBefore,
          agentStateAfter,
          timestamp: new Date(),
        };

        this.recordStep(mission, step);
        await saveDecision(missionId, step, mission.goal);
      } catch (error) {
        console.error(`Step ${stepNumber} failed:`, error);
        mission.status = 'failed';
        return;
      }
    }

    mission.status = 'completed';
    mission.completedAt = new Date();
  }

  private recordStep(mission: MissionStatus, step: MissionStep): void {
    mission.steps.push(step);
  }

  /** Record a clean action both in the live ledger and in the persistent store. */
  private async recordClean(
    proposal: ProposedAction,
    verdict: 'ALLOW' | 'REVIEW' | 'APPROVAL',
    band: AgentState['autonomyBand'],
    ledger: LedgerEvent[],
    version: string,
    missionId: string,
    stepNumber: number
  ): Promise<void> {
    const event: LedgerEvent = {
      eventType: 'CLEAN_ACTION',
      verdict,
      bandBefore: band,
      bandAfter: band,
      isSpendAction: SPEND_COMMITTING_ACTIONS.includes(proposal.actionType),
      createdAt: new Date(),
    };
    ledger.push(event);
    await this.trustStore.append(
      TRUST_ROLE,
      version,
      event,
      missionId,
      stepNumber,
      `Clean action: ${proposal.actionType} (${verdict})`
    );
  }

  /** Sandboxed tools. Only run once the evaluator has cleared the action. */
  private executeAction(proposal: ProposedAction, context: Record<string, unknown>): void {
    switch (proposal.actionType) {
      case 'gather_requirements':
        context.requirements = proposal.payload;
        break;
      case 'request_quotations':
        context.quotations = proposal.payload;
        break;
      case 'compare_vendors':
        context.comparison = proposal.payload;
        break;
      case 'select_supplier':
        context.selectedSupplier = proposal.payload.vendor;
        context.selectedAmount = proposal.payload.amount;
        break;
      case 'commit_spend':
        context.committedSpend = proposal.payload.amount;
        context.committedVendor = proposal.payload.vendor;
        break;
      case 'issue_purchase_order':
        context.purchaseOrder = proposal.payload;
        break;
    }
  }

  /** Parks the loop until a human resolves this approval. */
  private waitForApproval(approvalId: string): Promise<void> {
    const existing = this.pendingApprovals.get(approvalId);
    if (existing && existing.status !== 'pending') return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.approvalWaiters.set(approvalId, resolve);
    });
  }
}

export const orchestrator = new MissionOrchestrator();

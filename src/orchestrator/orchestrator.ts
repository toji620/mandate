import { v4 as uuidv4 } from 'uuid';
import {
  computeBand,
  demote,
  evaluate,
  SPEND_COMMITTING_ACTIONS,
  type LedgerEvent,
} from '@/src/engine/evaluate';
import { propose } from '@/src/agents/propose';
import type { AgentRole } from '@/src/agents/agents';
import type { AgentState, ApprovedCommitment, PolicyRule, ProposedAction } from '@/src/types';
import type { MissionConfig, MissionStatus, MissionStep, PendingApproval } from './types';
import { saveApproval, saveDecision, saveTrustLedgerEntry, updateApprovalStatus } from './persistence';

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

    /** Append-only. The band is a function of this and nothing else. */
    const ledger: LedgerEvent[] = [];

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

          ledger.push({
            eventType: 'DEMOTION',
            verdict: 'BLOCK',
            bandBefore: before.currentBand,
            bandAfter,
            createdAt: new Date(),
          });

          await saveTrustLedgerEntry(
            agentStateBefore.name,
            'demotion',
            before.currentBand,
            bandAfter,
            `Blocked action: ${decision.explanation}`,
            missionId,
            stepNumber
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

          ledger.push(this.cleanAction(proposal, decision.verdict, before.currentBand));
          this.executeAction(proposal, mission.context);
        } else {
          ledger.push(this.cleanAction(proposal, decision.verdict, before.currentBand));
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
          await saveTrustLedgerEntry(
            agentStateBefore.name,
            'promotion',
            before.currentBand,
            after.currentBand,
            `Reputation reached ${after.reputation}`,
            missionId,
            stepNumber
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

  private cleanAction(
    proposal: ProposedAction,
    verdict: 'ALLOW' | 'REVIEW' | 'APPROVAL',
    band: AgentState['autonomyBand']
  ): LedgerEvent {
    return {
      eventType: 'CLEAN_ACTION',
      verdict,
      bandBefore: band,
      bandAfter: band,
      isSpendAction: SPEND_COMMITTING_ACTIONS.includes(proposal.actionType),
      createdAt: new Date(),
    };
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

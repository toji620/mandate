import { v4 as uuidv4 } from 'uuid';
import { evaluate, computeBand, type LedgerEvent } from '@/src/engine/evaluate';
import { propose } from '@/src/agents/propose';
import type { AgentRole } from '@/src/agents/agents';
import type { ProposedAction, AgentState, PolicyRule } from '@/src/types';
import type { MissionConfig, MissionStatus, MissionStep, PendingApproval, BandTransitionEvent } from './types';

/**
 * Mission orchestrator - runs the procurement mission as a state machine
 * propose → evaluate → record → (execute | queue for approval | block)
 */
export class MissionOrchestrator {
  private missions: Map<string, MissionStatus> = new Map();
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  /**
   * Start a new mission
   */
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
      context: config.initialContext || {},
      startedAt: new Date(),
    };

    this.missions.set(missionId, mission);

    // Start execution in background
    this.executeMission(missionId, rules).catch(error => {
      console.error(`Mission ${missionId} failed:`, error);
      const m = this.missions.get(missionId);
      if (m) {
        m.status = 'failed';
      }
    });

    return missionId;
  }

  /**
   * Get mission status
   */
  getMission(missionId: string): MissionStatus | undefined {
    return this.missions.get(missionId);
  }

  /**
   * Get all missions
   */
  getAllMissions(): MissionStatus[] {
    return Array.from(this.missions.values());
  }

  /**
   * Get pending approval
   */
  getPendingApproval(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  /**
   * Get all pending approvals for a mission
   */
  getMissionApprovals(missionId: string): PendingApproval[] {
    return Array.from(this.pendingApprovals.values())
      .filter(a => a.missionId === missionId && a.status === 'pending');
  }

  /**
   * Approve a pending action
   */
  async approveAction(approvalId: string, approvedBy: string): Promise<void> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Approval not found or already resolved');
    }

    approval.status = 'approved';
    approval.resolvedAt = new Date();
    approval.resolvedBy = approvedBy;

    // Resume mission execution
    const mission = this.missions.get(approval.missionId);
    if (mission && mission.status === 'paused') {
      mission.status = 'running';
      // Continue execution
      this.executeMission(approval.missionId, []).catch(console.error);
    }
  }

  /**
   * Reject a pending action
   */
  async rejectAction(approvalId: string, rejectedBy: string): Promise<void> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Approval not found or already resolved');
    }

    approval.status = 'rejected';
    approval.resolvedAt = new Date();
    approval.resolvedBy = rejectedBy;

    // Mark mission as failed
    const mission = this.missions.get(approval.missionId);
    if (mission) {
      mission.status = 'failed';
    }
  }

  /**
   * Execute the mission loop
   */
  private async executeMission(missionId: string, rules: PolicyRule[]): Promise<void> {
    const mission = this.missions.get(missionId);
    if (!mission) return;

    // Define the agent sequence for the laptop procurement mission
    const agentSequence: AgentRole[] = [
      'sourcing',  // Step 1-3: gather requirements, request quotes, compare vendors
      'sourcing',
      'sourcing',
      'sourcing',  // Step 4: select supplier
      'procurement', // Step 5: commit spend
      'sourcing',  // Step 6: try cheaper unapproved supplier (will be blocked)
      'procurement', // Step 7: issue purchase order
    ];

    // Initialize agent state (starts in PROBATION)
    const agentState: AgentState = {
      id: 1,
      name: 'Sourcing Agent',
      role: 'sourcing',
      autonomyBand: 'PROBATION',
      cleanActionCount: 0,
      approvedSpendCount: 0,
    };

    const ledgerEvents: LedgerEvent[] = [];

    // Execute each step
    for (let i = mission.currentStep; i < agentSequence.length; i++) {
      if (mission.status !== 'running') {
        break; // Paused or failed
      }

      const stepNumber = i + 1;
      const agentRole = agentSequence[i];
      
      mission.currentStep = stepNumber;

      // Update agent state from ledger
      const bandState = computeBand(ledgerEvents);
      agentState.autonomyBand = bandState.currentBand;
      agentState.cleanActionCount = bandState.cleanActionCount;
      agentState.approvedSpendCount = bandState.approvedSpendCount;

      const agentStateBefore = { ...agentState };

      try {
        // Propose action
        const proposal = await propose(
          {
            goal: mission.goal,
            currentStep: stepNumber,
            agentState,
            context: mission.context,
          },
          mission.mode,
          mission.mode === 'live' ? agentRole : undefined
        );

        // Evaluate action
        const decision = evaluate(proposal, agentState, rules);

        // Record step
        const step: MissionStep = {
          stepNumber,
          agentRole,
          proposal,
          decision,
          agentStateBefore,
          agentStateAfter: { ...agentState },
          timestamp: new Date(),
        };

        mission.steps.push(step);

        // Handle verdict
        if (decision.verdict === 'BLOCK') {
          // Record demotion
          const transition = this.handleBlock(agentState, ledgerEvents, stepNumber);
          if (transition) {
            agentState.autonomyBand = transition.to;
          }
          
          // Update context to note the block
          mission.context.lastBlockedAction = proposal.actionType;
          mission.context.lastBlockedReason = decision.explanation;
          
        } else if (decision.verdict === 'APPROVAL' || decision.verdict === 'REVIEW') {
          // Create pending approval
          const approval: PendingApproval = {
            id: uuidv4(),
            missionId,
            stepNumber,
            actionId: 0, // Would be from DB in real implementation
            decisionId: 0,
            proposal,
            decision,
            agentName: agentState.name,
            status: 'pending',
            createdAt: new Date(),
          };

          this.pendingApprovals.set(approval.id, approval);
          mission.pendingApprovals.push(approval);
          mission.status = 'paused';

          // Wait for approval (in real implementation, this would be event-driven)
          await this.waitForApproval(approval.id);

          const resolvedApproval = this.pendingApprovals.get(approval.id);
          if (resolvedApproval?.status === 'approved') {
            // Record clean action
            this.recordCleanAction(agentState, ledgerEvents, stepNumber, decision.verdict, proposal);
            
            // Execute the action
            this.executeAction(proposal, mission.context);
          } else {
            // Rejected - stop mission
            mission.status = 'failed';
            return;
          }
          
        } else if (decision.verdict === 'ALLOW') {
          // Record clean action
          this.recordCleanAction(agentState, ledgerEvents, stepNumber, decision.verdict, proposal);
          
          // Execute the action
          this.executeAction(proposal, mission.context);
        }

        // Check for promotion
        const bandState = computeBand(ledgerEvents);
        if (bandState.currentBand !== agentState.autonomyBand) {
          agentState.autonomyBand = bandState.currentBand;
          step.agentStateAfter = { ...agentState };
        }

      } catch (error) {
        console.error(`Step ${stepNumber} failed:`, error);
        mission.status = 'failed';
        return;
      }
    }

    // Mission complete
    mission.status = 'completed';
    mission.completedAt = new Date();
  }

  /**
   * Handle a BLOCK verdict - record demotion
   */
  private handleBlock(
    agentState: AgentState,
    ledgerEvents: LedgerEvent[],
    stepNumber: number
  ): BandTransitionEvent | null {
    const currentBand = agentState.autonomyBand;
    let newBand = currentBand;

    if (currentBand === 'TRUSTED') {
      newBand = 'SUPERVISED';
    } else if (currentBand === 'SUPERVISED') {
      newBand = 'PROBATION';
    }

    if (newBand !== currentBand) {
      ledgerEvents.push({
        eventType: 'DEMOTION',
        verdict: 'BLOCK',
        bandBefore: currentBand,
        bandAfter: newBand,
        createdAt: new Date(),
      });

      return {
        agentId: agentState.id,
        from: currentBand,
        to: newBand,
        reason: 'Blocked action triggered demotion',
        stepNumber,
      };
    }

    return null;
  }

  /**
   * Record a clean action in the ledger
   */
  private recordCleanAction(
    agentState: AgentState,
    ledgerEvents: LedgerEvent[],
    stepNumber: number,
    verdict: 'ALLOW' | 'REVIEW' | 'APPROVAL',
    proposal: ProposedAction
  ): void {
    const isSpendAction = proposal.actionType === 'commit_spend' || 
                          (proposal.payload.amount !== undefined && proposal.payload.amount > 0);

    ledgerEvents.push({
      eventType: 'CLEAN_ACTION',
      verdict,
      bandBefore: agentState.autonomyBand,
      bandAfter: agentState.autonomyBand,
      isSpendAction,
      createdAt: new Date(),
    });
  }

  /**
   * Execute an action (stub - mutates mission context)
   */
  private executeAction(proposal: ProposedAction, context: Record<string, unknown>): void {
    // Stub implementation - in real system, this would call sandboxed tools
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

  /**
   * Wait for approval (polling-based for simplicity)
   */
  private async waitForApproval(approvalId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const approval = this.pendingApprovals.get(approvalId);
        if (approval && approval.status !== 'pending') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5 * 60 * 1000);
    });
  }
}

// Singleton instance
export const orchestrator = new MissionOrchestrator();

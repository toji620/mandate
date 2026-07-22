import type {
  ProposedAction,
  AgentState,
  PolicyRule,
  Decision,
  AutonomyBand,
  Verdict,
  EvaluationContext,
} from '@/src/types';

/**
 * The evaluator. Pure function: no I/O, no database, no LLM calls, no clock,
 * no randomness. Same inputs always produce the same Decision.
 *
 * The core structure is deliberate. Two checks run independently:
 *
 *   policy — what the documents permit. Band-blind. ALWAYS runs.
 *   band   — how much supervision this agent needs. Policy-blind.
 *
 * The verdict is whichever is STRICTER. A band rule therefore cannot loosen a
 * policy rule, because `strictest` will not let it — no matter what bands or
 * action types are added later. This is the SPEC guarantee made structural
 * rather than conventional:
 *
 *   "The band tightens policy, never loosens it: a TRUSTED agent still cannot
 *    exceed a spend threshold."
 *
 * Reputation buys an agent LESS SUPERVISION. It never buys MORE AUTHORITY.
 */
export function evaluate(
  action: ProposedAction,
  agentState: AgentState,
  rules: PolicyRule[],
  context: EvaluationContext = { priorApprovals: [] }
): Decision {
  const policyVerdict = checkPolicy(action, rules, context);
  const bandVerdict = checkBand(action, agentState, context);

  return strictest(policyVerdict, bandVerdict);
}

// ---------------------------------------------------------------------------
// Verdict ordering
// ---------------------------------------------------------------------------

const STRICTNESS: Record<Verdict, number> = {
  ALLOW: 0,
  REVIEW: 1,
  APPROVAL: 2,
  BLOCK: 3,
};

/** Returns whichever decision demands more human involvement. Ties go to `a`. */
export function strictest(a: Decision, b: Decision): Decision {
  return STRICTNESS[b.verdict] > STRICTNESS[a.verdict] ? b : a;
}

// ---------------------------------------------------------------------------
// Action taxonomy
// ---------------------------------------------------------------------------

/**
 * Actions that actually disburse funds when executed. Only these carry the
 * spend threshold.
 *
 * `select_supplier` is deliberately absent: choosing a supplier PROPOSES a
 * spend, it does not COMMIT one. The commitment happens at `commit_spend`.
 * This is why golden-path step 4 is REVIEW rather than APPROVAL.
 */
export const SPEND_COMMITTING_ACTIONS = ['commit_spend', 'issue_purchase_order'];

/** Read-only actions: they gather information and move no money. */
export const READ_ONLY_ACTIONS = [
  'gather_requirements',
  'request_quotations',
  'compare_vendors',
  'check_spend_threshold',
  'verify_vendor',
  'security_review',
];

// ---------------------------------------------------------------------------
// Policy layer — band-blind. What the documents permit.
// ---------------------------------------------------------------------------

function checkPolicy(
  action: ProposedAction,
  rules: PolicyRule[],
  context: EvaluationContext
): Decision {
  // An unapproved vendor is barred outright, in every band, for every action.
  const vendor = action.payload.vendor as string | undefined;
  if (vendor !== undefined) {
    const vendorRules = rules.filter((r) => r.ruleType === 'VENDOR_APPROVAL');
    const approvedVendors = vendorRules.map((r) => r.appliesTo);

    if (vendorRules.length > 0 && !approvedVendors.includes(vendor)) {
      const citedRule = vendorRules[0];
      return {
        verdict: 'BLOCK',
        ruleId: citedRule.id,
        explanation: `Vendor "${vendor}" is not on the approved vendor list`,
        sourcePassage: citedRule.sourcePassage,
      };
    }

    // A vendor can be on the approved list yet temporarily SUSPENDED — e.g.
    // pending a security audit. Using one is barred until the suspension lifts.
    // This is enforcement the agent cannot reason its way around: the list has a
    // state the agent never sees, so a perfectly sensible supplier choice is
    // still stopped. Checked after approval, so an unapproved vendor is named as
    // such rather than as merely suspended.
    const suspension = rules.find(
      (r) => r.ruleType === 'VENDOR_SUSPENSION' && r.appliesTo === vendor
    );
    if (suspension) {
      return {
        verdict: 'BLOCK',
        ruleId: suspension.id,
        explanation: `Vendor "${vendor}" is currently suspended and cannot be used`,
        sourcePassage: suspension.sourcePassage,
      };
    }
  }

  // Equipment that needs a security sign-off cannot proceed without one.
  const requiresSecurityReview = action.payload.requiresSecurityReview as boolean | undefined;
  const hasSecurityReview = action.payload.hasSecurityReview as boolean | undefined;

  if (requiresSecurityReview === true && hasSecurityReview !== true) {
    const securityRule = rules.find((r) => r.ruleType === 'SECURITY_REQUIREMENT');
    return {
      verdict: 'BLOCK',
      ruleId: securityRule?.id,
      explanation: 'Action requires security review but none has been completed',
      sourcePassage: securityRule?.sourcePassage ?? 'Security requirements must be met',
    };
  }

  // Money over the threshold must reach a human — unless a human already
  // approved this exact commitment, in which case executing it is paperwork,
  // not a new decision.
  if (SPEND_COMMITTING_ACTIONS.includes(action.actionType)) {
    const amount = readAmount(action.payload);

    if (amount === undefined) {
      // The action moves money but did not say how much, so it CANNOT be checked
      // against the threshold. Fail closed: unverifiable is not the same as
      // permitted. This previously fell through to ALLOW, which meant an agent
      // could evade the threshold entirely by naming the field something else —
      // exactly what Granite did when it wrote "amountGBP".
      const thresholdRule = rules.find((r) => r.ruleType === 'SPEND_THRESHOLD');
      return {
        verdict: 'APPROVAL',
        ruleId: thresholdRule?.id,
        explanation:
          `${action.actionType} commits funds but declared no numeric "amount", so it ` +
          'cannot be checked against the spend threshold and must be approved by a human',
        sourcePassage: thresholdRule?.sourcePassage ?? 'Spend thresholds require a stated amount',
      };
    }

    {
      // When several thresholds are crossed (e.g. GBP 10,000 -> Finance Director
      // AND GBP 50,000 -> CFO), the binding one is the HIGHEST. Cite that, so the
      // decision names the approver who actually has to sign.
      const spendRule = rules
        .filter(
          (r) =>
            r.ruleType === 'SPEND_THRESHOLD' &&
            r.thresholdValue !== undefined &&
            amount >= r.thresholdValue
        )
        .sort((a, b) => (b.thresholdValue ?? 0) - (a.thresholdValue ?? 0))[0];

      if (spendRule) {
        if (hasMatchingApproval(action, context)) {
          return {
            verdict: 'ALLOW',
            ruleId: spendRule.id,
            explanation:
              `Executes a commitment of ${amount} ${spendRule.currency ?? 'GBP'} to ` +
              `"${action.payload.vendor}" that a human has already approved`,
            sourcePassage: spendRule.sourcePassage,
          };
        }

        return {
          verdict: 'APPROVAL',
          ruleId: spendRule.id,
          explanation:
            `Spend of ${amount} ${spendRule.currency ?? 'GBP'} meets or exceeds the ` +
            `${spendRule.thresholdValue} ${spendRule.currency ?? 'GBP'} threshold and ` +
            `has not been approved by a human`,
          sourcePassage: spendRule.sourcePassage,
        };
      }
    }
  }

  return { verdict: 'ALLOW', explanation: 'Action is within policy' };
}

/**
 * Reads a spend amount that can actually be compared against a threshold.
 *
 * Anything that is not a finite number — missing, misnamed, a string, NaN —
 * comes back undefined, and every caller treats undefined as "cannot verify"
 * rather than "no limit applies".
 */
function readAmount(payload: Record<string, unknown>): number | undefined {
  const raw = payload.amount;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * True when a human has already approved this exact spend.
 *
 * Three conditions, all required:
 *
 *  1. The approval was granted on an action that ACTUALLY COMMITS MONEY. A human
 *     approving `select_supplier` chose a supplier; they did not authorise a
 *     spend, and their click must not be redeemable as one.
 *  2. Vendor and amount are both actually present on this action. A spend that
 *     identifies neither is never pre-approved — otherwise `undefined ===
 *     undefined` lets a blank approval satisfy a blank spend.
 *  3. Vendor and amount match exactly, so an agent cannot inflate the sum or
 *     swap the supplier after the approval was granted.
 */
function hasMatchingApproval(action: ProposedAction, context: EvaluationContext): boolean {
  const vendor = action.payload.vendor;
  const amount = readAmount(action.payload);

  if (typeof vendor !== 'string' || amount === undefined) return false;

  return context.priorApprovals.some(
    (approved) =>
      SPEND_COMMITTING_ACTIONS.includes(approved.actionType) &&
      approved.vendor === vendor &&
      approved.amount === amount
  );
}

// ---------------------------------------------------------------------------
// Band layer — policy-blind. How closely this agent is watched.
// ---------------------------------------------------------------------------

function checkBand(
  action: ProposedAction,
  agentState: AgentState,
  context: EvaluationContext
): Decision {
  // Executing a commitment a human already signed off does not need watching
  // again. Re-asking is the alarm-fatigue failure: it trains approvers to click
  // through without reading.
  if (
    SPEND_COMMITTING_ACTIONS.includes(action.actionType) &&
    hasMatchingApproval(action, context)
  ) {
    return {
      verdict: 'ALLOW',
      explanation: 'Executes a commitment already approved by a human',
    };
  }

  const isReadOnly = READ_ONLY_ACTIONS.includes(action.actionType);

  switch (agentState.autonomyBand) {
    case 'PROBATION':
      // A new or demoted agent has earned nothing. Only reads go unwatched.
      if (isReadOnly) {
        return {
          verdict: 'ALLOW',
          explanation: 'Read-only action, no commercial effect',
        };
      }
      return {
        verdict: 'APPROVAL',
        explanation:
          'Agent is in the PROBATION band — every action with commercial effect requires approval',
      };

    case 'SUPERVISED':
      // Low-risk work runs unwatched; anything commercial gets a human eye.
      if (isReadOnly) {
        return {
          verdict: 'ALLOW',
          explanation: 'Read-only action, no commercial effect',
        };
      }
      return {
        verdict: 'REVIEW',
        explanation: 'Commercial action requires review in the SUPERVISED band',
      };

    case 'TRUSTED':
      // Trust removes supervision. It does not remove policy — the policy layer
      // has already run, and `strictest` will override this if policy says so.
      return {
        verdict: 'ALLOW',
        explanation: 'Agent is TRUSTED — routine work proceeds without supervision',
      };
  }
}

// ---------------------------------------------------------------------------
// Reputation and autonomy bands
// ---------------------------------------------------------------------------

/**
 * Reputation needed to climb each band.
 *
 * NOTE ON THE SPEC: SPEC.md contradicts itself here. The band-transition table
 * says 5 clean actions promote PROBATION -> SUPERVISED, while the golden-path
 * table says the promotion fires at step 3. Both cannot hold in a 7-step
 * mission. The golden path wins, because it is both the CI gate and the demo,
 * and SPEC.md itself says "if a feature cannot survive the golden-path test, it
 * does not ship." Hence 3.
 */
export const PROMOTION_THRESHOLDS = {
  PROBATION_TO_SUPERVISED: 3,
  // Reachable inside one flawless seven-step mission (which yields 7 clean actions,
  // two of them approved spends). At 10 the top band was unreachable in practice:
  // a mission caps at 7 clean actions and any block resets reputation to zero, so
  // no agent ever demonstrated TRUSTED. The spend requirement stays at 2, so the
  // band is still earned by repeated responsible spending, not a single purchase.
  SUPERVISED_TO_TRUSTED: 6,
  SUPERVISED_TO_TRUSTED_SPENDS: 2,
} as const;

export interface LedgerEvent {
  eventType: 'PROMOTION' | 'DEMOTION' | 'CLEAN_ACTION';
  verdict?: Verdict;
  bandBefore: AutonomyBand;
  bandAfter: AutonomyBand;
  isSpendAction?: boolean;
  createdAt: Date;
}

export interface BandState {
  currentBand: AutonomyBand;
  /** Standing with the system. Earned one action at a time; wiped by a BLOCK. */
  reputation: number;
  approvedSpendCount: number;
  /** Career total. Never reset — for display and audit only, never for permissions. */
  lifetimeCleanActions: number;
}

/**
 * Derives an agent's current band by replaying its trust ledger.
 *
 * Pure and deterministic: the same ledger always yields the same band, which is
 * what makes the band auditable rather than merely asserted.
 *
 * Reputation rises by one per clean action and is RESET TO ZERO by a BLOCK.
 * That reset is what gives a demotion teeth: without it, an agent that had
 * already banked enough reputation would re-promote on its very next action,
 * and the demotion would evaporate one step after it was imposed.
 */
export function computeBand(ledgerEvents: LedgerEvent[]): BandState {
  let currentBand: AutonomyBand = 'PROBATION';
  let reputation = 0;
  let approvedSpendCount = 0;
  let lifetimeCleanActions = 0;

  for (const event of ledgerEvents) {
    if (event.eventType === 'CLEAN_ACTION') {
      reputation++;
      lifetimeCleanActions++;

      if (event.isSpendAction && (event.verdict === 'APPROVAL' || event.verdict === 'ALLOW')) {
        approvedSpendCount++;
      }

      if (
        currentBand === 'PROBATION' &&
        reputation >= PROMOTION_THRESHOLDS.PROBATION_TO_SUPERVISED
      ) {
        currentBand = 'SUPERVISED';
      }

      if (
        currentBand === 'SUPERVISED' &&
        reputation >= PROMOTION_THRESHOLDS.SUPERVISED_TO_TRUSTED &&
        approvedSpendCount >= PROMOTION_THRESHOLDS.SUPERVISED_TO_TRUSTED_SPENDS
      ) {
        currentBand = 'TRUSTED';
      }
    } else if (event.eventType === 'DEMOTION') {
      currentBand = demote(currentBand);

      // A block costs the agent its standing. It must earn the band back.
      reputation = 0;
      approvedSpendCount = 0;
    } else if (event.eventType === 'PROMOTION') {
      currentBand = event.bandAfter;
    }
  }

  return { currentBand, reputation, approvedSpendCount, lifetimeCleanActions };
}

/** One band down. PROBATION is the floor. */
export function demote(band: AutonomyBand): AutonomyBand {
  if (band === 'TRUSTED') return 'SUPERVISED';
  if (band === 'SUPERVISED') return 'PROBATION';
  return 'PROBATION';
}

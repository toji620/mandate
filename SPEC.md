# MANDATE — Build Specification (v3, July 13 2026)

Machine-readable spec for coding sessions. This is the source of truth for what to
build, in what order, and what is out of scope. The pitch document (MANDATE-v3.pdf)
covers positioning and judging; do not take build instructions from it.

## What Mandate is

A policy-to-permission control plane for AI agents. AI agents propose business
actions; a deterministic evaluator authorises each proposal against extracted policy
rules and the agent's earned autonomy band; every decision is recorded in an
append-only log that doubles as the trust ledger.

Core principle: **AI where judgment is needed, determinism where authority is
exercised.** LLMs propose and explain. They never decide.

## Stack (locked, do not substitute)

- Next.js 15, App Router, TypeScript, ESLint, Vitest
- PostgreSQL 16 via docker-compose, Drizzle ORM, drizzle-kit migrations
- IBM Granite via the watsonx.ai SDK for: agent proposals, policy rule extraction,
  decision explanations
- Docling for offline policy-document parsing (output committed to repo, never run
  at request time)
- GitHub Actions CI: lint + full Vitest suite on every push
- No LangFlow. LangChain/LangGraph not adopted (plain TypeScript state machine chosen for orchestrator simplicity and maintainability).

## Domain model (Drizzle schemas)

| Table | Columns |
|---|---|
| agents | id, name, role, autonomy_band |
| policies | id, title, source_document, section_ref |
| policy_rules | id, policy_id, rule_type, threshold_value, currency, applies_to, source_passage |
| approvers | id, name, role, approval_scope |
| actions | id, agent_id, action_type, payload_json, risk_class |
| decisions | id, action_id, verdict, rule_id, explanation, decided_at |
| trust_ledger | id, agent_id, event_type, decision_id, band_before, band_after, created_at |

`trust_ledger` is append-only: no UPDATE or DELETE paths anywhere in the codebase.
`source_passage` on policy_rules exists so the UI can display the exact cited policy
sentence next to every decision.

## The evaluator (the product)

`src/engine/evaluate.ts`

```
evaluate(action: ProposedAction, agentState: AgentState, rules: PolicyRule[]) -> Decision
```

Hard constraints:

- Pure function. No I/O, no database access, no LLM calls, no Date.now(), no
  randomness. Same inputs always produce the same Decision.
- Verdicts: `ALLOW | REVIEW | APPROVAL | BLOCK`
- Reads the agent's autonomy band as an input. The band tightens policy, never
  loosens it: a TRUSTED agent still cannot exceed a spend threshold; a PROBATION
  agent cannot be approved into a policy violation.
- Every Decision carries the id of the rule that fired and the source_passage for
  citation display.

### Structure: policy and band are separate, and the stricter one wins

```
evaluate(action, agentState, rules, context):
    policyVerdict = checkPolicy(action, rules, context)   # band-blind, ALWAYS runs
    bandVerdict   = checkBand(action, agentState, context) # policy-blind
    return strictest(policyVerdict, bandVerdict)           # BLOCK > APPROVAL > REVIEW > ALLOW
```

The band does not choose which policy checks run. Policy runs on every action in
every band, and the band's answer is combined by taking whichever demands more
human involvement. A band rule therefore **cannot** loosen a policy rule — not by
oversight, not by a new special case, not by a band added later. The guarantee is
structural, not a convention to be remembered.

This matters because the earlier design put the threshold check inside each band
branch, and one branch omitted it: a PROBATION agent could issue a GBP 22,400
purchase order with verdict ALLOW and no rule cited. `src/engine/invariants.test.ts`
now asserts the property across every band x every action type.

### Autonomy bands

Reputation buys an agent **less supervision**. It never buys **more authority**.

| Band | Meaning |
|---|---|
| PROBATION | Read-only actions run; anything with commercial effect needs approval |
| SUPERVISED | Read-only actions run; anything with commercial effect needs review |
| TRUSTED | Routine work runs unsupervised; policy limits still apply in full |

### Reputation and band transitions (deterministic, computed from trust_ledger)

- All new agents start in PROBATION with reputation 0.
- Every clean action earns +1 reputation.
- Reputation 3 promotes PROBATION -> SUPERVISED.
- Reputation 10 including 2 approved spend events promotes SUPERVISED -> TRUSTED.
- Any BLOCK demotes exactly one band, instantly, **and resets reputation to 0.**

The reset is what gives a demotion teeth. Without it an agent that had already
banked enough reputation re-promoted on its very next action, so the demotion
evaporated one step after it was imposed — and Mission Control rendered a
PROMOTION seconds after the agent was caught proposing an unapproved vendor.

A lifetime clean-action count is kept alongside reputation for display and audit.
It never affects permissions.

**Note on the threshold (3, not 5):** the band table above and the golden-path
table below used to contradict each other — the former said 5 clean actions, the
latter fired the promotion at step 3, and both cannot hold in a 7-step mission.
The golden path wins, because it is the CI gate and the demo, and because this
document says a feature that cannot survive it does not ship.

### Executing an approved commitment

A purchase order that merely executes a spend a human already approved is ALLOWed
without asking again — re-asking is the alarm-fatigue failure, which trains
approvers to click through without reading.

The evaluator therefore takes the mission's approval history as an input and
matches on vendor **and** amount exactly. An agent cannot skip to the paperwork:
a PO for money nobody approved requires approval, and a PO cannot inflate the
amount or swap the vendor after the fact. Approvals are supplied by the
orchestrator and are never self-reported by the agent.

## Agents (three, Granite-backed)

| Agent | Responsibility |
|---|---|
| Sourcing Agent | Requirements gathering, quotations, vendor comparison, supplier selection |
| Compliance Agent | Finance and security checks |
| Procurement Agent | Purchase order preparation |

Each agent implements one interface:

```
propose(missionState: MissionState) -> ProposedAction
```

Two implementations behind that interface:

- **live**: calls Granite via watsonx.ai SDK with the mission goal, current state,
  and agent role; returns a structured action proposal.
- **replay**: serves recorded proposal fixtures from `data/fixtures/`. Used by CI
  and the demo video. Fixtures are recorded from the best live run during Stage 3.

Fixed toolset per agent. No dynamic tool discovery. Sandboxed tools execute only
after the evaluator returns ALLOW (or an approval resolves REVIEW/APPROVAL).

The Sourcing Agent's prompt deliberately includes cost pressure so that live runs
genuinely propose the cheaper unapproved supplier, which the evaluator must BLOCK.

## The golden-path scenario (CI gate)

`src/engine/golden-path.test.ts` walks this exact mission and must pass in CI
before any demo recording. Mission: purchase 20 developer laptops for under
GBP 25,000, delivered by Friday.

| # | Proposed action | Expected verdict | Expected side effect |
|---|---|---|---|
| 1 | Gather requirements | ALLOW | PROBATION, reputation 1 |
| 2 | Request quotations | ALLOW | reputation 2 |
| 3 | Compare approved vendors | ALLOW | reputation 3 -> promotion: PROBATION -> SUPERVISED |
| 4 | Select preferred supplier | REVIEW | requires confirmation at SUPERVISED |
| 5 | Commit GBP 22,400 | APPROVAL | threshold GBP 10,000, Finance Approval Matrix s2.1 |
| 6 | Use cheaper unapproved supplier | BLOCK | demotion: SUPERVISED -> PROBATION, reputation reset to 0 |
| 7 | Issue purchase order | ALLOW | executes the approved GBP 22,400 commitment; **stays PROBATION** |

Step 7 is ALLOWed because a human approved that exact spend at step 5, not because
purchase orders are waved through. And the agent stays demoted: the reputation
reset at step 6 means it cannot bounce back to SUPERVISED on the next clean action.

Evaluator tests (including this one) must run with no database connection and no
network. Use replay-mode proposals. The golden-path test drives the same
`evaluate()` and `computeBand()` the running app uses — it must never test a
parallel or deprecated code path.

## Seed data

`data/seed/` holds four policy documents (JSON, parsed offline via Docling and
human-reviewed): procurement policy, finance approval matrix (GBP 10,000 approval
threshold, s2.1), approved vendor list, security requirements. `npm run db:seed`
loads them into Postgres.

The Policy Library, the Flight Recorder and the mission runner all read the rules
from Postgres, falling back to these same seed documents when Postgres is not
running. Both screens display which source they are reading, so a forgotten
`docker compose up` degrades visibly rather than silently.

**Postgres runs on host port 5433, not 5432.** A locally-installed PostgreSQL
commonly already holds 5432 and silently shadows the container, so connections
land in the wrong database and fail to authenticate.

## UI (four screens, build LAST, in this order)

1. **Policy Library**: extracted rules with thresholds, vendors, and source
   citations visible.
2. **Mission Control**: live decision feed; each row shows agent, proposal, verdict,
   fired rule, and a trust-band chip; promotion/demotion render as live events.
3. **Approval Inbox**: pending REVIEW/APPROVAL items; approving visibly unlocks the
   workflow.
4. **Flight Recorder**: replay any decision with agent, proposal, rule, approver,
   and the exact source passage highlighted.

Stretch (feature-flagged, only if screens 1-4 are done by July 25): Policy Change
Simulator (edit a threshold, see permissions recalculate for in-flight work).

## Do not build

No universal governance platform. No live procurement or payment integrations. No
drag-and-drop workflow builder. No policy authoring suite. No second business
domain. No graph visualisation. No auth system (single demo user is fine). One
flawless procurement journey, four screens.

## Stages and acceptance criteria

| Stage | Dates | Done when |
|---|---|---|
| 1. Foundation | July 13 | App scaffolded; docker-compose + Drizzle schemas migrate cleanly; evaluator stub + golden-path test skeleton exist; CI runs lint + tests on push; README and BOB_USAGE.md skeletons committed; repo public |
| 2. Engine | July 14-17 | Evaluator complete with band transitions; golden-path test green in CI; Granite explanation generation works via watsonx.ai SDK |
| 3. Agents | July 18-22 | Live propose() runs the full mission with Granite; best-run fixtures committed; Mission Control + Approval Inbox functional; LangGraph adopt/skip decided July 18 |
| 4. Evidence | July 23-25 | Policy Library citations; Flight Recorder replay; promotion/demotion events render live; stretch simulator only if all green |
| 5. Story | July 26-28 | README finalised (problem, solution, AI approach/architecture, wildcard theme, Bob usage, impact stats with citations); video recorded, two takes, replay mode |
| 6. Buffer | July 29-30 | Fixes only; submit July 30; nothing new after July 28 |

## Process rules

- Work in the current stage only. Do not start a later stage's work early unless
  the current stage's acceptance criteria are all met.
- After every session, append a row to BOB_USAGE.md: date, session goal, what was
  produced, what was kept or changed.
- If a feature cannot survive the golden-path test, it does not ship.

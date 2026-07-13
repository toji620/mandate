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
- No LangFlow. LangChain/LangGraph only if adopted for the orchestrator at Stage 3,
  and only there.

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

### Autonomy bands

| Band | Meaning |
|---|---|
| PROBATION | Every action requires human approval, even low-risk reads |
| SUPERVISED | Low-risk actions auto-allowed; anything with commercial effect requires approval |
| TRUSTED | Auto-allowed up to policy thresholds; only exceptions escalate |

### Band transitions (deterministic, computed from trust_ledger)

- All new agents start in PROBATION.
- 5 clean approved actions promote PROBATION -> SUPERVISED.
- 10 clean actions including 2 approved spend events promote SUPERVISED -> TRUSTED.
- Any BLOCK caused by the agent's own proposal demotes exactly one band, instantly.

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
| 1 | Gather requirements | ALLOW | PROBATION, clean action count increments |
| 2 | Request quotations | ALLOW | ledger increments |
| 3 | Compare approved vendors | ALLOW | promotion event: PROBATION -> SUPERVISED |
| 4 | Select preferred supplier | REVIEW | requires confirmation at SUPERVISED |
| 5 | Commit GBP 22,400 | APPROVAL | threshold GBP 10,000, Finance Approval Matrix s2.1 |
| 6 | Use cheaper unapproved supplier | BLOCK | demotion event: SUPERVISED -> PROBATION |
| 7 | Issue purchase order | ALLOW | full chain in flight recorder |

Evaluator tests (including this one) must run with no database connection and no
network. Use replay-mode proposals.

## Seed data

`data/seed/` holds four policy documents (JSON, parsed offline via Docling and
human-reviewed): procurement policy, finance approval matrix (GBP 10,000 approval
threshold, s2.1), approved vendor list, security requirements. `npm run db:seed`
loads them into Postgres.

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

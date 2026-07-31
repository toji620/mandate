# Mandate

Policy-to-permission control plane for AI agents.

## Problem Statement

Modern AI agents operate with increasing autonomy in business environments, yet organisations lack systematic ways to ensure these agents respect policy boundaries while maintaining operational efficiency. Current approaches either grant blanket permissions (risking policy violations) or require manual approval for every action (eliminating the benefits of automation).

Mandate addresses this gap by providing a deterministic control plane that evaluates agent proposals against extracted policy rules and earned trust levels, creating an auditable decision trail while enabling graduated autonomy.

## Solution Description

Mandate is a policy-to-permission control plane where:

- **AI agents propose** business actions (sourcing, compliance checks, procurement)
- **A deterministic evaluator authorises** each proposal against policy rules and the agent's autonomy band
- **Every decision is recorded** in an append-only trust ledger that doubles as the audit trail

Core principle: **AI where judgment is needed, determinism where authority is exercised.** LLMs (IBM Granite) propose and explain. They never decide.

The system implements graduated autonomy through three bands. The rule that shapes
all three: **reputation buys an agent less supervision, never more authority.**

| Band | Read-only actions | Actions with commercial effect |
|---|---|---|
| **PROBATION** | run unwatched | require **approval** |
| **SUPERVISED** | run unwatched | require **review** |
| **TRUSTED** | run unwatched | run unsupervised — policy limits still apply in full |

A TRUSTED agent still cannot exceed a spend threshold, and a PROBATION agent cannot
be approved into a policy violation. That is structural, not a convention: policy and
band are evaluated independently and combined by taking whichever demands more human
involvement, so a band rule cannot loosen a policy rule even if a new band is added
later ([`src/engine/evaluate.ts`](src/engine/evaluate.ts)).

Agents earn promotion through clean execution and are demoted instantly on a policy
violation — **and the violation resets reputation to zero.** Without that reset a
well-behaved agent re-promotes on its very next action, so the demotion evaporates one
step after it was imposed.

## AI Approach and Architecture

### Architecture

```
┌─────────────────┐
│  AI Agents      │  (Granite via watsonx.ai SDK)
│  - Sourcing     │  Propose actions based on mission context
│  - Compliance   │
│  - Procurement  │
└────────┬────────┘
         │ ProposedAction
         ▼
┌─────────────────┐
│  Evaluator      │  Pure function (no I/O, no LLM calls)
│  (evaluate.ts)  │  Applies policy rules + autonomy band
└────────┬────────┘
         │ Decision (ALLOW | REVIEW | APPROVAL | BLOCK)
         ▼
┌─────────────────┐
│  Trust Ledger   │  Append-only log
│  (PostgreSQL)   │  Records decisions + band transitions
└─────────────────┘
```

### AI Components

1. **Agent Proposals** (IBM Granite via watsonx.ai SDK)
   - Structured action generation based on mission state
   - Cost-optimisation prompts that deliberately test policy boundaries
   - Runs live with a watsonx key (`npm run mission:live`); CI and the demo use
     recorded fixtures in replay mode, so the app runs fully without a key.

2. **Policy Document Parsing** (IBM Docling)
   - Offline parsing of the source policy PDFs in `data/policies/` (`npm run policies:parse`)
   - Every rule's `sourcePassage` is verified to appear verbatim in the
     Docling-parsed text, so citations provably trace back to a real document
   - Runs once, offline, never at request time; output committed to `data/seed/`

3. **Decision Explanations** (IBM Granite)
   - Natural-language gloss on each verdict, shown next to the deterministic
     reason on the Flight Recorder — it explains, it never overrides
   - Live text needs a watsonx key; without one, a fixture explanation is shown
     and labelled as such

4. **The audit trail is a training set** (`src/training/`)
   - The evaluator is a deterministic reward function: it labels every proposal
     ALLOW / REVIEW / APPROVAL / BLOCK, for free, with no human in the loop.
     Labelled preference data is the expensive ingredient in fine-tuning, and
     Mandate emits it as a byproduct of governing.
   - `npm run export:training` turns those labels into DPO-style preference pairs:
     a blocked proposal is the `rejected` completion, and the agent's own later
     permitted proposal of the same action type is the `chosen` one — the
     correction it made after being told which rule it broke.
   - Pairs are only emitted where a genuine same-action correction exists. Blocks
     without one are **skipped and counted**, so the export reports how much of the
     trail was usable rather than padding the dataset with mismatched examples.
   - `scripts/training-report.ts` scores a run by verdict mix and highest band
     reached, and compares two runs — the before/after a fine-tune would have to
     beat. It spends no credits. Tuning runs are recorded in an append-only
     logbook (`data/training/runs.jsonl`) carrying the dataset fingerprint, cost
     and both scores.
   - The loop is batch-triggered: every `TUNE_WINDOW` evaluator decisions
     (default 500), the next tuning generation is due. `npm run tune:status`
     reports the window; `npm run tune:status -- --plan "..."` cuts the next
     generation as a `planned` record, fingerprinted against the exported
     dataset. The first generation is cut and recorded; the weight update
     itself is gated on a paid watsonx.ai plan (Lite does not run tuning
     experiments) and is stated as such rather than simulated. One honest
     property of this design: N decisions are not N pairs — a well-behaved
     agent starves its own training set, so each generation needs a wider
     window as the agent improves.

5. **Trust that survives the mission** (`src/trust/`)
   - Reputation is not a memory the model carries; it is a **test record for an
     agent configuration**, keyed by a hash of role + model id + prompt.
   - Change the model or the prompt and the version changes, so the evidence does
     not carry over and the agent re-earns its autonomy from PROBATION. A tuned
     model is a different program and is treated as one.

### Key Design Decisions

- **Deterministic evaluator**: Same inputs always produce same decision. No LLM calls in the critical path.
- **Append-only ledger**: Trust history is immutable. Band transitions are computed, not edited.
- **Replay mode**: Recorded fixtures enable CI testing without network dependencies or LLM costs.
- **Source passage tracking**: Every rule links back to the exact policy sentence for auditability.

## Selected Challenge Theme

**Wildcard: Intelligent Systems for the Future of Work**

Mandate demonstrates how AI agents can be safely integrated into business workflows through:
- Graduated autonomy that adapts to demonstrated reliability
- Policy-aware decision-making that respects organisational boundaries
- Transparent audit trails that enable human oversight without bottlenecks
- Deterministic authorisation that separates AI judgment from authority

This approach enables organisations to deploy AI agents in procurement, compliance, and other business functions while maintaining control, auditability, and policy compliance.

## How IBM Bob Was Used

IBM Bob (Bob Shell) was instrumental in scaffolding and implementing this project:

1. **Project Setup**: Bob scaffolded the Next.js 15 + TypeScript application with proper configuration for ESLint, Vitest, and the App Router.

2. **Database Architecture**: Bob created the PostgreSQL docker-compose setup with healthchecks, configured Drizzle ORM with all seven domain schemas, and ensured the trust_ledger is properly constrained as append-only.

3. **Core Engine**: Bob implemented the pure evaluator function with band transition logic, ensuring no I/O, database calls, or non-deterministic behaviour.

4. **Testing Infrastructure**: Bob created the golden-path test suite that validates the full 7-step procurement mission without requiring database or network access.

5. **Seed Data**: Bob generated realistic policy documents (finance approval matrix, procurement policy, approved vendor list, security requirements) with proper source passages and thresholds.

6. **CI/CD**: Bob configured GitHub Actions to run linting and tests on every push, ensuring code quality gates are enforced.

See BOB_USAGE.md for detailed session logs.

## Impact

Every figure below is checkable from a clone of this repository. The command or file
that produces it is named next to it, because a governance tool that asks to be taken
on trust has argued against itself.

| Measure | Figure | Verify with |
|---|---|---|
| Policy documents parsed offline by Docling | 4 | `data/policies/*.pdf` |
| Machine-readable rules extracted from them | 12 | `data/seed/*.json` |
| Rules whose citation traces **verbatim** to its source document | **12 / 12** | `npm run policies:parse` |
| Automated tests | 127, in 14 files | `npm test` |
| Safety properties swept across every band × action type | 8 | `src/engine/invariants.test.ts` |
| Steps in the governed mission that is also the CI gate | 7 | `src/engine/golden-path.test.ts` |
| LLM calls on the authorisation path | **0** | `src/engine/evaluate.ts` — pure, no I/O |
| Human annotation needed to build the training set | **0** | `npm run export:training` |

**Citation integrity is enforced, not asserted.** `npm run policies:parse` re-parses
the source PDFs with Docling and fails if any rule cites a sentence that does not
appear in its document. It has teeth: it caught a vendor-suspension rule added on
2026-07-25 whose cited addendum did not exist in the source PDF. The document was
corrected to match the citation, and the check now passes 12/12. Every policy citation
shown in the UI traces to a real sentence in a real document.

**The audit trail pays for itself twice.** The same evaluator decisions that authorise
each action are also, at no extra cost, labelled training data — 4 verdict classes
applied to every proposal with no human annotator. Labelling is the expensive half of
preference tuning, and here it is a byproduct of governing rather than a separate
project.

**Where the approach earned its keep.** Rewriting the evaluator so policy and band are
evaluated independently (rather than letting the band choose which policy checks ran)
surfaced two live safety defects that the test suite had been certifying as correct: a
GBP 22,400 purchase order returning ALLOW in the PROBATION band with no rule cited, and
a demotion that evaporated on the agent's next clean action because reputation was
never reset. Both are now invariants swept across every band and action type. See the
2026-07-14 entry in [BOB_USAGE.md](BOB_USAGE.md).

> **Note for judges on scope:** the figures above measure this implementation, not
> market outcomes. No industry or cost-saving statistics are cited here because none
> were independently sourced for this submission, and inventing them would undercut
> the point the project is making.

## Running the Project

### Prerequisites

- **Node.js 20+** and **Docker** — required
- **Python 3.11** — only for the optional Docling step
- A **watsonx.ai API key** — only for live Granite; the app runs fully without one

### Quick start (clone to running app)

```bash
git clone <repository-url> && cd mandate
npm install            # Node dependencies
cp .env.example .env    # DB credentials work out of the box
npm run db:up           # PostgreSQL 16 in Docker, on host port 5433
npm run db:migrate      # create the tables
npm run db:seed         # load the 4 policy documents (12 rules)
npm run dev             # http://localhost:3000
```

That is everything needed to see the full app — Policy Library, Mission Control,
Approval Inbox, Flight Recorder — reading real PostgreSQL. Missions run in replay
mode off committed fixtures, so **no API key is required**.

> **Port note:** PostgreSQL is published on host port **5433**, not the usual
> 5432, so it does not collide with a locally-installed PostgreSQL (a common
> source of silent auth failures). `.env.example` is already set to 5433;
> override `POSTGRES_PORT` if that port is taken too.

### Tests

No database, Docker, or API key needed — the evaluator and golden-path tests run
with no network by design:

```bash
npm test           # full Vitest suite, runs once and exits (127 tests)
npm run test:watch # re-runs on file changes, for development
npm run lint
```

### Live Granite (optional — needs a watsonx key)

Set `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` in `.env`, then:

```bash
npm run mission:live      # run the mission with Granite proposing each action
npm run export:training   # export the evaluator-labelled preference dataset
```

### Docling policy parsing (optional — offline, one-time)

Docling is a Python tool, so it uses its own virtual environment (never committed,
like `node_modules`). Use a **fresh venv** so it cannot collide with a broken
global Python install:

```bash
python -m venv .venv

# Windows
.venv/Scripts/pip install -r scripts/docling/requirements.txt
.venv/Scripts/python scripts/docling/make_pdfs.py   # generate the source policy PDFs
.venv/Scripts/python scripts/docling/extract.py     # verify every citation

# macOS/Linux
# .venv/bin/pip install -r scripts/docling/requirements.txt
# .venv/bin/python scripts/docling/make_pdfs.py
# .venv/bin/python scripts/docling/extract.py
```

The venv interpreter is named explicitly rather than relying on `python`. The
shorthands `npm run policies:pdf` and `npm run policies:parse` run the same two
scripts, but they invoke a bare `python`, so they only reach Docling once the venv
is **activated**. Installing into `.venv` and then running the npm script without
activating it silently uses the global interpreter — which is how this fails with a
`ConversionError` on a machine that has some other Docling already installed.

For the exact versions this was verified against, use
`scripts/docling/requirements.lock.txt` instead.

### Database management

- **Start / stop**: `npm run db:up` / `npm run db:down`
- **Migrate**: `npm run db:migrate`
- **Seed**: `npm run db:seed`
- **Reset** (fresh DB — recreates the container and re-seeds): `npm run db:reset`

## Project Structure

```
mandate/
├── app/                       # Next.js App Router — the four screens
│   ├── policies/              #   Policy Library — rules with source citations
│   ├── mission/               #   Mission Control — live decision feed
│   ├── approvals/             #   Approval Inbox — pending REVIEW/APPROVAL
│   ├── recorder/              #   Flight Recorder — replay any decision
│   ├── components/            #   shared navigation
│   └── api/                   #   missions, approvals, policies, decisions
├── db/
│   ├── schema.ts              # Drizzle ORM schemas (7 tables)
│   └── migrations/
├── src/
│   ├── engine/
│   │   ├── evaluate.ts        # The product: pure evaluator, no I/O
│   │   ├── golden-path.test.ts    # CI gate — the 7-step mission
│   │   └── invariants.test.ts     # safety swept across band × action type
│   ├── agents/                # three Granite-backed roles, briefing, retry
│   ├── orchestrator/          # mission state machine + Postgres persistence
│   ├── granite/               # shared watsonx.ai client
│   ├── policies/              # rule loading, Postgres with seed-file fallback
│   ├── trust/                 # agent-configuration versioning (trust resets)
│   ├── training/              # preference pairs, run scoring, tuning logbook
│   └── types.ts
├── data/
│   ├── policies/              # source policy PDFs (what citations trace to)
│   ├── seed/                  # extracted rules + Docling-parsed text
│   ├── fixtures/              # replay proposals + a captured live run
│   └── training/              # exported dataset; runs.jsonl is tracked
├── scripts/
│   ├── seed.ts
│   ├── run-live-mission.ts    # live Granite mission
│   ├── export-training-data.ts
│   ├── training-report.ts     # score / compare runs, credit-free
│   └── docling/               # offline PDF generation + citation verification
├── docs/superpowers/plans/    # the plans this was built from
└── docker-compose.yml         # PostgreSQL 16 (host port 5433)
```

## License

MIT

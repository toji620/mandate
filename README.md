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

The system implements graduated autonomy through three bands:
- **PROBATION**: Every action requires human approval
- **SUPERVISED**: Low-risk actions auto-allowed; commercial actions require approval
- **TRUSTED**: Auto-allowed up to policy thresholds; only exceptions escalate

Agents earn promotions through clean execution and face instant demotion on policy violations.

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
npm run db:seed         # load the 4 policy documents (11 rules)
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

No database, Docker, or API key needed:

```bash
npm test          # full Vitest suite
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
.venv/Scripts/pip install -r scripts/docling/requirements.txt   # Windows
# .venv/bin/pip install -r scripts/docling/requirements.txt      # macOS/Linux
npm run policies:pdf      # generate the source policy PDFs
npm run policies:parse    # Docling parses them and verifies every citation
```

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
├── app/                    # Next.js App Router pages
├── db/
│   ├── schema.ts          # Drizzle ORM schemas (7 tables)
│   └── migrations/        # Database migrations
├── src/
│   ├── engine/
│   │   ├── evaluate.ts    # Pure evaluator function
│   │   └── golden-path.test.ts  # CI gate test
│   ├── agents/
│   │   └── propose.ts     # Agent proposal interface
│   └── types.ts           # Core domain types
├── data/
│   ├── fixtures/          # Replay-mode proposals
│   └── seed/              # Policy documents (JSON)
├── scripts/
│   └── seed.ts            # Database seeding script
└── docker-compose.yml     # PostgreSQL setup
```

## License

MIT

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
   - Context-aware reasoning about business requirements
   - Cost-optimisation prompts that deliberately test policy boundaries

2. **Policy Rule Extraction** (IBM Granite + Docling)
   - Offline parsing of policy documents (procurement, finance, security)
   - Extraction of thresholds, vendor lists, approval requirements
   - Source passage preservation for citation display

3. **Decision Explanations** (IBM Granite)
   - Natural language justification for each verdict
   - Citation of specific policy rules and source passages
   - Transparency for human reviewers

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

- Node.js 20+
- Docker and Docker Compose
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd mandate
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start PostgreSQL:
```bash
npm run db:up
```

5. Run migrations:
```bash
npm run db:migrate
```

6. Seed the database:
```bash
npm run db:seed
```

### Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

Run the test suite:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

### Linting

```bash
npm run lint
```

### Database Management

- **Start database**: `npm run db:up`
- **Stop database**: `npm run db:down`
- **Run migrations**: `npm run db:migrate`
- **Seed data**: `npm run db:seed`

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

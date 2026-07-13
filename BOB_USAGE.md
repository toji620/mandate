# Bob Shell Usage Log

This document tracks all Bob Shell sessions for the Mandate project, recording what was produced and what decisions were made.

| Date | Session Goal | What Bob Produced | What We Kept/Changed |
|------|--------------|-------------------|---------------------|
| 2026-07-13 | Stage 1 Foundation: Scaffold the complete project structure with Next.js 15, PostgreSQL, Drizzle ORM, evaluator engine, golden-path test, seed data, CI workflow, and documentation | - Next.js 15 app with TypeScript, App Router, ESLint, Vitest<br>- PostgreSQL docker-compose.yml with healthcheck and .env.example<br>- Drizzle ORM configuration with all 7 schemas (agents, policies, policy_rules, approvers, actions, decisions, trust_ledger)<br>- Pure evaluator function at src/engine/evaluate.ts with band transition logic<br>- Agent proposal interface at src/agents/propose.ts with replay mode<br>- Golden-path test at src/engine/golden-path.test.ts covering all 7 steps<br>- 4 policy seed files (finance-approval-matrix, procurement-policy, approved-vendor-list, security-requirements)<br>- Database seed script at scripts/seed.ts<br>- GitHub Actions CI workflow at .github/workflows/ci.yml<br>- README.md with all required sections<br>- BOB_USAGE.md template and first entry | All scaffolding kept as produced. Ready for Stage 1 acceptance criteria verification. |

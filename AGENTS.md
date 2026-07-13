# Agent instructions

Read `SPEC.md` before writing any code. It is the source of truth for architecture,
schemas, scope, and the current build stage. Key rules that override anything else:

- The evaluator (`src/engine/evaluate.ts`) is a pure function: no I/O, no database,
  no LLM calls, no clock, no randomness.
- LLMs (Granite) propose and explain; they never make authorisation decisions.
- `trust_ledger` is append-only; never generate UPDATE or DELETE paths for it.
- Evaluator tests run without a database or network.
- Respect the "Do not build" list and the stage boundaries in SPEC.md.
- Log every session in BOB_USAGE.md (date, goal, produced, kept/changed).
- Definition of done for every session includes `npm run lint`, `npm test`, AND
  `npm run build` passing locally: CI runs the build, so lint and tests alone
  are not enough. After pushing, confirm the GitHub Actions run is green; a
  session is not complete while CI is red.
- Next.js 15 gotcha: in dynamic API routes, `params` is a Promise. Handler
  signatures must be `{ params }: { params: Promise<{ id: string }> }` with
  `const { id } = await params`.

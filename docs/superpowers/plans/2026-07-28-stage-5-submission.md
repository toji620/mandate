# Stage 5/6 — Submission readiness (complete plan)

**Last updated 2026-07-31.** This is the single plan for everything between here and
submission. Stage 4.5 has its own plan
([`2026-07-14-stage-4.5-make-the-ai-real.md`](2026-07-14-stage-4.5-make-the-ai-real.md))
and is finished; its one remaining item is resolved in §6 below.

Everything here was verified against the repo, not assumed. Where something is
claimed done, the evidence is named.

> **The code is submission-ready as of 2026-07-31.** All gates green on `main`:
> `npm test` **127/127 in 14 files**, `npx tsc --noEmit` clean, `npm run lint` clean,
> `npm run build` succeeds, and Docling verifies **12/12** citations. The only things
> left are §3 (two checks needing a browser) and §4 (the video).

---

## 1. Done 2026-07-28

- [x] **Citation integrity was silently broken. Fixed.**

  This was the serious one. `npm run policies:parse` re-parses the source PDFs with
  Docling and fails if any rule cites a sentence absent from its document — and it
  **was failing**, 11 of 12. The vendor-suspension rule added on 2026-07-25 (commit
  `ecb47ab`) cited an *"Approved Vendor List addendum 2026-Q3"* that did not exist in
  `approved-vendor-list.pdf`. The README meanwhile claimed every citation was
  verified to appear verbatim in the source. That claim was false for four days, and
  a judge running the documented Docling command would have hit the failure.

  Fixed the way `extract.py` itself prescribes — correct the document, never the
  citation: the addendum was added to `scripts/docling/make_pdfs.py`, PDFs
  regenerated, Docling re-run. **Now passes 12/12**, verified by actually running it,
  not by inspection.

- [x] **`npm test` no longer hangs.** It was bare `vitest` — watch mode — so the
  command the README hands a judge never returns. Now `vitest run`, with
  `npm run test:watch` for development. (CI was unaffected: vitest disables watch when
  `CI` is set.)

- [x] **CI now runs on feature branches.** `ci.yml` triggered only on `main` and
  `develop`, neither of which matches the working branch, so **no CI run backs any of
  Stage 4.5**. Added `merge/**`, `fix/**`, `feat/**` to the push trigger. An Actions
  tab with no runs looks exactly like one full of passing runs — that is why this went
  unnoticed for two weeks.

- [x] **README — the autonomy bands were described wrongly.** It said PROBATION
  requires approval for *every* action (read-only actions actually run unwatched) and
  that SUPERVISED commercial actions "require approval" when the code returns
  **REVIEW** (`src/engine/evaluate.ts:283-294`). The demo visibly shows step 4 as
  REVIEW and step 5 as APPROVAL, so the README was contradicting the video. Replaced
  with a band table matching the code, plus the reputation-reset rule that gives
  demotion teeth.

- [x] **README — "impact stats with citations" added.** This was the one named Stage 5
  acceptance criterion with nothing written against it. Every figure names the command
  or file that proves it. No market or cost-saving statistics were invented; the
  section says so explicitly and explains why.

- [x] **README — the learning loop and cross-mission trust documented.** The strongest
  AI-approach material in the project was absent from the section judged on AI
  approach.

- [x] **README — project structure refreshed.** It omitted `src/training/`,
  `src/trust/`, `src/orchestrator/`, `src/policies/`, `src/granite/` and all four
  screens. Verified against the actual tree.

---

## 2. The merge — DONE, by a collaborator, on 2026-07-31

- [x] **Everything is on `main`.**

A collaborator rebased `merge/live-onto-ui` onto `main` and force-pushed both, then
added two commits of their own. The rebase changed every commit id (`4f03170` →
`924cd28`), so the branch *looked* diverged; it was not. Verified by content, which is
the only check that means anything after a rebase:

```bash
git diff HEAD origin/merge/live-onto-ui                              # empty → identical trees
git log --oneline --cherry-pick --right-only origin/main...<branch>  # empty → nothing stranded
```

Both came back empty for `merge/live-onto-ui` **and** for the older
`fix/evaluator-safety-and-stage-4`. No work is stranded on any branch.

The collaborator's two additions:

- `03add14` — closes the learning loop. `src/training/tune-trigger.ts` makes "when is a
  generation due" an explicit, tested rule (every `TUNE_WINDOW` evaluator decisions,
  default 500), `npm run tune:status` reports the window, and `data/training/runs.jsonl`
  now holds a real first record: 49 decisions, 2 preference pairs, fingerprint
  `9f761708c9cbacec`.
- `f288ae7` — notification centre, pending-approval badge, global toasts, live mission
  goal.

Acceptance met: `git log --oneline -1 origin/main` → `f288ae7`, and the working branch
contains nothing `main` lacks.

---

## 3. Verify — cheap, and nothing else is trustworthy without it

- [ ] **Watch the first CI run go green.** Until §2 or a push to the working branch
  happens, no run exists. The golden path green in CI is a SPEC Stage 2 requirement.

- [ ] **Fresh-clone check.** Clone to a clean directory and run the README quick start
  verbatim — `npm install`, `cp .env.example .env`, `db:up`, `db:migrate`, `db:seed`,
  `dev` — and confirm all four screens load. The README is the judge's first execution
  path and has never been run end to end from scratch.

- [ ] **Confirm the GitHub repo is public** (SPEC Stage 1 requires it). Not checkable
  from this machine — no `gh` CLI installed.

---

## 4. The video

- [ ] **Nothing recorded yet.** SPEC Stage 5: *"video recorded, two takes, replay
  mode."* Record after §1-§3, since the video shows the README's own quick start.

Replay mode is the mandated demo source (`SPEC.md:146`) and needs no key or network.
Two beats, both already real and both visible on screen:

1. **Step 6 — BLOCK → demotion → reputation reset.** The Sourcing Agent's prompt
   carries deliberate cost pressure, so it genuinely proposes the cheaper unapproved
   supplier rather than being scripted to fail. The evaluator blocks it with the exact
   policy sentence cited, the agent drops SUPERVISED → PROBATION, and reputation
   resets to zero so it *cannot* bounce back on the next clean action.
2. **Step 7 — ALLOW.** The purchase order executes the GBP 22,400 a human approved at
   step 5, matched on vendor **and** amount. Allowed because that approval exists, not
   because purchase orders are waved through — and the agent stays demoted.

Worth showing if there is time: the Policy Library citation next to a decision, and
the Flight Recorder replaying the blocked step with Granite's explanation shown beside
the deterministic reason.

---

## 5. Nice to have — both now DONE

- [x] `data/training/runs.jsonl` exists with a real record, so the tuning logbook is
  concrete rather than described.
- [x] The dataset yield is real, not hypothetical: 49 decisions produced **2**
  preference pairs. Thin, and honestly so — only a block with a later corrected retry
  becomes a pair, so a well-behaved agent starves its own training set. That property
  is documented in `tune-trigger.ts` rather than hidden.

---

## 6. The fine-tune — RESOLVED: blocked by plan tier, not by choice

- [x] **Task 8.5 Step 4 cannot run, and that is now a documented fact rather than an
  open decision.** Per the note on the `gen-1` record in `runs.jsonl`: watsonx.ai
  **Lite does not run tuning experiments at all**, and LoRA targets a `granite-3-1`
  base rather than the `granite-4-h-small` the agents actually run.

  This is a better story than "we ran out of time". The generation is specified,
  frozen and fingerprinted against the exported dataset; only the weight update is
  gated, and it is stated as gated rather than simulated. Say exactly this if asked —
  do not imply the tune ran.

**Do not start the stretch Policy Change Simulator** (`SPEC.md:206`). It was gated on
screens 1-4 being done by July 25; that date has passed and it is unbuilt.

---

## Standing hazards

- ~~The local `main` ref is a stale orphan~~ **Fixed 2026-07-31.** It was archived as
  `archive/pre-rebase-main` and `main` repointed at `origin/main`, so `git diff
  main...HEAD` works again.
- **There is no `dev` or `develop` branch**, though `ci.yml` references `develop`.
  `main` is now the working branch; `merge/live-onto-ui` is fully merged and can be
  deleted.
- **`npm run policies:parse` invokes a bare `python`.** With a `.venv` present but not
  activated it silently runs the *global* interpreter, which on this machine fails with
  a Docling `ConversionError`. Run `.venv/Scripts/python scripts/docling/extract.py`
  directly. The README now documents this; the npm shorthand was left as-is rather than
  hard-coding a platform-specific venv path into `package.json`.
- **Postgres is on host port 5433**, not 5432 — a local PostgreSQL install commonly
  squats on 5432 and shadows the container.
- **Docling needs the project `.venv`**; the global Python site-packages on this
  machine is corrupted with `~orch` / `~umpy` entries.

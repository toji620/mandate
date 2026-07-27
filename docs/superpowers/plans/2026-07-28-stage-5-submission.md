# Stage 5/6 — Submission readiness (complete plan)

**Last updated 2026-07-28.** This is the single plan for everything between here and
submission. Stage 4.5 has its own plan
([`2026-07-14-stage-4.5-make-the-ai-real.md`](2026-07-14-stage-4.5-make-the-ai-real.md))
and is finished apart from one optional, credit-spending item (§6 below).

Everything here was verified against the repo, not assumed. Where something is
claimed done, the evidence is named.

> **Deadline conflict — resolve first.** `SPEC.md:225` says *"Buffer July 29-30;
> submit July 30; nothing new after July 28."* The user believes the deadline is
> **July 31**. If 31 is right, SPEC.md is stale and should be corrected, because
> "nothing new after July 28" is what decides whether §6 is in scope at all.

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

## 2. The merge — deferred by the user, but it is what decides the submission

- [ ] **`origin/main` is 9 commits behind, and judges clone `main`.**

`origin/main` sits at `e4e3aa3` ("Hero speaks in IBM Plex Serif"). Live Granite, the
hardened evaluator, vendor suspension, the training harness — none of it is on the
default branch. **A judge cloning this repo today does not see the project.**

Deliberately not done on 2026-07-28 at the user's instruction. It remains the single
highest-value action available, and it fast-forwards cleanly (0 behind / 9 ahead, no
conflicts):

```bash
git branch -f main origin/main      # the LOCAL main ref is a stale orphan — fix it first
git checkout main
git merge --ff-only merge/live-onto-ui
git push origin main
```

Acceptance: `git log --oneline -1 origin/main` shows the latest work, and the CI run
triggered by that push is green.

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

## 5. Nice to have, only if §2-§4 are done

- [ ] Re-run `npm run export:training` against a seeded database and put the real pair
  count in the README's impact table. It currently reports the mechanism, not the
  yield.
- [ ] `data/training/runs.jsonl` does not exist yet — a first real record would make
  the tuning logbook concrete rather than described.

---

## 6. Explicitly optional — do not let it eat the deadline

- [ ] **Task 8.5 Step 4, the actual fine-tune.** Spends watsonx credits, needs the
  user's go-ahead, and **nothing depends on it**. The harness, the dataset export, the
  scoring and the run log already demonstrate the loop end to end. If the deadline is
  tight, drop it and let the README say the weight update is future work.

  If it runs: a tuned model that does *not* improve is a publishable result. Report it;
  do not re-roll until the number flatters the demo.

**Do not start the stretch Policy Change Simulator** (`SPEC.md:206`). It was gated on
screens 1-4 being done by July 25; that date has passed and it is unbuilt.

---

## Standing hazards

- **The local `main` ref (`5a9e6dd`) is a stale orphan** with history unrelated to the
  work, so `git diff main...HEAD` fails outright with "no merge base". Compare against
  `origin/main`. Fix with `git branch -f main origin/main`.
- **There is no `dev` or `develop` branch**, though `ci.yml` references `develop`.
  `merge/live-onto-ui` is the working branch.
- **Postgres is on host port 5433**, not 5432 — a local PostgreSQL install commonly
  squats on 5432 and shadows the container.
- **Docling needs the project `.venv`**; the global Python site-packages on this
  machine is corrupted with `~orch` / `~umpy` entries.

# Stage 5/6 — Submission readiness

**Status: audit done 2026-07-28. Nothing below is started.**

Stage 4.5 has its own plan (`2026-07-14-stage-4.5-make-the-ai-real.md`) and is
effectively finished. This plan covers the only thing left: getting what exists in
front of a judge. Everything here was verified against the repo on 2026-07-28, not
assumed.

> **Deadline conflict — resolve first.** `SPEC.md` line 225 says *"Buffer July 29-30;
> submit July 30; nothing new after July 28."* The user believes the deadline is
> **July 31**. If 31 is right, SPEC.md is stale and should be corrected, because the
> "nothing new after July 28" rule is what decides whether items 6-8 below are in
> scope at all. Until confirmed, this plan assumes the tighter date.

---

## The one that actually loses the submission

- [ ] **1. `origin/main` is 9 commits behind. Judges clone `main`.**

`origin/main` is at `e4e3aa3` ("Hero speaks in IBM Plex Serif"). Every piece of
Stage 4.5 — live Granite, the policy briefing, the hardened evaluator, vendor
suspension, the training harness — is on `merge/live-onto-ui` and **invisible on the
default branch**. A judge who clones this repo today does not see the project.

There is no merge conflict risk: `origin/main` is a clean ancestor, 0 behind / 9
ahead, so it fast-forwards.

```bash
git branch -f main origin/main     # the local main ref is a stale orphan, fix it first
git checkout main
git merge --ff-only merge/live-onto-ui
git push origin main
```

Verify after: `git log --oneline -1 origin/main` shows the training commit, and a
fresh clone into a temp directory runs the quick start from the README.

- [ ] **2. CI has never run on any of this work.**

`.github/workflows/ci.yml` triggers only on `main` and `develop`. The branch all the
work lives on is `merge/live-onto-ui`, which matches neither, so **no CI run exists
for any Stage 4.5 commit.** SPEC.md Stage 1 requires "CI runs lint + tests on push"
and Stage 2 requires "golden-path test green in CI" — currently unevidenced.

Fixing item 1 triggers CI automatically (push to `main`). Watch that run and confirm
it is green before recording anything. Consider also adding the working branch to the
trigger list so this cannot recur:

```yaml
on:
  push:
    branches: [ main, develop, 'merge/**', 'fix/**' ]
```

(Note: `develop` in that trigger list is probably what "push into dev" meant. No
`develop` branch exists. Creating one is optional — merging to `main` is what matters.)

---

## README — Stage 5's actual acceptance criteria

SPEC.md Stage 5 requires: *"README finalised (problem, solution, AI approach/
architecture, wildcard theme, Bob usage, impact stats with citations)."* Current
README was last touched 2026-07-16. Present: problem ✅, solution ✅, AI approach ✅,
wildcard theme ✅, Bob usage ✅.

- [ ] **3. "Impact stats with citations" is missing entirely.** No such section
  exists. This is a named, explicit acceptance criterion — the only one outright
  absent. Needs real numbers with sources, not invented ones. Candidates the repo can
  actually support: 11 rules extracted across 4 policy documents with every
  `sourcePassage` verified verbatim against Docling-parsed text; 117 tests; the
  7-step golden path; the block rate from `training-report.ts`.

- [ ] **4. The band descriptions are wrong.** README lines 22-24 contradict both
  SPEC.md and `src/engine/evaluate.ts:268-302`:

| README says | Code actually does |
|---|---|
| PROBATION: "Every action requires human approval" | Read-only actions run unwatched; only commercial effect needs APPROVAL |
| SUPERVISED: "commercial actions require approval" | Commercial actions get **REVIEW**, not approval |

This is not a nitpick: the demo shows step 4 as REVIEW and step 5 as APPROVAL, and
the README tells the judge those are the same thing. It makes the core mechanic look
muddled at exactly the moment it should look precise.

- [ ] **5. README tells judges to run `npm test`, which hangs.** `npm test` is bare
  `vitest` — watch mode. It never returns on a laptop. (CI is unaffected: vitest
  disables watch when `CI` is set, which GitHub Actions does.) A judge running the
  documented command sees a hang. Fix: add `"test:run": "vitest run"` to
  package.json and document that, or change `test` to `vitest run` and add
  `test:watch`.

- [ ] **6. The newest and most differentiating work is undocumented.** The README
  never mentions trust persisting across missions, or the learning loop — that the
  evaluator is a free reward labeller and the audit trail exports as a preference
  dataset. That is the strongest "AI approach" material in the project and it is
  absent from the section judged on AI approach.

- [ ] **7. Project Structure block is stale** (README lines 183-202). Omits
  `src/training/`, `src/trust/`, `src/orchestrator/`, and the four `app/` screens.
  Small, but it is the map a judge reads before opening anything.

---

## Then the video

- [ ] **8. Nothing recorded yet.** No video asset in the repo. SPEC Stage 5: "video
  recorded, two takes, replay mode." Do this only after items 1-5 land, because the
  recording shows the README's own quick start.

Replay mode is the mandated demo source (SPEC line 146), and it works without a key
or network. The two beats worth showing, both already real:

1. **Step 6 BLOCK → demotion → reputation reset.** The agent proposes the cheaper
   unapproved supplier, is blocked with a cited policy passage, drops
   SUPERVISED → PROBATION, and *cannot* bounce straight back — the reset is what
   gives the demotion teeth.
2. **Step 7 ALLOW.** The purchase order executes the GBP 22,400 a human approved at
   step 5, matched on vendor **and** amount. It is allowed because the approval
   exists, not because POs are waved through — and the agent stays demoted.

- [ ] **9. Verify a fresh clone before recording.** Clone to a clean directory, run
  the README quick start verbatim, confirm all four screens load. The README is the
  judge's first execution path; it has never been tested end to end from scratch.

---

## Cannot verify from here — user must check

- **Is the GitHub repo public?** SPEC Stage 1 requires it. No `gh` CLI on this
  machine, so this was not checked.
- **CI run history / badge state.** Same reason. See item 2 — expect it to be empty
  for all recent work.

---

## Not blocking

Stage 4.5's remaining fine-tune (Task 8.5 Step 4) spends watsonx credits and is
explicitly optional. Nothing in this plan depends on it. If the deadline is tight,
drop it — the harness, the dataset export and the run log already demonstrate the
loop, and the README can say the weight update is future work.

The stretch Policy Change Simulator (SPEC line 206) was gated on "only if screens 1-4
are done by July 25". It is now past that date and unbuilt. Do not start it.

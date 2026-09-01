# REVIEW — cross-family (fill target before dispatch)

**TARGET MODEL: ____________ (must be a different family than the author)**
Pairing table: Codex work → Z.AI reviews · Z.AI work → Gemini reviews ·
Gemini work → Codex reviews. (ZCode in this workspace can review anything
except Z.AI-authored work it wrote itself.)

Work under review: ____________ (goal ID + commit range / directory)

## Checklist

1. Read the matching dispatch file in this folder — check **every
   done-condition verbatim**, including the notes file and its required
   findings.
2. Read the diff. For code: correctness, error handling, security basics
   (auth scoping! user data isolation!), dead code, slop.
3. Run the gates from the repo root: typecheck/build for the touched
   workspace, its tests if any, and `npm run lint` where configured. For
   spike apps: at minimum, each app builds and its dev server renders.
4. Verify constraints held: nothing outside the declared directories was
   touched (`git diff --stat main~..<commit>` is a quick check);
   `webapp/`, `apps/`, `packages/`, and `actionamp_*` databases untouched.
5. Fixes: apply them directly (code-review = fix loop), re-run gates.

## Verdict — append to the notes file or the work's commit message

```text
REVIEW: <goal> · author <family/tier> · reviewer <family/tier>
verdict: pass | pass-after-fixes | failed (<round>)
notes: <one line>
```

Two failed rounds → stop and hand back to Jake with a summary.

---
slug: resources-project-owned
title: "Project-owned Resources + Task references"
feature_area: planning
status: missing
spec: resources-project-owned.md   # ready
verified: 2026-07-03
---

# Resources (project-owned)

**Wanted.** Make the existing-but-invisible `Resource` entity real: project-
owned links + notes, surfaced on the Project detail page (add/edit/delete), with
tasks referencing their project's resources (many-to-many) and a delete-with-
impact flow that shows which tasks depend on a resource before removal.

**Today.** The `Resource` model exists in `schema.prisma` but is not surfaced
anywhere in the UI.

**Spec.** `docs/specs/resources-project-owned.md` (`ready`).

**Why it matters.** Closes a gap PAGES.md already promises; lands the PARA
"reference material" leg of the structure-depth differentiator (one of the three
things the roast says could be a real moat). Gated on the gauntlet producing a
signal.

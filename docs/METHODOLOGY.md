# ActionAmp — Methodology (GTD + PARA flavor)

> The design philosophy. ActionAmp is **GTD-compatible** (the *workflow*) with a
> **flavor of PARA** (the *storage shape*) — except **Areas are replaced by Goals**,
> because the app is about action and Goals are active where Areas are passive.

---

## 1. GTD workflow → ActionAmp features

GTD defines a 5-step workflow. We map each to a concrete part of the app:

| GTD step | What it means | ActionAmp feature |
|---|---|---|
| **1. Capture** | Get it out of your head | Universal Inbox, `Cmd+K` quick-add, email-in (P2) |
| **2. Clarify** | Decide what each item *is* | **Triage** — InboxItem → Task / Project / Resource / Goal-link |
| **3. Organize** | Put it where it belongs | Projects, Goals, Lenses, dates, tags |
| **4. Reflect** | Review regularly | Inbox review mode, Today cap, weekly review (P2) |
| **5. Engage** | Do the work | **"What Now" focus engine** ← the wedge |

The GTD clarifying question ("is it actionable?") is literally our triage fork:
- Actionable & 1 step → **Task**
- Actionable & >1 step → **Project**
- Not actionable & useful → **Resource**
- Not actionable & no value → **Trash**
- Actionable but not now → **Someday** (Task with no date)

That's GTD's decision tree verbatim, with our entity names.

---

## 2. PARA storage → ActionAmp entities

PARA stores things in 4 buckets. We adopt the **shape**, swap one bucket:

| PARA bucket | PARA meaning (passive) | ActionAmp | Why the change |
|---|---|---|---|
| **P**rojects | Active outcomes with a finish line | **Project** *(same)* | Identical concept. |
| **A**reas | Ongoing responsibilities ("Health") | **Goal** ← *replaces Areas* | Goals are active & outcome-oriented ("Run a 10k"). Action-oriented organizing layer. |
| **R**esources | Reference material by topic | **Resource** *(same)* | Filed under Projects (or Goals). |
| **A**rchives | Inactive items | **Archive / Logbook** | Completed/dead items live here. |

**The substitution:** `Areas → Goals`. Everything else maps 1:1.

> Open question: in PARA, Resources sit at the top level (by topic). Here we
> file Resources **under a Project or Goal**, not loose. This keeps focus on
> action — loose reference material without a home isn't useful. *(Confirm or
> relax.)*

---

## 3. Where Lens fits

Neither GTD nor PARA has a Work/Me split. We add one as a **scoping layer on top
of everything**, and we call it a **Lens** (not "Context", to avoid colliding
with GTD's "@context" — errands/phone — which we use **Tags** for):

- A **Lens** contains its own **Goals**, **Projects**, **Tasks**, **Resources**.
- Switching Lens re-scopes the UI *and* the focus engine.
- Think of it as "which life am I working in right now" — a hard filter that
  keeps Work out of Me-time by default (cross-lens surfacing is Phase 2).

---

## 4. The full hierarchy (with GTD + PARA labels)

```
Lens             (ActionAmp addition — "Work" / "Me")
└─ Goal          (PARA "Area", made active)  ← the organizing layer
   └─ Project    (PARA "Project" / GTD outcome)
      ├─ Task    (GTD next action) ← THE focus candidate
      └─ Resource (PARA "Resource")

Tag              (GTD "@context": @errands, ~15m, low-energy)
Archive/Logbook  (PARA "Archive")
Inbox            (GTD "Inbox" — universal, single)
```

---

## 5. Open questions (need your call)

1. **Loose Resources** — must Resources always be under a Project/Goal, or can
   they be top-level (PARA-style)? *(Lean: always under something — keeps it action-focused.)*
2. **Someday vs Archive** — GTD treats these separately (Someday = might-do,
   Archive = done). Keep both? *(Lean: yes — separate statuses.)*

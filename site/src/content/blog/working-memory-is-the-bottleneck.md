---
title: "Working memory is the real bottleneck"
description: "You don't have 97 problems. You have four slots, and 93 things competing for them. What executive-function research says about prioritization, and why a single-task surface is an accessibility feature, not a preference."
pubDate: 2026-06-20
kind: essay
tags: [Attention]
readTime: "8 min"
---

You don't have ninety-seven problems. You have roughly four slots in working memory, and ninety-three things competing for them.

That number (four, give or take) is one of the more durable results in the psychology of attention. It's not a limit of motivation or discipline. It's structural. The system that holds what you're actively thinking about right now is small, fast, and constantly overwritten. Everything else, no matter how important, is either stored somewhere slower or not stored at all.

This is why the todo list fails so reliably, and why "just prioritize better" is such useless advice. You can't prioritize by holding more things in mind. You can only prioritize by **removing things from the contention set** so the slots you have are free for the one thing that matters.

<figure class="aa-blog-fig">
  <svg viewBox="0 0 520 200" fill="none" role="img" aria-label="Working memory shown as four filled slots, with many more items queued behind them">
    <!-- The four slots — small, full, foregrounded -->
    <text x="24" y="32" font-family="ui-monospace,monospace" font-size="10" fill="currentColor" opacity="0.5">working memory · 4 slots</text>
    <g>
      <rect x="24" y="44" width="80" height="64" rx="6" stroke="var(--aa-teal)" stroke-width="1.6" fill="var(--aa-teal-soft)" />
      <rect x="112" y="44" width="80" height="64" rx="6" stroke="var(--aa-teal)" stroke-width="1.6" fill="var(--aa-teal-soft)" />
      <rect x="200" y="44" width="80" height="64" rx="6" stroke="var(--aa-teal)" stroke-width="1.6" fill="var(--aa-teal-soft)" />
      <rect x="288" y="44" width="80" height="64" rx="6" stroke="var(--aa-teal)" stroke-width="1.6" fill="var(--aa-teal-soft)" />
      <!-- occupied marks -->
      <circle cx="64" cy="76" r="5" fill="var(--aa-teal)" /><circle cx="152" cy="76" r="5" fill="var(--aa-teal)" /><circle cx="240" cy="76" r="5" fill="var(--aa-teal)" /><circle cx="328" cy="76" r="5" fill="var(--aa-teal)" />
    </g>
    <!-- The queue — many items waiting, fading into noise -->
    <text x="24" y="136" font-family="ui-monospace,monospace" font-size="10" fill="currentColor" opacity="0.5">the rest · 93 competing</text>
    <g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
      <line x1="24" y1="152" x2="468" y2="152" opacity="0.5" /><line x1="24" y1="164" x2="452" y2="164" opacity="0.42" />
      <line x1="24" y1="176" x2="476" y2="176" opacity="0.34" /><line x1="24" y1="188" x2="440" y2="188" opacity="0.26" />
    </g>
    <line x1="380" y1="76" x2="420" y2="76" stroke="var(--aa-teal)" stroke-width="1.4" stroke-linecap="round" opacity="0.7" />
    <path d="M416 70l6 6-6 6" stroke="var(--aa-teal)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7" />
    <text x="432" y="80" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.4">blocked</text>
  </svg>
  <figcaption>Four slots, all occupied. Everything else waits.</figcaption>
</figure>

## The list assumes a larger working memory than you have

A list of forty items is an instruction to your working memory: hold these forty in suspension, compare them, and pick. The system can't do that. What happens is you scan the top, feel the weight of the rest, get tired, and pick something near the top that's easy rather than important. That's not a character flaw. That's a four-slot system doing what four-slot systems do under load.

People who seem to "prioritize well" aren't holding more in mind. They're holding less. They've done the work of removing, deferring, or grouping so that when they sit down to choose, the contention set is small enough to fit the bottleneck. The visible skill (good choices) rests on an invisible one (ruthless subtraction).

This is also why a single-task surface isn't a productivity gimmick. For someone whose working memory is the binding constraint (most of us under load, essentially everyone with ADHD), a home screen that shows one thing and hides the rest isn't a preference. It's an accommodation. It does the subtraction the brain can't sustain on its own.

## What "one thing" does

Showing a single next task does three things that a list cannot, and all three map onto how attention works.

First, it removes comparison. The brain doesn't have to hold forty options and evaluate. The choice is made, and the four slots are free for *doing* the work rather than choosing it. This is why people report a drop in anxiety the moment the list disappears: the contention set emptied.

Second, it creates commitment. When one thing is on the screen, switching away has a cost the brain can feel: you're leaving the chosen task. With a list, switching is free and invisible, because nothing was chosen. The single-task surface makes switching visible, and visible switching happens less.

Third, it respects the slot limit. You can't do two things at once; you can only switch between them, and switching has a tax. A surface that assumes one thing at a time is a surface designed for the hardware it's running on.

## Why this gets framed as a preference

Most discussion of focus tools treats single-tasking as a style choice, something the disciplined do, or the minimalists prefer. That framing is backwards. The default state of a modern tool (the open list, the badges, the pings) is the *unnatural* posture, designed for a brain with more slots than anyone has. Single-tasking is the accommodation. The list is the thing that needs justification.

This matters for how we build. If working memory is the bottleneck, then a focus app's job isn't to show you everything and let you decide. It's to do the subtraction work, the triage and scoping and deferral, that the brain is bad at sustaining, and to present what's left as a single, trustworthy, next thing. Not a list. A chooser.

The list is still there. It has to be; you need somewhere to store the ninety-three. But the home screen isn't the list. The home screen is the one thing the four slots are for, and everything else gets out of their way.

## The constraint

This is also why a single-task surface can't be faked with willpower. You cannot, by effort, hold more slots. You can only protect the ones you have. Tools that ask you to protect them yourself (by resisting the list, ignoring the badges, not switching) are outsourcing the accommodation to the user. Tools that do the subtraction for you are returning the slots.

If a focus app doesn't reduce what's competing for your working memory, it isn't helping you focus. It's just a prettier list, and the list was never the point. The bottleneck was always underneath.

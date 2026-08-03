# ActionAmp — SEO and Guides Plan

> Status: planning — guide section outlined 2026-08-03. This document owns
> organic-discovery strategy and the public guide surface. `PRODUCT.md` owns
> positioning and tone; `docs/PUBLIC-PAGES.md` owns public-route inventory.

## 1. Goal

Teach the problem ActionAmp solves before asking people to buy it:

> I have too much on my list. How do I choose what to do next?

Search is a long-term discovery channel, not a volume-at-all-costs content
machine. Each page must help a real reader, demonstrate first-hand product or
method expertise, and give a clear next step. No programmatic keyword pages,
thin rewrites, or medical claims.

The desired loop:

```
search / trusted mention → useful guide or essay → related ActionAmp method
                         → newsletter or signup → first useful session
```

## 2. Foundations — required before promotion

- Verify `actionamp.com` in Google Search Console and Bing Webmaster Tools;
  submit `https://actionamp.com/sitemap.xml`.
- Review indexability: public Astro pages index; app, auth, checkout, preview,
  and other private pages do not.
- Keep one canonical URL, unique title, and unique meta description per public
  page. Existing Astro sitemap, robots.txt, static rendering, RSS, and blog
  canonical/OG work are the base — preserve them.
- Check mobile performance, accessibility, crawl errors, redirects, and 404s
  before distribution pushes.
- Add valid `Organization` / `SoftwareApplication` structured data to the
  public site and `Article` structured data to essays and guides when routes
  ship. Structured data clarifies meaning; it is not a ranking promise.
- Every public route needs a 1200 × 630 branded Open Graph image. Use it in
  `og:image`, X/Twitter image tags, and article `image` structured data.
  This makes shared guide/article links legible and gives Google an explicit
  image candidate. Add page-specific art only when it adds meaning.
- Track organic landing page → newsletter signup → account signup → first app
  open → checkout. Search Console supplies queries/impressions; product
  analytics supplies conversion. No task content or other PII in analytics.
- Correct public-copy contradictions before outreach. Current examples: the
  Founding 100 price differs between `PRODUCT.md` and public content, and the
  Founding 100 post mentions a waitlist that product strategy removed.

## 3. Search territory

Do not chase generic terms such as "best todo app." ActionAmp should earn
attention around decision-overwhelm, calm task systems, and attention-aware
execution.

| Territory | Reader need | ActionAmp contribution |
|---|---|---|
| Decision overwhelm | Choose one task when every task feels urgent | Decision-first workflow; one next action |
| Calm systems | Capture, triage, and review without building a second job | Minimum viable GTD/PARA-flavored method |
| Attention and task initiation | Start when working memory and motivation are scarce | Concrete, non-clinical ways to reduce choice and task size |

ADHD and executive function are honest topics, not a diagnosis or a marketing
label for every page. Cite sources for factual health/cognition claims; use
plain experience-based guidance otherwise.

## 4. Public content architecture

### Blog (`/blog`)

Living publication. Essays carry durable instructional and thesis content;
Finds carry short editorial pointers. It creates regular reasons to return,
subscribe, and link. It should link readers into the most relevant Guide,
never force a generic product pitch.

### Guides (`/guides`)

Small library of evergreen, complete, step-by-step resources. Guides are not
repackaged blog posts. Each owns one high-value job, becomes its topic's
internal-link hub, and receives links from related Essays/Finds.

Initial route shape:

```
/guides                         library index
/guides/calm-gtd-setup           foundational setup
/guides/weekly-triage            maintenance ritual
/guides/choose-next-task         decision-overwhelm guide
/guides/task-paralysis           task-initiation guide
```

Use descriptive, stable slugs. Do not create tag archives or many near-duplicate
keyword routes until search data proves a distinct reader need.

### Guide page contract

Every guide includes:

1. Clear outcome and who it helps.
2. A short answer / minimum viable version before deeper detail.
3. Numbered steps, examples, and one reusable worksheet, checklist, or template
   when genuinely useful.
4. A calm "use this in ActionAmp" callout: show the relevant product flow,
   without claiming the guide only works in ActionAmp.
5. Related Essays/Finds and one next Guide. Internal links must be editorially
   relevant.
6. Author or editorial ownership, publish/updated date, sources where needed,
   unique title/description/canonical/OG, and `Article` structured data.
7. Quiet newsletter capture plus signup CTA. Signup is primary only when the
   reader is clearly ready to use the workflow.

### Guide index contract

`/guides` is a calm library, not a content grid. It has:

- Intro: "Practical systems for choosing what matters next."
- One featured foundational guide.
- Four small topic groups: Choose, Set up, Start, Keep going. Each launches
  with three guides; no infinite grid or tag cloud.
- Brief outcome-first cards: title, one-sentence promise, read time.
- Links to Blog for ongoing essays and Finds.
- Standard site navigation/footer link to Guides, sitemap inclusion, and RSS
  remains blog-only.

Guides belong in shared site navigation and footer, plus contextual homepage
and blog links. They must not be orphan pages or a separate design system.

## 5. Initial guide library — 12 guides, four calm shelves

The library starts with four reader jobs, three guides each. The index shows
only these shelves; users enter through the job they have today, not a large
taxonomy. Guide pages cross-link sparingly: one natural next guide, not a
"read everything" funnel.

### Choose — decide what matters now

| Guide | Reader promise |
|---|---|
| **How to choose your next task when everything feels important** | Turn an overwhelming list into one doable next action in 10 minutes. |
| **How to prioritize when every task feels urgent** | Separate real deadlines, consequences, and noise without a complicated scoring system. |
| **How to reset an overwhelming to-do list** | Triage an ignored backlog into now, later, reference, and let-go without rebuilding the whole system. |
| **Task lists are necessary. Living inside them is not.** | Keep commitments accounted for without keeping every commitment visible all day. |

### Set up — create a system that stays light

| Guide | Reader promise |
|---|---|
| **A calm GTD setup in 15 minutes** | Set up capture, triage, one goal, one project, and one task without a complex system. |
| **How to use a notebook and ActionAmp together** | Let paper hold thinking and ActionAmp hold commitments, with no duplicated task system. |
| **Projects versus tasks: stop putting outcomes on a task list** | Separate outcomes, projects, and next actions so a list stays actionable. |

### Start — make work easier to begin

| Guide | Reader promise |
|---|---|
| **When you cannot start: make a task small enough to begin** | Convert vague, heavy work into a visible first physical action. |
| **How to break down a task when “just do it” does not help** | Find the smallest useful step without turning every task into a project plan. |
| **How to plan around variable energy, not your ideal self** | Choose work that fits the attention and energy available today. |

### Keep going — maintain trust without maintenance theater

| Guide | Reader promise |
|---|---|
| **A weekly triage that does not take over your weekend** | Clear an inbox and reset commitments in a short, repeatable review. |
| **How to restart after falling behind** | Recover a usable system after a bad week without catching up on every old task. |
| **How many active projects should you have?** | Limit active commitments enough to finish work without pretending life contains only one priority. |

### Build order

Publish in small, balanced batches:

1. **Choose next task**, **calm GTD setup**, **weekly triage** — core ActionAmp
   method.
2. **Notebook and ActionAmp**, **task small enough to begin**, **reset an
   overwhelming list** — human workflow and high-intent pain.
3. Remaining six, driven by reader questions and Search Console impressions.

The existing blog post **A calm GTD setup in 15 minutes** can seed its Guide,
but final canonical version must live at `/guides/calm-gtd-setup`; the former
blog URL should either redirect or become a materially different supporting
essay. Never leave two pages competing for the same intent.

## 6. Editorial operating system

- Cadence: one deep Essay every two weeks; one Find weekly. Guides ship only
  when they are complete enough to bookmark; aim for one per month initially.
- Each new Essay chooses one Guide to strengthen with a contextual link.
- Every Guide gets a quarterly review: accuracy, examples, links, screenshots,
  query performance, and conversion.
- Use product screenshots and real workflow examples. Original experience is
  the differentiator over generic productivity advice.
- No volume target. Retire, merge, or rewrite pages that overlap, mislead, or
  add no value.

## 7. Distribution and earned visibility

SEO gains compound faster when real people encounter useful material.

- Share condensed lessons with relevant communities, respecting each
  community's self-promotion rules. Give answer first; link only when useful.
- Pitch founder-led guest essays, podcast appearances, and newsletter notes to
  ADHD/focus/GTD/indie-maker creators. Lead with a specific useful idea.
- Create one genuinely useful downloadable or copyable companion per major
  guide — e.g. next-task worksheet or weekly-triage checklist — rather than
  fake SEO tools.
- Publish build notes and changelog entries for trust and return visits.
- Consider honest comparison pages only after product differentiation and
  evidence are strong enough to make them useful.

## 8. Measures and decisions

Review monthly:

- Index coverage, crawl errors, mobile performance, and Core Web Vitals.
- Non-brand impressions, clicks, CTR, and average position by page/query.
- Organic visitor → newsletter signup → account signup → checkout rate.
- Pages that assist signup, not only last-click conversions.
- Qualified referring domains, creator mentions, and email subscribers.

At 90 days, expand only topics showing one of: growing impressions, qualified
signups, meaningful backlinks, or repeated reader questions. If none appear,
improve product-message fit and distribution before publishing more pages.

## 9. Build sequence for guides

1. Lock this architecture and guide order.
2. Add first-class `guides` content collection, `/guides` index, and
   `/guides/[slug]` route in Astro.
3. Reuse `PublicLayout`, tokens, meta/OG conventions, sitemap, and responsive
   site chrome. Add Guides to nav/footer and contextual blog/home links.
4. Publish first three guides with real examples, screenshots, internal links,
   and source review.
5. Validate generated HTML, canonicals, schema, sitemap, mobile layout, and
   newsletter/signup instrumentation before deploy.

## Sources

- Google Search Central, [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).
- Google Search Central, [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
- Google Search Central, [guidance on generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content).

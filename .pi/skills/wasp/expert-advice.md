# Wasp Expert Advice

Load this when the user asks for open-ended advice on how to improve the app — features, architecture, code quality, or "what should I build next" — and wants a Wasp-flavored expert opinion.

## Steps

1. **Explore the current codebase** — read `webapp/main.wasp.ts`, `webapp/schema.prisma`, and the `webapp/src/` tree to understand what exists.

2. **Fetch the Wasp docs for the current project version** — follow the Documentation Protocol in [SKILL.md](./SKILL.md): `wasp version` → `https://wasp.sh/llms-<VERSION>.txt` → raw markdown URLs.

3. **Decide on a few improvements.** If the user gave a specific ask, use it as the starting point. Otherwise consider:
   - App features Wasp makes cheap (auth, email, jobs, websockets, CRUD)
   - Code-quality improvements (operations structure, entity relationships, caching/invalidation)
   - Product/architecture enhancements relevant to the app's purpose

4. **Present the improvements** to the user — for each: name, what it is, why it helps, and **pros/cons**. Don't implement anything yet; let the user choose.

If the user supplies arguments (e.g. "how can I improve account management?"), treat them as the focused topic and bias the suggestions toward that area.

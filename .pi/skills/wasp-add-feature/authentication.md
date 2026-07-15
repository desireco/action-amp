# Authentication Setup

Add and configure authentication methods for the Wasp app.

## Prerequisites

- Fetch the list of available auth methods from the **Authentication → Overview** section of the versioned Wasp docs (via the docs map).

## Steps

1. Read the Wasp config file's auth section (`webapp/main.wasp.ts`) to see which providers are already configured, if any.

2. **Display the full list** of available auth methods to the user.

3. Ask the user which (additional) auth methods they want to add:
   - Highlight the most popular (e.g. Email, Google, GitHub) as quick picks.
   - Remind them they can name any other option from the full list.
   - If no auth methods are selected, skip to completion.

4. For each selected auth method:
   - Fetch the raw-markdown doc URL for that method from the versioned docs map (e.g. the `auth/social-auth/github` guide).
   - Add the provider to the config file's `auth.methods` section **exactly as the docs specify** for this Wasp format.
   - If applicable, tell the user which env vars they'll need to set.

5. Check if the app has defined authentication pages (login, signup, forgot password):
   - If yes: check whether those pages use Wasp's managed auth UI components (e.g. `import { LoginForm } from "wasp/client/auth"`).
     - Using managed UI → skip to completion.
     - Not using managed UI → continue.
   - If no auth pages exist: ask the user if they'd like to set up auth pages with Wasp's managed auth UI components (which adapt to the selected methods).
     - Yes → follow the selected methods' "create your own UI" or managed-UI guides in the docs.
     - No → tell them they can follow the "Create your own UI" guides later.

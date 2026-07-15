# App Branding Setup

Configure the Wasp app's name, description, and meta tags.

## Steps

1. Ask the user:
   - What is the app **name**?
   - What is a **one-line description**?

2. Fetch the relevant Wasp docs (client/server config + meta tags / SEO & GEO sections from the versioned docs map) for the exact config syntax for this project's Wasp format.

3. Update the Wasp config file's `app` block (`webapp/main.wasp.ts`) — `name`, `title`, etc. — according to the docs.

4. Add `name`, `description`, OpenGraph, and other critical meta tags to the `app.head` section of the config.

**Important:** only add **placeholder URLs** in `app.head` meta tags, with a `TODO` comment for the user to replace with real URLs once they have a production domain and are ready to deploy.

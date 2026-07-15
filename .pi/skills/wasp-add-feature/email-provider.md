# Email Provider Setup

Configure an email-sending provider for the Wasp app.

## Prerequisites

- Fetch the list of available email providers from the **Advanced Features → Sending Emails** section of the versioned Wasp docs.

## Steps

1. **Display the full list** of email providers to the user (e.g. SendGrid, Mailgun, SMTP, Postmark, etc.).

2. Ask the user which provider they'd like to use:
   - Highlight the most popular as quick picks.
   - Remind them they can name another option from the full list.

3. For the selected provider:
   - Fetch the raw-markdown doc URL for that provider from the versioned docs map.
   - Update the config file's `emailSender` section **exactly as the docs specify** for this Wasp format.

## Environment Variables

1. Generate a checklist of required env vars for the selected provider.
2. Give the user instructions for retrieving and adding them to `webapp/.env.server`.
3. Follow any run-commands / setup steps from the guide to complete the integration.

## Completion

After configuring the provider, summarize the changes and ask if the user wants to configure another feature.

> **Note:** the `Dummy` email provider is fine for dev (it logs emails instead of sending). Don't leave it on in production.

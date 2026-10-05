# Personal Knowledge — CareNova

Private evidence search with an optional, approval-gated answer layer. Version 0.3.0.

## What this release contains

- Existing owner-approved Supabase sign-in and read-only archive access.
- Keyword search, source-passage viewer, source catalog and decision history.
- A separate **Ask AI** tab: natural-language question -> evidence preview -> explicit approval -> cited answer.
- Up to eight selected excerpts, bounded linked-decision context, and a fingerprint that rejects stale approval.
- Server-side OpenAI Responses API integration; no browser API key and no service-role credential.
- Model calls disabled by default. Preview and keyword search remain usable without an API key.
- Source-ID and quotation checks; these do not independently verify an interpretation.
- No uploader, automatic source synchronization, model training, or persistent conversational memory.

The app is not an exhaustive personal archive. It can only retrieve imported, accessible passages. A historical source snapshot is not evidence of current runtime state. Generated text is not automatically saved as a fact or confirmed decision.

## Run

Node.js 22.16+ is required.

```sh
npm install
npm run check
npm run dev
```

Existing Netlify project: `david-personal-knowledge`. Repository: `davidekissinger/david-personal-knowledge`, branch `main`. Build: `npm run check`. Publish directory: `dist`. Functions: `netlify/functions`.

Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` available to Functions. Keep the Netlify team-login restriction and the Supabase owner gate enabled. Never store personal records, exports or secrets in this repository.

## Activate optional answers

See **docs/AI_ANSWERS.md** before enabling external processing. Add `PK_OPENAI_API_KEY` directly in Netlify as a Functions-scoped secret and set `PK_AI_ENABLED=true`; redeploy. Leave generation disabled until provider billing and data handling are approved. Each model request also requires in-app evidence approval. No key is needed for previews.

Default model: `gpt-4.1-mini-2025-04-14`. API usage is separately billed. `store:false` is not a zero-retention guarantee. No patient records in this pilot.

38 local Node tests passed using synthetic/mocked services, and the asset build passed. Real model output quality and browser behavior after deployment still require validation. Local browser navigation was blocked by the execution environment. No real provider calls were made during development.

Database migrations in the repository describe the earlier foundation. This release adds no database migration and does not change owner approval, archive contents, or database write grants. The original database AI flags remain legacy read-only metadata; the new authenticated answer-status endpoint reports optional generation readiness.

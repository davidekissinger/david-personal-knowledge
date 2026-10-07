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
- An offline, operator-run ChatGPT export preparer and owner-checked SQL importer. See **docs/CHATGPT_IMPORT.md**.
- No browser uploader, automatic source synchronization, model training, or persistent conversational memory.

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

38 Node tests, 18 Python importer tests, and the asset build passed. The importer also passed rollback-only synthetic integration checks against the existing Supabase project. The actual export could not be downloaded in this session, so its contents and import totals remain unverified. No real provider calls were made for this work.

Database migrations in the repository describe the earlier foundation. The operator importer adds no database migration or client write grants. It checks the existing approved, confirmed owner before every transaction. The frontend remains version 0.3.0; its import flags describe the unavailable browser import path. The original database AI flags remain legacy read-only metadata; the authenticated answer-status endpoint reports optional generation readiness.

# myPKR · Personal Knowledge Record

Private evidence search with an optional, approval-gated answer layer. Version 0.4.4.

## What this release contains

- Fingerprint/passkey-first unlock screen, one-time device setup, automatic prompting after setup, and password fallback. Supabase passkeys must be activated separately; see **docs/PASSKEYS.md** for the exact settings and the remaining Netlify gate.

- Search groups matching passages under one compact, dated record heading. Multi-passage results expand into individual sections with previews; single-passage records still open directly. Record and matching-passage counts are distinct, with the existing 20-passage search limit. Records sharing a title remain separate when their IDs differ.

- myPKR app and home-screen labels with readable PKR icon lettering, a standalone web app manifest, and an **Add to home screen** guide. Supported browsers can offer an install prompt; others show manual steps for Android, iOS, and desktop.
- **Add to myPKR** request composer: title, information, source, approximate dates, evidence basis, and uncertainty. Copy or download the prepared request for the ChatGPT **Add to My Record** skill. “Use myPKR,” “Use PKR,” and “Use personal knowledge record” invoke that skill.
- Drafts live only in the current page and clear on sign-out, pagehide, or reload. Preparing or downloading a request does not save it to the archive. The skill must confirm a verified save; blocked saves remain pending.
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

## Add myPKR to a device

Open the production app in Chrome on Android or Safari on iPhone/iPad, pass the Netlify sign-in screen, and select **Add to home screen** in the myPKR header. Desktop Chrome and Edge can also install from their browser menu. The manifest uses credentials because the site remains protected; an automatic install prompt may be unavailable behind site protection, so the manual browser steps remain visible.

myPKR requires internet access. Passkey setup saves only a nonsecret automatic-prompt preference; session credentials stay in memory. This release adds no service worker, offline record cache, or persistent authentication. Installation cannot be confirmed until the browser reports it. Public assets remain explicitly allowlisted by the build; icon PNG signatures and sizes are checked before publication.

## Activate optional answers

See **docs/AI_ANSWERS.md** before enabling external processing. Add `PK_OPENAI_API_KEY` directly in Netlify as a Functions-scoped secret and set `PK_AI_ENABLED=true`; redeploy. Leave generation disabled until provider billing and data handling are approved. Each model request also requires in-app evidence approval. No key is needed for previews.

Default model: `gpt-4.1-mini-2025-04-14`. API usage is separately billed. `store:false` is not a zero-retention guarantee. No patient records in this pilot.

The earlier release passed 38 Node tests, 22 Python importer tests, and the asset build. The importer also passed rollback-only synthetic integration checks against the existing Supabase project. A real extracted export has been imported with exact content/citation reconciliation and owner/non-owner access checks. Private counts and audit evidence remain in the private archive and Supabase. Full original-ZIP integrity and attachment-content readability remain unverified. No real provider calls were made for this work.

Database migrations in the repository describe the earlier foundation. The operator importer adds no database migration or client write grants. It checks the existing approved, confirmed owner before every transaction. The frontend is version 0.4.4; its import flags describe the unavailable browser import path. The original database AI flags remain legacy read-only metadata; the authenticated answer-status endpoint reports optional generation readiness.

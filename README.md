# Personal Knowledge — CareNova

A private, read-only evidence-search pilot. Version 0.2.0.

## Implemented

- Email/password sign-in with Supabase Auth; no public signup form.
- Server-side token verification and explicit single-owner approval.
- Database row-level security, read-only grants, and owner-consistent foreign keys.
- Source catalog, full-text passage retrieval, source-passage viewer, and decision history.
- Revoked sources and deleted records are excluded. Superseded records are excluded from search unless requested.
- In-memory sessions, 15-minute idle sign-out, bounded requests, no-store responses, and restrictive browser headers.
- No source-account mutations, import endpoint, AI provider calls, or privileged runtime keys.

**This is not yet a complete personal AI or an exhaustive archive.** Search returns exact source excerpts, not generated answers. No application identity has been enrolled and no personal records have been imported. A real sign-in and first deployed request still require validation.

## Run and test

Use Node.js 22.16 or newer in the Node 22 series.

```sh
npm install
npm test
npm run build
npm run dev
```

The dependency-free unit tests run with Node's TypeScript stripping. The build copies only the public asset allowlist into `dist`. Netlify bundles the TypeScript functions; its type package is a development dependency. `npm install` and the Netlify deployment must be validated in a network-enabled environment. A dependency lockfile has not yet been generated.

## Deployment

Use the EXISTING `david-personal-knowledge` Netlify project, not a new site.
Connect `davidekissinger/david-personal-knowledge`, branch `main`.
Build command: `npm run check`. Publish directory: `dist`.
Function directory: `netlify/functions` (set by `netlify.toml`).

Keep the existing Netlify team-login restriction enabled. Scope the two variables below to **Functions** (Builds may remain enabled):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Only the publishable key belongs here. Do not add a service-role key. No AI key is needed.

## Identity setup

The Supabase project is separate from ClinicalSOS. In its Authentication > Users dashboard, create the owner's application account with an email and password. Provision it through the trusted administrator UI; do not place a password in chat, code, or SQL. Disable public new-user signup in Auth configuration.

After independently confirming the intended user's Auth UUID, an administrator can bind that UUID to the singleton row in `private.app_control`. No user can approve themselves through the API. Leave the owner unset until the correct account is confirmed. See `docs/HANDOFF.md`.

## Data handling

Never commit original documents, chat exports, patient records, mailbox exports, tokens, or credentials. `.gitignore` includes common private-data locations, but it is not a substitute for reviewing each commit. Source citations are only as reliable as future imports; preserve speaker, date, version, locator, and correction relationships. Treat completed or sent records as closed. Do not infer follow-up communication.

Before any import: validate the deployed owner and non-owner paths, review the data scope, and add a controlled importer in a separate reviewed change. Do not enable broad database writes merely to make an import work.

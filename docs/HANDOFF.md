# Deployment and release record

Prepared 2026-10-05. This file is an implementation handoff, not a claim of a live deployment.

## Existing resources

- Private GitHub: davidekissinger/david-personal-knowledge
- Netlify project: david-personal-knowledge
- Netlify site ID: fd407ece-95ef-43e4-95be-ed5fb22ab3b2
- Supabase project reference: nadjsybjfarnkerrsgmx
- Supabase organization: CareNova

Identifiers above are routing metadata, not access credentials.

## Completed locally

Application source and unit tests. No real records or account credentials are in this repository. The initial database already existed; the additive owner-gate/retrieval migration is included here. Database state must always be checked independently of this document.

## Remaining deployment gates

1. Authorize Netlify to access this private repository and link the existing project to `main`.
2. Verify a successful Netlify build, `/api/health`, configuration, and protected site access.
3. Create the owner's application account in Supabase Authentication > Users. Keep the password out of chat.
4. Verify the intended user's UUID and bind the singleton owner. Do not auto-select the first user.
5. Test sign-in, denied access for a non-owner, and invalid/expired tokens against the deployment.
6. Review a small non-sensitive dataset before adding any import capability.

An administrator may bind the verified UUID with a parameterized SQL operation equivalent to:

```sql
update private.app_control set owner_id = :verified_auth_user_uuid where singleton;
```

`:verified_auth_user_uuid` is a client bind parameter, not runnable literal SQL. Do not use an email supplied by an unverified app session to grant access.

## Deliberate limitations

- No live source connectors, model training, AI synthesis, vector embeddings, or document uploader.
- No persisted browser session; reloading signs out.
- Read lists display at most 100 entries; search returns at most 20. These are not exhaustive reviews.
- The database blocks direct writes by authenticated users. Imports require a separately reviewed design.
- The site-shell configuration exposes only the project's publishable key and URL; database approval is the data boundary.
- No claim of regulatory certification or readiness for patient records.
- Restore testing and monitoring are not yet implemented.

# Vault foundation — v0.5.0

## Shipped in this cycle

Stable vault identities and owner memberships are now part of the shared database.
Every source, record, passage, decision and import run has a non-null vault ID.
Composite foreign keys bind vault, owner and parent references. Ownership cannot
be reassigned by updating a content row. Membership revocation or vault suspension
adds a restrictive RLS denial across all five content tables.

The existing singleton approval gate and read-only application grants remain in
force. This is an additive foundation release, **not a multi-client launch**.
The first release supports one registered vault per owner and owner membership
only. Additional members and multiple vaults require a later migration and tests.

`GET /api/vault` authenticates with the existing confirmed-owner flow, then resolves
the active vault through an invoker-rights database RPC. It accepts no target vault
or infrastructure credential from the browser. Responses use `no-store` and state
that onboarding, browser imports and multi-client access are disabled.

## Authorization inventory

| Boundary | Enforcement in this release |
| --- | --- |
| Netlify knowledge and AI endpoints | Authoritative Auth lookup + existing `app_access` owner gate in `lib/backend.mts` |
| Vault context endpoint | Same gate + `my_vault()` active membership lookup |
| Direct database reads | Existing owner predicates + singleton restriction + active vault membership |
| Sources, records, passages and decisions | Existing visibility/revocation restrictions remain; composite vault/owner parent keys added |
| Search and AI evidence | Existing invoker-rights search and caller bearer; underlying RLS applies |
| Operator ChatGPT imports | Existing explicit owner checks; invoker trigger fills omitted vault ID from registered owner |
| Browser writes and membership changes | No write grants; no provisioning or enrollment endpoint |
| Storage, upload jobs, connector tokens and caches | No new implementation or permissions; must pass separate isolation tests before activation |

## Verification

- `npm run check`: 74 Node tests and public asset build passed.
- `tests/vault_isolation.sql`: rehearsed transactionally before migration and
  rerun after migration. Two synthetic owners use identical source/external IDs
  and titles. Tests cover direct reads, both search RPCs, membership revocation,
  vault suspension, forged parent/vault links, immutable ownership, anonymous
  denial and absence of application write privileges.
- The SQL suite temporarily switches singleton enrollment **inside one rollback
  transaction**, testing each identity separately. It does not prove simultaneous
  multi-client operation and must not be cited as that release gate passing.
- Existing record and passage content fingerprints matched before and after the
  additive backfill. No synthetic users remain after rollback.
- Security advisor results were unchanged: private `app_control` intentionally
  has no user policy; leaked-password protection remains disabled in existing
  Auth configuration. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The initial full dependency install encountered a registry 404 for a pre-existing
transitive package. Local checks used the exact pinned esbuild/auth-js versions
installed in an isolated temporary dependency directory; no dependency versions
were changed. Netlify's clean build is the deployment verification gate.

## Next release gate

Before replacing singleton approval, implement controlled pilot enrollment and
bind every authenticated API operation to an effective vault. Exercise two
simultaneously eligible users end to end, including AI preview/revalidation.
Keep import staging, Storage, connector grants, durable jobs and onboarding
disabled until their own cross-vault tests pass. Then build the guided import
workflow; entitlements and billing follow the accepted ADR sequence.

## Deployment / recovery

Apply `20261016135214_vault_foundation.sql` before publishing this application
version. It adds metadata, constraints and policies; existing content and owner
approval are retained. `tests/vault_isolation.sql` is operator-only and always
rolls back. Never run a populated data export through GitHub migrations.

Application rollback to v0.4.6 is compatible with the additive schema. Retain the
database migration on rollback rather than dropping vault IDs or constraints.
Never remove singleton policies as a deployment workaround.

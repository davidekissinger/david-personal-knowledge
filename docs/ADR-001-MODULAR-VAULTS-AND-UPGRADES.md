# ADR-001 — Modular capabilities and portable personal knowledge vaults

**Status:** Accepted product-design direction; **not implemented**
**Date:** 2026-10-16
**Product:** myPKR · Personal Knowledge Record
**Decision owner:** Product
**Scope:** New-client onboarding, pricing/entitlements, data architecture, and optional dedicated deployments.

> **Product promise:** My life. My words. My record.
>
> **Architecture principle:** Every person gets a secure, portable Personal Knowledge Vault. Buying additional intelligence is a separate choice from buying additional infrastructure independence.

## 1. Context and why this decision exists

The current repository documents a single confirmed owner, a read-only source archive, evidence-linked search, an opt-in Ask AI flow, and a controlled, offline ChatGPT importer. It does **not** yet have multi-client tenancy, a browser import pipeline, connector synchronization, subscriber billing, customer-managed vault provisioning, or independent-deployment handoff. The product version in \`package.json\` may differ from older prose in \`README.md\`; use the implemented code and tested deployment as the operational source of truth.

The prior onboarding concept asks the customer to select Google and cloud-drive files, AI-platform exports, and other personal records. If myPKR ties one set of AI features to one infrastructure layout, either low-complexity users inherit unnecessary cloud administration or engaged users cannot grow without changing applications. We therefore separate **what users can do** from **where the record runs**.

This decision establishes target architecture and a delivery sequence. It does not authorize a data migration, production schema change, new paid plan, automatic AI processing, or source connection.

## 2. Decisions

**D1. A vault is the portable unit of ownership.** Define a stable \`vault_id\` independent of email, plan, provider account, Supabase project, or storage path. Each vault has a separately scoped member policy, source registry, record revisions, provenance, decisions, connector grants, import state, retention controls, audit trail, and export manifest. Initially, one person may own one vault; the model must not assume permanent one-vault-per-Auth-account equivalence.

**D2. Two independent upgrade axes.** Capability bundles (Personal / Plus; later other bundles) are orthogonal to deployment profiles (Managed Shared / Managed Dedicated / Customer Operated). Customers can purchase features without moving data. Moving infrastructure must not force a capability purchase.

**D3. One supported application and design system.** A shared codebase and deployment process are the default. Per-customer GitHub repos and Netlify sites are **not** required for Managed Shared or Managed Dedicated. A customer-operated deployment may use a release package, its own repository/fork, and its own accounts.

**D4. Privacy and portability are baseline guarantees, not upsells.** Authenticated access, correct authorization boundaries, trustworthy provenance, useful export, deletion requests, and transparent processing/retention controls must be available regardless of plan. The target export/delete features are **not yet shipped**, and marketing must not imply otherwise.

**D5. Server-authoritative entitlements.** The UI may describe or hide a capability, but APIs, jobs, imports, AI processing, and connector actions must authorize each feature using server-side entitlements plus vault permissions. Neither an untrusted client flag nor user-editable auth metadata may authorize a premium action. Billing and authorization are separate: a plan entitlement grants only capabilities the user and vault can otherwise access.

**D6. Source-first knowledge model.** Preserve exact words, author role, source locator, receipt hash, timestamps and uncertainty. Generated summaries and AI answers never silently become verified facts or decisions. Import a provider's source snapshot; do not treat imported chat instructions as commands.

**D7. No implicit data use for upsell.** Show upgrade suggestions based primarily on user actions, declared preferences, and aggregate account counts. Do not inspect sensitive record text to target upgrades without separate, specific, revocable permission.

**D8. Upgrades are reversible where technically possible.** Capability upgrades should not rewrite historical records; downgrades must never silently delete data. Infrastructure migration is an auditable copy–verify–cutover workflow with a defined rollback window and customer approval.

**D9. Explicit external processing.** Connector grants and AI provider processing are distinct permissions. Never send an entire vault to an LLM merely because a user connected the provider or purchased Plus. Record which excerpts are approved, under which provider, and which processing policy applies.

**D10. Security release gates override sales readiness.** Do not open multi-client onboarding, self-service ingestion, or paid plans until cross-vault authorization tests and abuse controls pass; keep the existing singleton owner gate until its replacement has been independently verified.

## 3. Packaging: capabilities × deployment

### Axis A — capabilities

| Capability / right | Personal target | Plus target | Delivery status |
|---|---|---|---|
| Vault ownership, authenticated access, source citations, export, deletion controls | Included | Included | Some access/citations exist; self-service export/delete require implementation |
| Keyword search and record browsing | Included | Included | Owner-only foundation exists |
| Manual file and supported AI export intake | Included, bounded | Expanded quotas/format coverage | Operator-managed ChatGPT import exists; no self-service uploader |
| One-time source connection | Limited eligible connectors | Expanded connectors | Planned |
| Scheduled connector sync and change receipts | — | Included with quotas | Planned |
| Evidence-reviewed AI questions | Optional usage allowance | Expanded usage/models | Existing owner-only AI flow is off by default |
| Cross-source relationship discovery | — | Included, consented | Planned |
| Advanced organization, automation, and history comparison | — | Included, consented | Planned |
| Configurable provider choice / bring-your-own-key | — | Optional add-on | Planned, subject to provider validation |

This matrix describes **product intent**, not live entitlements. Quantities, pricing, trial structure, supported connectors, and what counts toward quotas remain commercial decisions and must be published explicitly before launch.

### Axis B — infrastructure

| Deployment | Code/hosting | Knowledge storage | Operator | User experience |
|---|---|---|---|---|
| Managed Shared (default) | One maintained myPKR Netlify application | Shared project with independently authorized vault data | myPKR | No cloud accounts required |
| Managed Dedicated | Same maintained myPKR frontend and backend control plane; dedicated data plane | Separate project / storage per selected customer | myPKR | Same interface; stronger infrastructure segregation |
| Customer Operated (Independent) | Versioned deployable myPKR release in customer-managed hosting | Customer-controlled database, storage, keys and backups | Customer or delegated administrator | Guided transfer and operational handoff; support contract defined separately |

A dedicated project does not imply encryption against the operator. Customer-operated means operational responsibility shifts; it does not automatically make the installation locally hosted or zero-retention at AI providers. These assurances require separate engineering and contractual review.

**Commercial recommendation:** Sell Personal and Plus as capability bundles; offer Managed Dedicated and Customer Operated as infrastructure options. The public storefront may simplify the presentation, but the entitlement engine must keep the axes separate.

## 4. Reference architecture (target, not deployed)

\`\`\`text
Web/PWA (myPKR UI; one design system)
  |-- Create my record / My sources / My record / Ask AI / My settings
  |
  v
Identity & API boundary
  |-- Auth / secure session / vault membership
  |-- Capability & quota authorizer
  |-- Evidence and consent gate
  |-- Structured audit events
  |
  +--> Vault Router --> Managed Shared vault data
  |                +-> Managed Dedicated vault data
  |                +-> Customer-operated deployment (its own instance)
  |
  +--> Connector Broker --> Google Drive / Gmail* / Dropbox / other providers
  |                          OAuth scopes and tokens isolated per vault
  |
  +--> Import Jobs --> protected staging --> validation --> source manifest
  |                     --> immutable record revisions --> evidence index
  |
  +--> AI Gateway --> per-question evidence preview --> user approval
  |                   --> selected model/provider --> cited response
  |
  +--> Entitlement & Billing Adapter --> subscription events / quotas
  |
  +--> Export & Migration Service --> checksum manifest / verify / cutover

* Gmail access depends on scope restrictions, verification, and applicable security review.
\`\`\`

The **control plane** manages identities, subscriptions, entitlement catalogs, provisioning requests, and deployment routing. The **data plane** holds the actual vault content, source objects, indexes, and privacy-controlled evidence. A dedicated-data deployment must not leak customer content into shared analytics, logs, or system support traces.

### Implementation interfaces (conceptual contracts)

- \`VaultRepository\`: \`create\`, \`authorize\`, \`listRecords\`, \`getSource\`, \`saveRevision\`, \`export\`, \`requestDeletion\`. Methods require authenticated actor, effective vault, and permission context.
- \`DeploymentResolver\`: resolves a vault to a server-controlled \`shared | dedicated\` backend configuration. Never accept a browser-supplied connection URL, schema, service key, or target tenant as authoritative.
- \`ConnectorAdapter\`: \`startAuthorization\`, \`listSelectableItems\`, \`previewScope\`, \`importSelected\`, \`syncChanges\`, \`revoke\`. Each action checks user scope and connector entitlement.
- \`Importer\`: \`inspect\`, \`prepare\`, \`reconcile\`, \`commit\`, \`receipt\`. Original data and derived passages remain distinguishable; runs are idempotent by verified source identity and revision.
- \`EntitlementService\`: \`evaluate(actor, vault, capability, requestedUsage)\` yields \`allowed\`, denial reason, relevant quota and expiration; enforced before queued jobs and again at execution time.
- \`AIProvider\`: bounded provider calls after evidence review and explicit user approval; provider/model/usage/cost receipt is recorded without putting private question text in operational logs.

Provider integrations are replaceable modules, not vault ownership primitives. No AI vendor's account history, memory system, or login becomes the master record.

## 5. Proposed domain objects

These are **logical entities**, not executable migrations or final table names.

| Domain | Primary objects / essential fields |
|---|---|
| Identity | \`User\`, \`Vault\` (\`vault_id\`, owner, status), \`VaultMembership\` (actor, role, revoked_at) |
| Deployment | \`VaultDeployment\` (\`vault_id\`, profile, data-plane reference, lifecycle state, version) |
| Commercial | \`PlanCatalog\` (versioned offers), \`CapabilityCatalog\` (stable feature keys), \`VaultEntitlement\` (grant, limits, source, expires_at), \`UsageLedger\` (dedup key, units, status) |
| Sources | \`Source\`, \`ConnectorAuthorization\` (scopes, token-secret reference, expiration/revocation), \`SourceSelection\` |
| Ingestion | \`ImportJob\`, \`ImportReceipt\`, \`SourceManifest\` (hashes, file roles, completeness), \`RecordRevision\`, \`Passage\`, \`EvidenceLocator\` |
| Knowledge | \`Decision\`, \`Correction\`, \`RecordRelationship\` (proposed / user-confirmed distinction) |
| Operations | \`AuditEvent\` (actor, action, vault_id, outcome, timestamp, no raw record text), \`ConsentGrant\`, \`ExportJob\`, \`MigrationJob\` |

Suggested stable feature keys: \`record.search\`, \`record.manual_import\`, \`record.export\`, \`record.delete\`, \`source.chatgpt_export\`, \`connector.google_drive\`, \`connector.gmail\`, \`connector.dropbox\`, \`connector.scheduled_sync\`, \`ai.ask\`, \`ai.cross_source\`, \`ai.model_choice\`, \`vault.dedicated\`, \`vault.customer_operated\`.

The app must distinguish a user's **role** (who can do it), **entitlement** (what is available), **consent** (what has been explicitly permitted), and **usage quota** (how much may be done). These are four separate checks.

## 6. Required isolation / authorization design

1. Never replace the current singleton check with \`role = authenticated\` alone. Every client endpoint must bind authenticated actor to an authorized \`vault_id\` and operation.
2. For shared Supabase storage, apply row-level security and minimum grants to every exposed table; \`SELECT\`, \`INSERT\`, \`UPDATE\`, \`DELETE\` require purpose-specific access rules. Test old/new ownership state on updates. Do not derive policies from mutable \`user_metadata\`.
3. Apply independent storage-object RLS. Private buckets and unguessable object paths supplement—**not replace**—the permission check. Never write records or secrets to the Git repo, Netlify static assets, public Storage buckets, logs or analytics.
4. Keep service credentials server-only; avoid a universal application service role in ordinary record reads. Privileged import/provisioning workers must take an independently verified vault target and audit every action.
5. Prevent tenant injection through URLs, query params, search index, full-text/vector queries, background workers, caches, realtime channels, generated signed links, usage metering, export jobs, and restore/import paths.
6. Recheck authorization and entitlements at background job execution and before AI evidence leaves the system; revoke tokens and source grants promptly. No stale auth or paid-plan flag as a bypass.
7. No automatic external model processing of sensitive categories merely because a user upgrades. Introduce explicit data classifications and approved processing policies first; do not promise HIPAA suitability for protected patient data.
8. Before release: two synthetic customers with overlapping record IDs/source titles and adversarial access tests. Verify that unauthorized reads, writes, listing, source previews, signed URLs, embeddings, AI queries, search and imports fail closed. Verify cancellation, expiry and revoked OAuth grants.
9. Dedicated projects require independent secret rotation, backup, restoration, disaster recovery, and access audits. A project per user is not automatically an independently secure installation.

Source: Supabase RLS and Storage access-control documentation, reviewed 2026-10-16:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control

## 7. Guided onboarding and upgrade UX

### A. New user — "Create my record"

1. **Welcome / access:** create/sign into account, accept disclosures; start empty vault with unique ID and default Managed Shared deployment.
2. **Choose my sources:** cards for Google (Drive/Docs and later eligible Gmail scopes), AI exports (ChatGPT, Claude, Gemini as format adapters become tested), cloud storage (Dropbox/OneDrive etc. only when implemented), and files. Distinguish "Connect account" (OAuth) from "Upload an export" (one-time file).
3. **Select exact scope:** file/folder picker or import manifest preview; default selection is **not** the entire account. Display categories, sources, sensitivity and approximate size; allow deselection.
4. **Approve & process:** consent/version receipt, permission scopes, processing boundary, optional AI disclosure. Durable import job reports \`queued > inspecting > importing > reconciling > review_ready > completed\`, plus \`partial / failed / cancelled\`; no unsupported "done" claim.
5. **Review my record:** report actual indexed records, skipped attachments, unsupported content, decisions requiring user confirmation, and source coverage. Expose import receipts, reconciliation, exact sources and retriable errors.

### B. Engaged user — discover improvements without coercion

- Contextual, opt-in suggestions: "Keep my selected sources updated", "Connect another archive", "Ask across my sources", "Move to a dedicated vault".
- Compare current/next capability, estimated usage and exact additional cost **before** a purchase. Show whether a permission grant or data move is required.
- Enabling \`ai.cross_source\` does not connect new accounts; upgrading connectors does not authorize reading previously unselected folders; dedicated deployment does not enable content inspection by support.
- Mark \`Coming soon\` until actually shipped and verified; no inert purchase buttons or simulated account connections in production.
- "My plan and environment" shows capabilities, quotas, data location/profile, OAuth grants, import receipts, usage, cancellation, export and deletion controls.

### C. Downgrade / cancellation

- Removing a feature stops new premium processing; the underlying records and provenance remain readable and exportable.
- Pending jobs must pause or cancel safely at a checkpoint and disclose status. Do not silently purge source snapshots or reclassify records.
- Retention and deletion follow explicitly published schedules and user instructions, including backups; a cancellation is not consent to lose the only copy of a record.

## 8. Import, sync and data lineage contract

- Keep original files in protected storage, separate from derived searchable passages, with stable hashes and versioned receipt records. Verify entire ZIP/file contents when claiming full integrity; a listing or size match alone is insufficient.
- Support format-specific adapters; do not assume provider ZIP structures are compatible. Unsupported audio, attachments, branches and binary blobs must be counted and labeled rather than silently indexed as complete.
- Enforce archive-bomb, path traversal, executable content, quota, retry, time, and large-file limits. Use resumable, durable workers and idempotent commit identifiers; a Netlify request is not a substitute for a reliable ingest queue.
- Synchronization should preserve version history; absence in a subsequent connector listing is not proof of user deletion. A disconnected source loses authorization but historical imported material is governed by separately disclosed retention settings.
- Every search and AI citation must be resolvable to the preserved source identity, revision, and locator. Do not convert assistant-written historical answers into confirmed user facts.

## 9. Upgrade/migration state machine

**Feature upgrade:** \`previewed -> customer_authorized -> payment_verified (if required) -> entitlement_active -> confirmed\`. Webhook delivery must be verified, signed, replay-safe and idempotent; payment events alone do not override membership, connector consent or record access.

**Infrastructure upgrade:** \`requested -> quoted -> authorized -> provisioning -> secured -> snapshot_created -> copied -> reconciled -> user_review -> cutover -> verified -> settled\`; failures -> \`blocked\` or \`rolled_back\` with a durable audit receipt.

- Freeze or queue new writes at the final consistency boundary; enumerate source objects, receipts, record counts, hashes, decisions, deletes/tombstones and active grants.
- Copy to the destination and independently reconcile content plus authorization negatives. Provisioning success is not data-migration success.
- Make one destination authoritative only after authenticated user/operator approval and post-switch verification. Keep a defined source rollback window.
- Transfer no OAuth refresh tokens or infrastructure secret keys as ordinary export fields. Reauthorization may be required, especially when changing customer-operated security domains.
- Ensure canonical export format can carry source lineage, version history, original/archive references (or safely packaged bytes), receipts and explicit omissions without embedding plaintext secrets.
- Test a simulated shared -> dedicated -> shared round-trip and export -> independent restore before offering these upgrades publicly.

## 10. Cost, billing and governance

- Meter billable workload on the server by vault and work type: stored bytes, import processing, AI input/output tokens, scheduled sync calls, background jobs, dedicated compute, bandwidth and backup.
- Distinguish infrastructure pass-through cost from capability value. Avoid committing to prices until a pilot captures per-vault real usage and support cost.
- Use a versioned \`PlanCatalog\`, a monotonic/append-only usage ledger, tested webhook replay handling, account credits and clear metering receipts. No client-side plan flags as source of truth.
- Never charge users to perform a baseline data export or to close their account. Larger transfer bandwidth could be governed by reasonable published limits, without trapping a user's record.
- Customer-operated deployments require explicit scope for backups, incident response, updates, OAuth configuration, vendor costs, and support; independence does not promise zero maintenance.

## 11. Phased implementation plan (dependency order)

| ID / phase | Deliverable | Acceptance / release gate |
|---|---|---|
| D0 — architecture | This ADR; update design/project conventions; capture decisions and unimplemented items | No claims of shipped features; documentation linked from conventions |
| S1 — security foundation | New vault identity and membership model; shared tenant isolation in data and API; legacy owner compatibility | Synthetic multi-tenant negative tests pass across data, storage, search, AI and jobs before any second customer |
| I2 — self-service import | Secure staging, format adapters, selectable manifest, auditable jobs and UI | Two test vaults import identical source identifiers without cross-access; counts/hash/omission receipts reconcile; no secrets logged |
| E3 — entitlement engine | Capability catalog, usage metering, server-side authorization, plan preview/upgrade UI | Direct API bypass tests fail; expiration/revocation, quota, downgrade and receipt tests pass |
| C4 — premium connectors & AI | Consent-managed Google/Dropbox/etc., scheduled sync, cross-source discovery and provider gateway | Each connector's permissions and renewal/revocation tested; model evidence approval & budget limits enforced |
| V5 — dedicated data plane | Automated project provisioning, router, vault snapshot/copy/verify/cutover/rollback | Cross-tenant isolation, restore drill, integrity reconciliation and cost monitoring validated |
| O6 — independent deployment | Versioned self-host package, operational handbook, export/import handoff, customer keys | Clean restore in customer-operated environment; upgrade, backup, revoke/rotate and recovery runbooks exercised |

**Execution order matters:** S1 and I2 precede launch to multiple customers. E3 is required before charging for feature entitlements. V5/O6 should not block Personal/Plus launch if honest packaging and support boundaries are maintained.

## 12. First implementation tickets (specific, not yet built)

- **ARCH-001:** Inventory all current singleton owner, import writer and owner-only Netlify/Supabase gate touchpoints; publish a replacement authorization matrix.
- **SEC-002:** Implement a server-only vault context resolver and define RLS/Storage tests with two synthetic owners; add runtime restrictions for cross-vault caches/jobs/search/AI.
- **DATA-003:** Specify canonical portable vault format (manifest JSON schema, source hashes, revisions, tombstones, verification report) with a non-sensitive fixture.
- **IMPORT-004:** Design secure file/upload staging plus durable job state and receipt API before integrating any provider OAuth.
- **ENT-005:** Create feature catalog and entitlement evaluation contract; seed baseline rights and read-only \`GET my capabilities\` UI before integrating billing.
- **BILL-006:** Select payment provider, pricing, lifecycle events and cancellation logic only after representative usage costs and legal/privacy terms are reviewed.
- **UX-007:** Implement the 5-step guided source selection/onboarding wizard using accurate \`available\` / \`planned\` markers.
- **MIG-008:** Build a dry-run shared -> dedicated migration simulator and checksummed sample export/restore.
- **TEST-009:** Build permission-denial fixtures for two vaults, expired subscriptions, revoked connectors, deleted documents, AI approval changes and failed uploads.

## 13. Non-goals for this decision

- No per-customer GitHub repository, Netlify site or Supabase project for default customers.
- No automatic migration of the current owner's record or change to the existing owner gate in this documentation change.
- No production schema, policy, OAuth, environment-secret, billing, or deployment modification in this ADR.
- No pricing promises, regulatory compliance certifications, model data-retention guarantees, or assumption that all providers support direct API access.
- No implication that protected healthcare data is suitable for the initial pilot.

## 14. Open decisions before engineering

1. Initial paid bundle names, usage caps, and whether one vault per user is an enforced first-release restriction.
2. Which import adapters ship in v1 and which providers need separate OAuth/security review.
3. Whether a Managed Dedicated plan implies customer-owned Supabase organization or managed projects with later claim/transfer; document actual provider support and terms at implementation.
4. Which data classifications are allowed into the launch environment, with approved processing/retention policy.
5. Operator support rights, customer-admin roles, audit retention and incident recovery objectives.
6. Billing provider selection, tax handling, monthly spend protection and cloud cost targets.

## 15. Source-of-truth and change control

Read alongside \`docs/DESIGN.md\`, \`docs/CHATGPT_IMPORT.md\`, \`docs/AI_ANSWERS.md\` and \`AGENTS.md\`. Those documents describe **existing boundaries**; this ADR adds future requirements but does not override deployed security gates. Implementation requires specific schema migrations, scoped permissions, local tests and production validation. Update this ADR and implementation tickets if new evidence changes feasibility.

**Decision summary:** One myPKR product, portable personal vaults, modular feature entitlements, default managed hosting, optional dedicated/customer-operated infrastructure, and a strictly verified path between them.

# Private ChatGPT export ingestion

The web application remains read-only. The new operator tool prepares a local private archive and creates bounded SQL transactions for the existing Supabase schema. It makes no network calls, does not invoke AI, and does not store credentials. It never changes owner enrollment, database policies, write grants, Netlify access restrictions, or AI approval settings.

## Current checkpoint

The operator importer supports original ZIPs and extracted conversation files retained in a private Drive archive. The extracted path has been exercised against a real sharded export. Import counts, private archive references, input hashes, and verification receipts belong only in the private archive and Supabase, never in this repository. Direct Gmail download can fail independently of link expiration; large ZIPs can also exceed connector limits. Do not paste signed links into source files, issues, or logs.

## Private archive

Use Python 3.12+ on a trusted POSIX workstation. The archive location must be outside **every Git worktree**, on storage restricted to the owner. Use the owner's existing private archive location; do not invent a public bucket or upload to GitHub. Directory permissions are 0700 and generated files 0600. These permissions are not encryption; use the existing encrypted/private storage and backup arrangements. Temporary execution workspaces are not durable archives.

```sh
python scripts/chatgpt_import.py prepare /private/downloads/export.zip \
  --archive-dir /private/archive/chatgpt \
  --received-at 2026-01-01T12:00:00Z
```

The output directory is named by the original ZIP's SHA-256. It contains:

Replace the illustrative receipt timestamp with the actual email receipt time, or omit it if unknown.

| File | Purpose |
| --- | --- |
| `export.zip` | Byte-for-byte original export; never extracted or executed |
| `inventory.json` | Every member's path, size, compressed size, SHA-256, handling, and duplicate conversation locations |
| `records.jsonl` | Prepared conversation revisions with roles, text, omissions, and exact citation locators |
| `rejected.json` | Private member/pointer references and reasons for conversations that could not be interpreted safely |
| `manifest.json` | ZIP and derived-file hashes, counts, receipt time, importer version, and archive reference |

The `private-archive:chatgpt/sha256/...` URI is an opaque logical reference resolved under the operator's archive directory. It is not a public or signed download URL. No filesystem path, email download token, password, API secret, or archive content goes into GitHub. Manifest and SQL files are personal-data artifacts, too.

The source ZIP must also be outside Git. Copy a platform-provided temporary download to the private staging directory before running this tool if its default workspace is itself a Git worktree. Keep the downloaded original until archive verification succeeds.

## Parsing and provenance

### Extracted files when a ZIP exceeds the connector limit

Upload the original ZIP and its extracted folder to the existing private archive. This avoids chat attachment limits. A Drive upload does not imply that a connector can download the entire ZIP: use raw file fetching with `include_base64=false` for the individual conversation shards.

First inventory every uploaded relative path and byte size against `export_manifest.json`, including nested folders. Then download every declared top-level conversation JSON shard into a private directory outside Git. Verify readable JSON and exact declared sizes. The importer copies and SHA-256 hashes those bytes before parsing. Size reconciliation of other files is **not** a checksum or readability verification of their contents.

Prepare a private provenance file with the following structure; substitute existing Drive IDs. This file must never be committed:

```json
{
  "archive_uri": "gdrive:EXTRACTED_FOLDER_ID",
  "original_zip_uri": "gdrive:ORIGINAL_ZIP_FILE_ID",
  "manifest_uri": "gdrive:EXPORT_MANIFEST_FILE_ID",
  "files": {
    "conversations-000.json": "gdrive:CONVERSATION_FILE_ID"
  }
}
```

Include every declared conversation shard in `files`. Run:

```sh
python scripts/chatgpt_import.py prepare-extracted /private/staging/shards \
  --export-manifest /private/staging/export_manifest.json \
  --provenance /private/staging/provenance.json \
  --archive-dir /private/archive/chatgpt
```

The generated bundle retains the exact conversation inputs, original export manifest, source receipt, inventory, records, and rejection report. Its `export_sha256` field is explicitly tagged `extracted_receipt_sha256`: it identifies the canonical receipt, **not the original ZIP**. `original_zip_integrity` remains `not_verified`. Each observation stores the exact file SHA-256 and stable Drive reference; citations use `file-sha256:` plus the source filename, JSON pointer, and character range. Snapshot identity is identical to the ZIP path, preserving cross-format deduplication and revision history.

Retain the generated audit bundle in the same private archive. Source files and populated SQL must never enter Git. A receipt marked complete means supported conversations were processed; attachments and alternate branches are still archive-only. The original ZIP's integrity remains unverified until it can be read and checked independently.

### Original ZIP parsing

Supported input is a JSON array in `conversations.json` or numbered `conversations-1.json` / `conversations_1.json` members, optionally under a directory. This is tested support, not a claim about an unseen export's exact layout. An unrecognized archive is inventoried but cannot produce SQL. A recognized JSON file with an incompatible schema stops preparation.

Each conversation follows parent links from `current_node` to its root. Only recognized `text` and `multimodal_text` string parts authored by `user` or `assistant` on that selected branch are searchable. System/tool messages, attachments, binary media, unknown content types, and alternate branches remain in the ZIP and are counted as omitted from the search index. No OCR, transcription, attachment URL fetching, HTML execution, or inferred facts are added. Assistant passages are labeled as assistant text, not confirmed user decisions. The `decisions` table is untouched.

Citation locators include the ZIP SHA-256, exact member, JSON pointer to the original text part, and half-open Unicode character range. Role and timestamp prefixes are added outside that quoted text. Raw conversation hashes and export observations are retained on each record. Exact duplicate conversation locations within a ZIP are recorded in the private inventory.

Limits fail closed: 100,000 ZIP members, 25 GiB declared uncompressed total, 512 MiB per conversation JSON file, maximum compression ratio 1000, 2,400-character passage chunks, and approximately 4 MiB of generated SQL per batch (up to 20 conversations). A single oversized conversation needs a reviewed streaming adaptation; it is never silently truncated. ZIP traversal, ambiguous/duplicate member names, encryption, and symlinks are rejected. JSON parsing is bounded per member, not streaming within a member. Errors on the console contain no imported text; counts and hashes alone are printed.

## Owner-checked database import

The database operator retrieves and verifies the existing singleton owner UUID. The tool does not select a user, sign in, enroll an owner, or discover credentials. Generate the SQL beside the private archive:

```sh
python scripts/chatgpt_import.py sql /private/archive/chatgpt/ZIP_SHA256 \
  --owner VERIFIED_EXISTING_OWNER_UUID
```

Execute the numbered `.sql` files in order using the authorized Supabase operator connection. These files contain encoded personal records and must never be committed, pasted into an issue, or placed under `supabase/migrations`. When using `psql`, keep connection credentials in the existing secure credential mechanism and use `-v ON_ERROR_STOP=1 -f PRIVATE_FILE`. Authorized Supabase SQL tooling can execute the same transactions without acquiring a service-role key for the application.

For a connector with a smaller request-body limit, add `--max-sql-bytes 3000000`. SQL output directories and run IDs include a deterministic batch-plan hash. Changing the batch size therefore cannot accidentally reuse an old committed batch's ID for different records. Reprocessing the complete input under a new plan safely reuses existing revisions; finalization checks all runs in that plan. Keep the original files for retries. A single conversation larger than the selected limit still fails closed.

When transporting generated SQL through a command-output bridge, read bounded chunks and verify every chunk length plus the reconstructed file size before execution. Do not send truncated output or print database error contexts containing encoded personal records. Verify all imported content and citation hashes after finalization, together with owner/non-owner visibility, unchanged client grants, and existing feature gates.

Each transaction:

1. Locks and verifies `private.app_control.owner_id` and the owner's confirmed Auth account. No unbound or different owner can pass.
2. Serializes importer writes for that owner and rejects a revoked source.
3. Creates/reuses one private ChatGPT archive source and an export receipt.
4. Inserts a deterministic import-run ID, immutable conversation revisions, and passages atomically.
5. Commits the batch, or rolls it back entirely on failure. Run the same files again to resume; a committed batch is a no-op.

The final SQL file checks that every expected batch committed and that counts reconcile. It records rejected conversation counts as a partial final run and marks the export receipt `partial` or `complete`. `complete` means all supported selected-branch conversations were processed; it does not mean every attachment or alternative branch is searchable. Until finalization, the source is partial. A failed transaction leaves no partial record/passages or success run; the operator must retain its failed invocation result privately and retry the same file. It cannot durably log its own failure inside a rolled-back transaction.

Existing table RLS, restrictive owner approval policies, and SELECT-only authenticated grants remain intact. This is an intentionally privileged operator path with an explicit owner check, not a browser write API. The application's `importsEnabled` remains false because there is no in-app uploader. No database migration is required.

## Deduplication and revision rules

- ZIP SHA-256 identifies an exact export; deterministic run IDs make retries idempotent.
- Conversation identity plus a canonical snapshot hash identifies a revision. Member order and ZIP packaging do not change that identity. Hash inputs include title, timestamps, roles, selected text, node/message IDs, and omission counts.
- Identical revisions from another ZIP reuse the existing record/passages and append the new export observation. The first citation remains valid against its preserved original ZIP.
- A strictly newer source update timestamp supersedes the current revision. Older, equal-time, or undated competing snapshots are retained as historical revisions and do not displace the current one. This conservative rule may require operator resolution for ambiguous timestamps.
- A repeated export does not revive superseded/deleted records. New versions of a tombstoned conversation do not repopulate its content. Explicitly closed conversations remain closed.
- Missing conversations in a later export are **not** interpreted as deletions. No record is removed automatically.

## Verification

```sh
python -m unittest discover -s tests -p 'test_*.py'
npm run check
python tests/ingestion_db_check.py --owner VERIFIED_EXISTING_OWNER_UUID \
  --output /private/operator/ingestion-check.sql
```

The integration script requires that the importer source has not yet been created. Run it through authorized SQL tooling; it uses synthetic content, checks deduplication, observations, revision order, partial completion, revoked-source/wrong-owner rejection, deletion preservation, owner/non-owner visibility, and denied client writes. All fixtures roll back. It does not change the owner binding or any grants. Never remove its initial isolation check to run it over a populated source.

Validation includes 22 Python tests, 38 existing Node tests, the public asset build, and rollback-only synthetic integration checks against the existing project. The extracted-file path has also completed a real import with exact content/citation reconciliation and owner/non-owner access checks. Private run details remain in the archive. Full original-ZIP integrity and attachment-content readability are not established by those checks.

Before publishing importer changes, explicitly stage only code/documentation and run `python scripts/check_private_artifacts.py`. This scans staged Git content for known export artifacts, signed download links, and populated import SQL. It supplements private paths and ignore rules; it is not a complete personal-data or secrets detector.

The project security advisor reported the intentional no-policy rule on administrator-only `private.app_control` ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)) and disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This importer does not alter Auth settings. Neither finding was introduced by these code-only changes.

# Evidence-linked answers — version 0.3.0

## Implemented

A separate Ask AI tab preserves the existing keyword-search experience. The owner previews up to eight accessible excerpts, then explicitly approves a single request to OpenAI. Preview works while generation is disabled. The backend authenticates through Supabase and requires the existing owner gate before retrieving anything. No database schema, grants, owner assignment, or imported records are changed by this release.

Natural-language questions use the existing full-text search with a local keyword alternative and bounded rank fusion. This is not semantic/vector search and can miss related evidence. Each question is independent; there is no persistent conversation history or model memory.

The preview fingerprint binds the question, model, history flag, evidence, and linked decision context. Before sending, the server retrieves the evidence again and rejects a changed fingerprint. It rechecks owner access and the evidence again before returning an answer. If access changes during generation, the answer is withheld; information already sent under the earlier approval cannot be recalled.

Structured model output must cite known source identifiers with quotations present in the previewed excerpt (whitespace-normalized). This validates reference/quote consistency, NOT the semantic correctness of a claim. Drafts, proposals, and recorded decisions remain attributed. ACTIVE is a retrieval state, not implementation status. The prompt treats imported instructions as untrusted data and provides no tool execution or writes. A source's presence or date does not independently verify its claims or current status.

## Activation — owner action required

In the existing Netlify project's environment variables, add these with **Functions** scope, preferably **Production** context only:

- `PK_OPENAI_API_KEY`: an OpenAI API project key, entered directly in Netlify as a secret. Never place it in chat, GitHub, frontend code, a VITE variable, or an exported document.
- `PK_AI_ENABLED`: `true` only after approving the external-processing boundary and API billing.
- `PK_AI_MODEL`: optional. Defaults to `gpt-4.1-mini-2025-04-14`. Also supported: `gpt-4.1-2025-04-14`. Other models fail closed pending an evaluated change.

Then redeploy. No change to the existing Supabase URL or publishable key is required. Do not replace the two existing VITE_SUPABASE variables. No service-role key is needed. Do not use a ChatGPT session token or a dashboard password as an API credential.

When disabled or unconfigured, status says so and the Generate button remains disabled. Do not interpret the button as a sign-in failure. Set PK_AI_ENABLED to false and redeploy to disable model calls again.

The legacy database `knowledge_summary`/`app_access` AI flags describe the original read-only layer. The new `/api/answer` authenticated status and `/api/app-config` are authoritative for this optional generation feature; no database function grants model access.

## Data sent and retained

Only the question, bounded selected excerpts, their displayed title/author/date/locator/status, linked decision context, and fixed system instructions are sent to `https://api.openai.com/v1/responses`. Database tokens, the login email, source URLs, internal passage UUIDs, and whole documents are not included as separate credential/metadata fields. Any such information written inside an approved question or excerpt will still be part of that text; there is no automatic sensitive-data redaction.

Requests use `store: false`, no tools, no remote file search, no background mode, and no response chaining. API processing and abuse-monitoring retention can still apply. This is NOT a zero-retention guarantee or a fully local deployment. Use only the current non-sensitive pilot data until a separate data-handling review. Do not use patient records. Source systems are read-only; generated answers are not inserted as facts or decisions.

Browser state is in memory and cleared on sign-out/page close. Server code does not log question text, evidence, model output, credentials, or raw upstream errors. Provider/platform operational logging remains subject to their policies.

## Usage controls and limitations

Each approved generation makes at most one model request, with 2,400 maximum output tokens, no automatic retry, bounded inputs, and a 50-second request deadline. A per-IP/domain Netlify rule requests a limit of six endpoint requests per minute (including previews and status). Enforcement is not instantaneous; inspect deployment logs to confirm the rule. This is NOT a hard monthly spending cap. Provider/project billing limits require separate configuration. Returned token counts are provider-reported usage for that response, not a financial ledger.

## Validation performed

38 dependency-free Node tests passed locally: 15 existing security cases and 23 answer-layer tests using synthetic fixtures and mocked upstream services. The local asset build and JavaScript/TypeScript syntax checks passed. No paid API calls or real model outputs were tested. A local Chromium smoke test could not run because navigation was blocked by the runtime's administrator policy; browser behavior still needs validation after deployment.

Production validation: owner sign-in -> Ask AI -> preview known topic -> read passage -> (after activation) approve one answer -> inspect quotations -> sign out. Also validate non-owner/expired sessions against the actual deployment, provider account/model compatibility, quote relevance, insufficient evidence, and cost usage. Do not treat passing mocked tests as proof of end-to-end semantic quality or production security certification.

## Primary documentation consulted, 2026-10-05

- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- OpenAI data controls: https://developers.openai.com/api/docs/guides/your-data
- Model snapshot: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- Netlify function rate limits: https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/

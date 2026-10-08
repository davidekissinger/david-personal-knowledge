import type { Config } from '@netlify/functions';
import { AppError, json, readJson, searchInput, uuid } from '../../lib/http.mts';
import { connect } from '../../lib/backend.mts';

export default async (request: Request) => {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  try {
    const client = await connect(request, name => Netlify.env.get(name));
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body.action === 'search') {
        const params = searchInput(body);
        if (body.order !== undefined && !['newest', 'relevance'].includes(body.order as string)) throw new AppError(400, 'Choose newest or relevance ordering.');
        const rpc = body.order === 'relevance' ? 'search_passages' : 'search_passages_recent';
        const results = await client.call(`/rest/v1/rpc/${rpc}`, { method: 'POST', body: JSON.stringify(params) });
        return json({ mode: 'evidence-only', results, limit: 20, generatedAnswer: null });
      }
      if (body.action === 'passage') {
        const id = uuid(body.id);
        const rows = await client.call(`/rest/v1/passages?id=eq.${id}&select=id,record_id,content,citation_locator,ordinal&limit=1`) as unknown[];
        if (!rows.length) throw new AppError(404, 'This passage is unavailable or access was revoked.');
        return json({ passage: rows[0] });
      }
      throw new AppError(400, 'Unsupported read action. Imports are disabled.');
    }
    const action = new URL(request.url).searchParams.get('action') ?? 'summary';
    if (action === 'summary') return json(await client.call('/rest/v1/rpc/knowledge_summary', { method: 'POST', body: '{}' }));
    if (action === 'sources') return json({ rows: await client.call('/rest/v1/sources?select=id,source_type,source_name,sync_status,last_synced_at,created_at&order=created_at.desc&limit=100'), limit: 100 });
    if (action === 'decisions') return json({ rows: await client.call('/rest/v1/decisions?select=id,statement,status,effective_at,supporting_passage_id,supersedes_id,rationale,created_at&order=effective_at.desc.nullslast,created_at.desc&limit=100'), limit: 100 });
    throw new AppError(400, 'Unsupported read action.');
  } catch (error) {
    // Do not log tokens, queries, excerpts, passwords, or raw upstream errors.
    return json({ error: error instanceof AppError ? error.message : 'Request could not be completed.' }, error instanceof AppError ? error.status : 500);
  }
};
export const config: Config = { path: '/api/knowledge' };

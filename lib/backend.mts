import { AppError, bearer, publicConfig } from './http.mts';

export async function connect(request: Request, read: (name: string) => string | undefined, fetcher: typeof fetch = fetch) {
  // Check for a token before touching configuration or a remote service.
  const token = bearer(request);
  const { url, key } = publicConfig(read);
  const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function call(path: string, options: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${url}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10000) });
    } catch { throw new AppError(503, 'The data service is temporarily unavailable.'); }
    if (response.status === 401) throw new AppError(401, 'Your session expired. Please sign in again.');
    if (response.status === 403) throw new AppError(403, 'This account is not approved for the archive.');
    if (!response.ok) {
      let code: unknown;
      try { code = (await response.json()).code; } catch { /* Do not expose upstream details. */ }
      if (code === '57014') throw new AppError(504, 'The data request timed out. Please try again.');
      throw new AppError(503, 'The data request could not be completed.');
    }
    try { return await response.json(); } catch { throw new AppError(503, 'The data service returned an invalid response.'); }
  }
  // Authoritative Auth lookup: never trust a decoded browser token alone.
  const user = await call('/auth/v1/user') as { id?: string; email_confirmed_at?: string };
  if (!user?.id || !user.email_confirmed_at) throw new AppError(403, 'A confirmed application account is required.');
  const access = await call('/rest/v1/rpc/app_access', { method: 'POST', body: '{}' }) as { approved?: boolean };
  if (access?.approved !== true) throw new AppError(403, 'Your account exists, but owner approval is still required.');
  return { call, user };
}

type RecordListRow = {
  id: string; title: string | null; occurred_at: string | null;
  record_status: 'active' | 'closed'; author_name: string | null;
  source: { source_name: string }; passages: { id: string }[];
};

export async function recentRecords(call: (path: string) => Promise<unknown>) {
  // The named composite relationships preserve the record/source owner match.
  // RLS still governs every row, including source revocation and passage access.
  const query = new URLSearchParams({
    select: 'id,title,occurred_at,record_status,author_name,source:sources!records_source_owner_fk!inner(source_name),passages:passages!passages_record_owner_fk(id)',
    record_status: 'in.(active,closed)',
    'source.sync_status': 'neq.revoked',
    order: 'occurred_at.desc.nullslast,id.asc',
    'passages.order': 'ordinal.asc,id.asc',
    'passages.limit': '1',
    limit: '30',
  });
  const rows = await call(`/rest/v1/records?${query}`) as RecordListRow[];
  return rows.map(row => ({
    id: row.id, title: row.title, occurred_at: row.occurred_at,
    record_status: row.record_status, source_name: row.source.source_name,
    author_name: row.author_name, passage_id: row.passages[0]?.id ?? null,
  }));
}


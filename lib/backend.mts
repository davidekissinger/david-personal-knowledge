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
    if (!response.ok) throw new AppError(503, 'The data request could not be completed.');
    try { return await response.json(); } catch { throw new AppError(503, 'The data service returned an invalid response.'); }
  }
  // Authoritative Auth lookup: never trust a decoded browser token alone.
  const user = await call('/auth/v1/user') as { id?: string; email_confirmed_at?: string };
  if (!user?.id || !user.email_confirmed_at) throw new AppError(403, 'A confirmed application account is required.');
  const access = await call('/rest/v1/rpc/app_access', { method: 'POST', body: '{}' }) as { approved?: boolean };
  if (access?.approved !== true) throw new AppError(403, 'Your account exists, but owner approval is still required.');
  return { call, user };
}

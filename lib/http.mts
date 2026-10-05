export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  }});
}

export function bearer(request: Request): string {
  const value = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/i.test(value) || value.length > 8192) {
    throw new AppError(401, 'Please sign in to your application account.');
  }
  return value.slice(7);
}

export function publicConfig(read: (name: string) => string | undefined) {
  const url = read('VITE_SUPABASE_URL')?.replace(/\/$/, '');
  const key = read('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key?.startsWith('sb_publishable_')) {
    throw new AppError(503, 'Application configuration is not ready.');
  }
  return { url, key };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AppError(415, 'Send application/json.');
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new AppError(403, 'Cross-origin request rejected.');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 16384) throw new AppError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'A JSON object is required.');
  const decoder = new TextDecoder(); let bytes = 0; let text = '';
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new AppError(413, 'Request is too large.'); }
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AppError(400, 'A JSON object is required.'); }
}

export function searchInput(body: Record<string, unknown>) {
  if (typeof body.query !== 'string' || body.query.trim().length < 2 || body.query.length > 500) {
    throw new AppError(400, 'Enter a search between 2 and 500 characters.');
  }
  if (body.includeHistory !== undefined && typeof body.includeHistory !== 'boolean') {
    throw new AppError(400, 'includeHistory must be a boolean.');
  }
  return { search_query: body.query.trim(), max_results: 20, include_history: body.includeHistory === true };
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'A valid record identifier is required.');
  }
  return value;
}

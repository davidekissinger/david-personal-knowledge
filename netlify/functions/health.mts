import type { Config } from '@netlify/functions';
import { json } from '../../lib/http.mts';
export default async (request: Request) => request.method === 'GET'
  ? json({ service: 'personal-knowledge', version: '0.2.0', phase: 'read-only-pilot', importsEnabled: false, aiEnabled: false })
  : json({ error: 'Method not allowed.' }, 405);
export const config: Config = { path: '/api/health' };

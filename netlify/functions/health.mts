import type { Config } from '@netlify/functions';
import { json } from '../../lib/http.mts';
import { aiAvailability } from '../../lib/answers.mts';
export default async (request: Request) => request.method === 'GET'
  ? json({ service: 'personal-knowledge', version: '0.5.0', phase: 'vault-foundation', multiClientEnabled: false, importsEnabled: false, aiEnabled: aiAvailability(name => typeof Netlify === 'undefined' ? undefined : Netlify.env.get(name)).ready })
  : json({ error: 'Method not allowed.' }, 405);
export const config: Config = { path: '/api/health' };


import type { Config } from '@netlify/functions';
import { AppError, json, publicConfig } from '../../lib/http.mts';
import { aiAvailability } from '../../lib/answers.mts';
export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const read = (name: string) => Netlify.env.get(name);
    const { url, key } = publicConfig(read);
    return json({ supabaseUrl: url, publishableKey: key, version: '0.4.4', importsEnabled: false, aiEnabled: aiAvailability(read).ready });
  } catch (error) {
    return json({ error: error instanceof AppError ? error.message : 'Configuration unavailable.' }, 503);
  }
};
export const config: Config = { path: '/api/app-config' };

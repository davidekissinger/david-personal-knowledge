import type { Config } from '@netlify/functions';
import { AppError, json, publicConfig } from '../../lib/http.mts';

export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const { url, key } = publicConfig(name => Netlify.env.get(name));
    return json({ supabaseUrl: url, publishableKey: key, version: '0.2.0', importsEnabled: false, aiEnabled: false });
  } catch (error) {
    return json({ error: error instanceof AppError ? error.message : 'Configuration unavailable.' }, 503);
  }
};
export const config: Config = { path: '/api/app-config' };

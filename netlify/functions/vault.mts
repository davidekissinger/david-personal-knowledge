import type { Config } from '@netlify/functions';
import { connect } from '../../lib/backend.mts';
import { AppError, json } from '../../lib/http.mts';
import { resolveVault } from '../../lib/vault.mts';

export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const client = await connect(request, name => Netlify.env.get(name));
    const vault = await resolveVault(client.call);
    return json({ vault, onboardingEnabled: false, importsEnabled: false, multiClientEnabled: false });
  } catch (error) {
    return error instanceof AppError ? json({ error: error.message }, error.status)
      : json({ error: 'The vault request could not be completed.' }, 503);
  }
};
export const config: Config = { path: '/api/vault' };

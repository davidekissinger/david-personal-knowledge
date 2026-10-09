import { AuthClient } from '@supabase/auth-js';

// Each ceremony owns a short-lived, memory-only client. No refresh session survives it.
export async function passkeyCeremony(configuration, { signal, session } = {}) {
  const client = new AuthClient({
    url: `${configuration.supabaseUrl}/auth/v1`,
    headers: { apikey: configuration.publishableKey },
    storageKey: `mypkr-ceremony-${crypto.randomUUID()}`,
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    experimental: { passkey: true },
    fetch(url, options = {}) {
      return fetch(url, { ...options, cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)].filter(Boolean)) });
    },
  });
  try {
    if (session) {
      const { error } = await client.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
      if (error) throw error;
      signal?.throwIfAborted();
      const result = await client.registerPasskey({ options: { signal } });
      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error('Passkey setup was not confirmed.');
      return result.data;
    }
    const result = await client.signInWithPasskey({ options: { signal } });
    if (result.error) throw result.error;
    if (!result.data?.session?.access_token) throw new Error('Passkey sign-in was not confirmed.');
    return result.data.session;
  } finally {
    await client.dispose();
  }
}

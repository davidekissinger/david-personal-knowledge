import { AppError, uuid } from './http.mts';

// No browser-supplied vault, URL, plan, or metadata can choose a backend.
// Keep owner approval in connect() until the full multi-client release gate passes.
export async function resolveVault(call: (path: string, options?: RequestInit) => Promise<unknown>) {
  const value = await call('/rest/v1/rpc/my_vault', { method: 'POST', body: '{}' });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(403, 'Your active vault is unavailable.');
  const vault = value as Record<string, unknown>;
  if (vault.status !== 'active' || vault.role !== 'owner' || vault.deploymentProfile !== 'managed_shared') {
    throw new AppError(403, 'Your active vault is unavailable.');
  }
  let id: string;
  try { id = uuid(vault.id); } catch { throw new AppError(503, 'The vault service returned an invalid response.'); }
  return { id, role: 'owner', deploymentProfile: 'managed_shared', status: 'active' };
}

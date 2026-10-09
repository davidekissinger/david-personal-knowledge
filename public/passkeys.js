const preferenceKey = 'mypkr.passkey.auto.v1';

export function passkeyMessage(error) {
  if (error?.code === 'passkey_disabled') return 'Fingerprint setup needs to be enabled for myPKR. Use your password for now.';
  if (error?.code === 'webauthn_credential_exists') return 'This passkey already exists. Sign out and try Unlock with fingerprint.';
  if (error?.code === 'webauthn_challenge_expired') return 'The fingerprint request expired. Tap Unlock with fingerprint to try again.';
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError' || /cancel|not allowed|timed out/i.test(error?.message || '')) return 'Fingerprint was not completed. Tap to try again, or use your password.';
  return 'Fingerprint is unavailable. Try again or use your password.';
}

export function createPasskeys({ window, document, fetcher = fetch, ceremony, acceptSession, getSession, beforeUnlock = () => {} }) {
  const $ = id => document.getElementById(id);
  let configuration;
  let ready = false;
  let active = null;
  let version = 0;
  const setMessage = (text, error = false, setup = false) => {
    const node = $(setup ? 'passkey-setup-message' : 'login-message');
    node.textContent = text; node.classList.toggle('error', error);
  };
  // This single preference contains no identity, credential, token, or record data.
  function remembersDevice() { try { return window.localStorage.getItem(preferenceKey) === '1'; } catch { return false; } }
  function rememberDevice() { try { window.localStorage.setItem(preferenceKey, '1'); } catch { /* Manual unlock still works. */ } }
  function controls() {
    $('passkey-unlock').disabled = !ready || !!active;
    $('passkey-register').disabled = !ready || !!active;
  }
  function cancel() { version++; active?.abort(); active = null; controls(); }
  async function unlock({ automatic = false } = {}) {
    if (!ready || active || getSession() || (automatic && !remembersDevice())) return;
    beforeUnlock();
    const current = ++version;
    const controller = new AbortController(); active = controller; controls();
    setMessage('Use your fingerprint or device screen lock…');
    try {
      const data = await ceremony(configuration, { signal: controller.signal });
      if (version !== current) return;
      // The application checks the approved-owner API before exposing any records.
      await acceptSession(data);
      if (version === current) rememberDevice();
    } catch (error) {
      if (version !== current) return;
      setMessage(passkeyMessage(error), true);
    } finally { if (version === current) { active = null; controls(); } }
  }
  async function register() {
    const session = getSession();
    if (!ready || active || !session) return;
    const current = ++version;
    const controller = new AbortController(); active = controller; controls();
    setMessage('Follow your device’s prompt to create a myPKR passkey…', false, true);
    try {
      await ceremony(configuration, { signal: controller.signal, session });
      if (version !== current || getSession() !== session) return;
      rememberDevice();
      setMessage('Fingerprint sign-in is ready. Next time you open myPKR on this browser, it will ask to unlock.', false, true);
    } catch (error) {
      if (version === current) setMessage(passkeyMessage(error), true, true);
    } finally { if (version === current) { active = null; controls(); } }
  }
  $('passkey-unlock').addEventListener('click', () => unlock());
  $('passkey-register').addEventListener('click', register);
  $('password-choice').addEventListener('click', () => { cancel(); setMessage('Sign in with your application password.'); });
  async function initialize(config) {
    configuration = config;
    controls();
    const current = version;
    const supported = window.isSecureContext && window.PublicKeyCredential && window.navigator?.credentials;
    if (!supported) {
      $('password-fallback').open = true;
      setMessage('Use a current browser with a device screen lock for fingerprint sign-in. Your password still works.');
      return;
    }
    try {
      const response = await fetcher(`${config.supabaseUrl}/auth/v1/settings`, { cache: 'no-store', headers: { apikey: config.publishableKey }, signal: AbortSignal.timeout(10000) });
      const settings = await response.json();
      if (!response.ok) throw new Error();
      ready = settings.passkeys_enabled === true;
      $('passkey-setup').hidden = false;
      $('passkey-setup-message').textContent = ready ? 'Set up once on this device. Your fingerprint, face, or PIN stays with your device.' : 'Fingerprint sign-in needs to be enabled for myPKR before setup is available.';
      if (!ready) {
        $('password-fallback').open = true;
        setMessage('Fingerprint sign-in is awaiting activation. Use your password for now.');
      } else if (current === version) {
        $('password-fallback').open = !remembersDevice();
        setMessage('Unlock with your saved passkey. First visit? Sign in with your password to set up fingerprint.');
      }
    } catch {
      $('password-fallback').open = true;
      setMessage('Could not check fingerprint availability. Your password still works.');
    }
    controls();
    if (current === version) await unlock({ automatic: true });
  }
  return { initialize, unlock, cancel, get busy() { return !!active; } };
}

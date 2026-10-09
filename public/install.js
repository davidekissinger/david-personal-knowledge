// Installation is independent of application sign-in and never stores user data.
export function setupInstall(window, document) {
  const open = document.getElementById('install-open');
  const dialog = document.getElementById('install-dialog');
  const install = document.getElementById('install-native');
  const message = document.getElementById('install-message');
  const status = document.getElementById('install-status');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let deferredPrompt = null;
  let installed = standalone.matches || window.navigator.standalone === true;

  open.hidden = installed;
  open.addEventListener('click', () => dialog.showModal());

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (installed) return;
    deferredPrompt = event;
    install.hidden = false;
  });

  install.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null; // Each browser prompt can be used only once.
    install.disabled = true;
    message.textContent = '';
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (!installed) message.textContent = outcome === 'accepted'
        ? 'Follow any remaining browser prompts to finish installing PKR.'
        : 'You can add PKR later using your browser menu.';
    } catch {
      message.textContent = 'Use the browser-menu steps below to add PKR.';
    } finally {
      install.hidden = installed || !deferredPrompt;
      install.disabled = false;
    }
  });

  function markInstalled() {
    installed = true;
    deferredPrompt = null;
    open.hidden = true;
    install.hidden = true;
    if (dialog.open) dialog.close();
    status.textContent = 'PKR is ready on your device.';
  }

  window.addEventListener('appinstalled', markInstalled);
  standalone.addEventListener('change', event => {
    if (event.matches) markInstalled();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setupInstall(window, document);
}

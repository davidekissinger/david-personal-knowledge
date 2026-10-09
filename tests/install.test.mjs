import test from 'node:test';
import assert from 'node:assert/strict';
import { setupInstall } from '../public/install.js';

function surface({ standalone = false, ios = false } = {}) {
  function target() {
    const listeners = new Map();
    return {
      hidden: true, disabled: false, textContent: '', open: false,
      addEventListener(type, fn) { listeners.set(type, fn); },
      emit(type, event = {}) { return listeners.get(type)?.(event); },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
  }
  const nodes = Object.fromEntries(['install-open', 'install-dialog', 'install-native', 'install-message', 'install-status'].map(id => [id, target()]));
  const media = { ...target(), matches: standalone };
  const window = { ...target(), navigator: { standalone: ios }, matchMedia: () => media };
  setupInstall(window, { getElementById: id => nodes[id] });
  return { window, media, nodes };
}

test('manual installation guide is available without browser install support', () => {
  const { nodes } = surface();
  assert.equal(nodes['install-open'].hidden, false);
  assert.equal(nodes['install-native'].hidden, true);
  nodes['install-open'].emit('click');
  assert.equal(nodes['install-dialog'].open, true);
  assert.equal(nodes['install-status'].textContent, '');
});

test('accepting a prompt does not claim installation until the browser confirms it', async () => {
  const { window, nodes } = surface();
  let prompts = 0;
  let prevented = false;
  window.emit('beforeinstallprompt', {
    preventDefault() { prevented = true; },
    async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(prevented, true);
  assert.equal(nodes['install-native'].hidden, false);
  nodes['install-open'].emit('click');
  await nodes['install-native'].emit('click');
  await nodes['install-native'].emit('click');
  assert.equal(prompts, 1);
  assert.equal(nodes['install-open'].hidden, false);
  assert.equal(nodes['install-status'].textContent, '');
  window.emit('appinstalled');
  assert.equal(nodes['install-open'].hidden, true);
  assert.equal(nodes['install-dialog'].open, false);
  assert.equal(nodes['install-status'].textContent, 'PKR is ready on your device.');
});

test('dismissed or failed prompts preserve manual installation and allow a fresh prompt', async () => {
  const { window, nodes } = surface();
  for (const outcome of ['dismissed', 'failure']) {
    window.emit('beforeinstallprompt', {
      preventDefault() {},
      async prompt() { if (outcome === 'failure') throw new Error('Unavailable'); },
      userChoice: Promise.resolve({ outcome }),
    });
    assert.equal(nodes['install-native'].hidden, false);
    await nodes['install-native'].emit('click');
    assert.equal(nodes['install-native'].hidden, true);
    assert.equal(nodes['install-native'].disabled, false);
    assert.equal(nodes['install-open'].hidden, false);
    assert.match(nodes['install-message'].textContent, /browser/);
    assert.equal(nodes['install-status'].textContent, '');
  }
});

test('standalone Android and iOS launches hide installation controls', () => {
  for (const options of [{ standalone: true }, { ios: true }]) {
    const { window, nodes } = surface(options);
    window.emit('beforeinstallprompt', { preventDefault() {} });
    assert.equal(nodes['install-open'].hidden, true);
    assert.equal(nodes['install-native'].hidden, true);
  }
});

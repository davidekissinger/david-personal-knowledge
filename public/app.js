import { createAnswers } from './answers.js';
import { createCapture } from './capture.js';
import { createPasskeys } from './passkeys.js';
import { resultRow, newestFirst, orderControl, groupSearchResults } from './list-ui.js';
const $ = id => document.getElementById(id);
let configuration = null;
let session = null;
let generation = 0;
let expiryTimer = null;
let lastActivity = Date.now();
let loginAttempt = 0;
let unlockOnReturn = false;

function message(id, text = '', error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; }
function date(value) { if (!value) return 'Not recorded'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Not recorded' : d.toLocaleString(); }
function empty(id, text) { $(id).replaceChildren(element('p', text, 'empty')); }
function resetWorkspace() {
  loginAttempt++; passkeys.cancel(); message('passkey-setup-message');
  generation++; session = null; clearTimeout(expiryTimer); answers.reset(); capture.reset();
  $('workspace').hidden = true; $('login-view').hidden = false; $('password').value = '';
  for (const id of ['search-results', 'source-list', 'decision-list', 'evidence-content', 'account-email', 'evidence-locator']) $(id).replaceChildren();
  for (const id of ['source-count', 'record-count', 'passage-count', 'decision-count']) $(id).textContent = '—';
  for (const id of ['workspace-message', 'search-message', 'evidence-message']) message(id);
  $('question').value = ''; $('include-history').checked = false;
  if ($('evidence-dialog').open) $('evidence-dialog').close();
  $('evidence-details').open = false; $('evidence-details').hidden = true;
}
async function signOut(note = 'You have signed out.') {
  const previous = session;
  resetWorkspace(); message('login-message', note);
  if (previous && configuration) {
    // Best-effort revocation of this session; clearing local data does not depend on network success.
    try { await fetch(`${configuration.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: configuration.publishableKey, Authorization: `Bearer ${previous.accessToken}` }, signal: AbortSignal.timeout(10000) }); } catch { /* Local session has already been cleared. */ }
  }
}
async function api(action, payload) {
  if (!session) throw new Error('Please sign in.');
  const currentGeneration = generation;
  const endpoint = action.startsWith('answer-') ? '/api/answer' : '/api/knowledge';
  const response = await fetch(payload ? endpoint : `${endpoint}?action=${encodeURIComponent(action)}`, {
    method: payload ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(action.startsWith('answer-') ? 60000 : 15000),
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ ...payload, action }) } : {}),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(response.status === 429 ? 'Too many requests. Wait a minute before trying again.' : 'The application service is unavailable.'); }
  if (generation !== currentGeneration) throw new Error('Session changed. Please sign in again.');
  if (response.status === 401 || response.status === 403) {
    await signOut(data.error || 'Please sign in again.');
    throw new Error(data.error || 'Access was not approved.');
  }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
async function showEvidence(id) {
  const currentGeneration = generation;
  $('evidence-content').replaceChildren(); $('evidence-locator').textContent = '';
  $('evidence-details').open = false; $('evidence-details').hidden = true;
  message('evidence-message', 'Loading source passage…'); $('evidence-dialog').showModal();
  try {
    const { passage } = await api('passage', { id });
    if (generation !== currentGeneration) return;
    $('evidence-locator').textContent = passage.citation_locator || `Passage ${passage.ordinal + 1}`;
    $('evidence-details').hidden = false;
    $('evidence-content').textContent = passage.content;
    message('evidence-message');
  } catch (error) { if (generation === currentGeneration) message('evidence-message', error.message, true); }
}
function evidenceButton(id) { const b = element('button', 'Read source passage', 'secondary'); b.type = 'button'; b.addEventListener('click', () => showEvidence(id)); return b; }
function sourceLink(value) {
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const link = element('a', 'Open original source'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch { return null; }
}
function renderSearch(rows) {
  $('search-results').replaceChildren();
  const groups = groupSearchResults(rows);
  const counts = { records: groups.length, passages: groups.reduce((total, group) => total + group.matches.length, 0) };
  if (!groups.length) { empty('search-results', 'No matches were found in your saved records. Try another name or phrase. Information you have not added yet is not included in this search.'); return counts; }
  for (const { record: row, matches } of groups) {
    const { card, body, toggle } = resultRow(row.title, row.occurred_at);
    body.append(element('span', row.record_status, 'status-tag'),
      element('p', `${row.source_name} · ${row.author_name || 'Author not recorded'} · ${date(row.occurred_at)}`, 'meta'));
    const multiple = matches.length > 1;
    if (multiple) body.append(element('p', `${matches.length} matching passages in this record. Open a section to read it.`, 'meta'));
    for (const [index, match] of matches.entries()) {
      const section = element(multiple ? 'details' : 'div', undefined, multiple ? 'passage-section' : 'single-passage');
      if (multiple) {
        const heading = element('summary');
        heading.append(element('span', `Matching passage ${index + 1}`, 'passage-label'));
        const preview = (match.excerpt || '').trim().split(/\r?\n/)[0];
        if (preview) heading.append(element('span', preview.length > 120 ? `${preview.slice(0, 117)}…` : preview, 'passage-preview'));
        section.append(heading);
      }
      const content = element('p', '', 'excerpt');
      const locator = element('p', '', 'meta');
      const sourceDetails = element('details', undefined, 'source-details');
      sourceDetails.hidden = true;
      sourceDetails.append(element('summary', 'Source details'), locator);
      const status = element('p', '', 'message'); status.setAttribute('role', 'status');
      section.append(status, content, sourceDetails);
      body.append(section);
      let requestVersion = 0;
      async function showPassage(expanded) {
        const version = ++requestVersion;
        const currentGeneration = generation;
        content.textContent = ''; locator.textContent = ''; status.textContent = '';
        sourceDetails.open = false; sourceDetails.hidden = true;
        status.classList.remove('error');
        if (!expanded) return;
        status.textContent = 'Loading source passage…';
        const isCurrent = () => generation === currentGeneration && version === requestVersion && card.isConnected && !body.hidden && (!multiple || section.open);
        try {
          const { passage } = await api('passage', { id: match.passage_id });
          if (!isCurrent()) return;
          content.textContent = passage.content;
          locator.textContent = passage.citation_locator || 'Locator not recorded';
          sourceDetails.hidden = false;
          status.textContent = '';
        } catch (error) {
          if (!isCurrent()) return;
          status.textContent = `${error.message} Collapse and expand to try again.`;
          status.classList.add('error');
        }
      }
      if (multiple) section.addEventListener('toggle', () => { void showPassage(section.open && !body.hidden); });
      toggle.addEventListener('click', () => {
        if (body.hidden || !multiple) void showPassage(!body.hidden);
      });
    }
    const link = sourceLink(row.source_uri); if (link) { const p = element('p'); p.append(link); body.append(p); }
    $('search-results').append(card);
  }
  return counts;
}
async function loadView(name) {
  for (const item of document.querySelectorAll('[data-view]')) { if (item.dataset.view === name) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
  for (const view of ['ask', 'answer', 'capture', 'sources', 'decisions']) $(`view-${view}`).hidden = view !== name;
  message('workspace-message');
  if (name === 'answer') return answers.open();
  if (name === 'ask' || name === 'capture') return;
  const container = name === 'sources' ? 'source-list' : 'decision-list';
  empty(container, 'Loading your record…');
  try {
    const { rows } = await api(name);
    $(container).replaceChildren();
    if (!rows.length) { empty(container, name === 'sources' ? 'Your record has no sources yet. Choose Add to myPKR to prepare your first request.' : 'Your record has no decision entries to show yet.'); return; }
    const getDate = row => name === 'sources' ? row.created_at : row.effective_at;
    $(container).append(element('p', name === 'sources' ? 'Newest first by date cataloged.' : 'Newest first by effective date. Undated entries appear last.', 'fine'));
    for (const row of newestFirst(rows, getDate)) {
      const { card, body } = resultRow(name === 'sources' ? row.source_name : row.statement, getDate(row), name === 'sources' ? 'Date cataloged' : 'Effective date');
      if (name === 'sources') {
        body.append(element('span', row.sync_status, 'status-tag'), element('p', `Type: ${row.source_type} · Cataloged: ${date(row.created_at)} · Last sync: ${date(row.last_synced_at)}`, 'meta'));
      } else {
        body.append(element('span', row.status, 'status-tag'), element('p', `Effective: ${date(row.effective_at)}${row.supersedes_id ? ' · Linked to an earlier decision' : ''}`, 'meta'));
        if (row.rationale) body.append(element('p', row.rationale));
        if (row.supporting_passage_id) body.append(evidenceButton(row.supporting_passage_id));
        else body.append(element('p', 'No supporting passage is attached. Treat this as an unsupported entry.', 'meta'));
      }
      $(container).append(card);
    }
  } catch (error) { empty(container, 'Your records could not be loaded. Try again before drawing conclusions about what is saved.'); message('workspace-message', error.message, true); }
}
const answers = createAnswers({ api, showEvidence });
const capture = createCapture({ findRecord(title) {
  void loadView('ask');
  $('question').value = title;
  $('question').focus();
  $('search-form').requestSubmit();
} });
async function acceptSession(data) {
  if (document.hidden) throw new Error('Return to myPKR and unlock again.');
  if (!data.access_token || !data.refresh_token || !data.user?.id) throw new Error('Sign-in was not successful.');
  session = { accessToken: data.access_token, refreshToken: data.refresh_token, email: data.user.email };
  generation++; lastActivity = Date.now();
  const acceptedGeneration = generation;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => { void signOut('Your session expired. Please unlock again.'); }, Math.max(1000, ((Number(data.expires_in) || 3600) - 15) * 1000));
  try {
    const summary = await api('summary');
    if (generation !== acceptedGeneration || !session) throw new Error('Session changed. Please sign in again.');
    if (document.hidden) throw new Error('Return to myPKR and unlock again.');
    $('account-email').textContent = session.email || 'Approved account';
    for (const [id, field] of [['source-count', 'sources'], ['record-count', 'records'], ['passage-count', 'passages'], ['decision-count', 'decisions']]) $(id).textContent = Number(summary[field]).toLocaleString();
    $('login-view').hidden = true; $('workspace').hidden = false;
    await loadView('ask');
    empty('search-results', summary.passages ? 'What would you like to find in your record? Try a name, memory, or phrase.' : 'Your record has no searchable passages yet. Choose Add to myPKR to prepare your first request for ChatGPT.');
    message('login-message'); $('question').focus();
  } catch (error) {
    if (generation === acceptedGeneration && session) await signOut(error.message || 'Sign-in could not be completed. Please try again.');
    throw error;
  }
}
const passkeys = createPasskeys({ window, document, acceptSession, getSession: () => session,
  beforeUnlock: () => { loginAttempt++; },
  ceremony: async (...args) => { const { passkeyCeremony } = await import('./auth-sdk.js'); return passkeyCeremony(...args); },
});
const searchOrder = orderControl('search-order');
$('search-form').append(searchOrder.container);
searchOrder.select.addEventListener('change', () => { if ($('question').value.trim().length >= 2) $('search-form').requestSubmit(); });
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!configuration) return;
  passkeys.cancel();
  const attempt = ++loginAttempt;
  $('login-button').disabled = true; message('login-message', 'Signing in…');
  try {
    const credentials = { email: $('email').value.trim(), password: $('password').value };
    $('password').value = '';
    const response = await fetch(`${configuration.supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: configuration.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (attempt !== loginAttempt) return;
    if (!response.ok || !data.access_token || !data.user?.id) throw new Error('Sign-in was not successful. Check your application account and password.');
    await acceptSession(data);
  } catch (error) {
    if (attempt !== loginAttempt) return;
    if (session) await signOut('');
    message('login-message', error.message || 'Sign-in is unavailable.', true);
  } finally { $('login-button').disabled = !configuration; }
});
$('search-form').addEventListener('submit', async event => {
  event.preventDefault(); if ($('search-button').disabled) return;
  const order = searchOrder.select.value;
  $('search-button').disabled = true; searchOrder.select.disabled = true; message('search-message', 'Searching your saved records…');
  $('search-results').replaceChildren();
  try {
    const data = await api('search', { query: $('question').value.trim(), includeHistory: $('include-history').checked, order });
    const counts = renderSearch(data.results);
    message('search-message', `${counts.records} record${counts.records === 1 ? '' : 's'} · ${counts.passages} matching passage${counts.passages === 1 ? '' : 's'}, ${order === 'newest' ? 'newest to oldest by record date' : 'most relevant first'}. Search returns up to ${data.limit} matching passages, grouped by record.`);
  } catch (error) { message('search-message', error.message, true); }
  finally { $('search-button').disabled = false; searchOrder.select.disabled = false; }
});
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { void loadView(button.dataset.view); });
for (const button of document.querySelectorAll('[data-open-view]')) button.addEventListener('click', () => { void loadView(button.dataset.openView); $('pkr-title').focus(); });
$('sign-out').addEventListener('click', () => { void signOut(); });
$('close-evidence').addEventListener('click', () => $('evidence-dialog').close());
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (session && Date.now() - lastActivity > 15 * 60 * 1000) void signOut('Signed out after 15 minutes of inactivity.'); }, 30000);
window.addEventListener('pagehide', resetWorkspace);
window.addEventListener('pageshow', event => { if (event.persisted) void passkeys.unlock({ automatic: true }); });
document.addEventListener('visibilitychange', () => {
  // Native passkey dialogs can temporarily hide the page during a ceremony.
  if (document.hidden && session && !passkeys.busy) {
    unlockOnReturn = true; void signOut('myPKR is locked. Unlock to continue.');
  } else if (!document.hidden && unlockOnReturn) {
    unlockOnReturn = false; void passkeys.unlock({ automatic: true });
  }
});
try {
  const response = await fetch('/api/app-config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.supabaseUrl || !data.publishableKey) throw new Error();
  configuration = data; $('login-button').disabled = false;
  await passkeys.initialize(configuration);
} catch { message('login-message', 'Application configuration is unavailable. A completed Netlify deployment and Functions-scoped configuration are required.', true); }

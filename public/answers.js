// No credentials, archive contents, or conversation state are persisted by this module.
export function createAnswers({ api, showEvidence }) {
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const sourceDetails = locator => {
    const details = make('details', undefined, 'source-details');
    details.append(make('summary', 'Source details'), make('p', locator || 'Locator not recorded', 'meta'));
    return details;
  };
  const nav = document.querySelector('.tabs');
  const tab = make('button', 'Ask AI'); tab.dataset.view = 'answer'; nav.append(tab);
  const panel = make('section', undefined, 'panel'); panel.id = 'view-answer'; panel.hidden = true;
  const heading = make('div', undefined, 'section-heading');
  const headings = make('div'); headings.append(make('p', 'Evidence-linked answers', 'eyebrow'), make('h2', 'Ask a question about your records'));
  const badge = make('span', 'Checking setup', 'badge subtle'); heading.append(headings, badge);
  const status = make('p', '', 'message'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const note = make('p', 'First review the selected evidence. Generation is optional and sends this question and the displayed evidence to OpenAI. Ordinary keyword search never sends a model request.', 'muted');
  const form = make('form'); const label = make('label', 'Your question'); label.htmlFor = 'answer-question';
  const row = make('div', undefined, 'search-row'); const question = make('input'); question.id = 'answer-question'; question.required = true; question.minLength = 2; question.maxLength = 500; question.placeholder = 'What does the deployment design say about keeping customer data private?';
  const previewButton = make('button', 'Preview evidence'); previewButton.type = 'submit'; row.append(question, previewButton);
  const historyLabel = make('label', undefined, 'check'); const history = make('input'); history.type = 'checkbox'; historyLabel.append(history, document.createTextNode(' Include superseded records as historical evidence'));
  form.append(label, row, historyLabel);
  const previewArea = make('div'); const approvalArea = make('div', undefined, 'callout'); approvalArea.hidden = true;
  const consentLabel = make('label', undefined, 'check'); const consent = make('input'); consent.type = 'checkbox';
  consentLabel.append(consent, document.createTextNode(' I approve sending this question and the displayed evidence to OpenAI for one answer.'));
  const disclosure = make('p', 'This uses separately billed API usage. Response storage is disabled in the request, but provider abuse-monitoring retention may still apply; this is not a zero-retention guarantee. Do not use patient records or other restricted material in this pilot.', 'fine');
  const generate = make('button', 'Generate cited answer'); generate.type = 'button'; generate.disabled = true;
  approvalArea.append(consentLabel, disclosure, generate);
  const output = make('div'); output.setAttribute('aria-live', 'polite');
  panel.append(heading, note, form, status, previewArea, approvalArea, output);
  document.getElementById('view-ask').after(panel);
  const footer = document.querySelector('footer span'); if (footer) footer.textContent = 'v0.3.0';
  const loginNote = document.querySelector('.login-panel .callout p');
  if (loginNote) loginNote.textContent = 'Use your approved application account. There is no public registration or uploader. The optional Ask AI panel requires separate server setup and evidence approval.';
  const workspaceNote = document.querySelector('.workspace-note');
  if (workspaceNote) workspaceNote.textContent = 'Source records remain read-only. Closed records remain closed. Only an explicitly approved Ask AI request sends selected evidence to a model provider.';
  let preview = null; let revision = 0; let busy = false; let ready = false;
  function say(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function controls() { question.disabled = busy; history.disabled = busy; previewButton.disabled = busy; consent.disabled = busy; generate.disabled = busy || !ready || !preview?.evidence.length || !consent.checked; }
  function invalidate() { revision++; preview = null; consent.checked = false; previewArea.replaceChildren(); output.replaceChildren(); approvalArea.hidden = true; controls(); }
  function reset() { invalidate(); busy = false; ready = false; question.value = ''; history.checked = false; say(''); controls(); }
  async function open() {
    const ticket = revision;
    try { const state = await api('answer-status'); if (ticket !== revision) return; ready = state.ready; badge.textContent = ready ? 'Approval required' : 'AI off · preview available'; say(state.message); controls(); }
    catch (error) { if (ticket === revision) say(error.message, true); }
  }
  question.addEventListener('input', invalidate); history.addEventListener('change', invalidate); consent.addEventListener('change', controls);
  form.addEventListener('submit', async event => {
    event.preventDefault(); invalidate(); const ticket = revision; busy = true; controls(); say('Retrieving evidence within your account. No model call is being made…');
    try {
      const result = await api('answer-preview', { query: question.value.trim(), includeHistory: history.checked });
      if (ticket !== revision) return;
      preview = result; ready = result.ai.ready; badge.textContent = ready ? 'Approval required' : 'AI off · preview available';
      previewArea.append(make('p', `Planned provider: ${result.provider} · Model: ${result.model}`, 'meta'), make('p', result.coverage, 'fine'));
      if (!result.evidence.length) say('No supporting passages were retrieved. No model will be called. Try a more specific question or use keyword search.');
      else {
        for (const source of result.evidence) {
          const card = make('article', undefined, 'evidence-card'); const details = make('details');
          details.append(make('summary', `${source.id} · ${source.title}`), make('p', `${source.sourceName} · ${source.author || 'Author not recorded'} · ${source.date || 'Date not recorded'} · ${source.recordStatus}`, 'meta'), make('p', source.excerpt, 'excerpt'), sourceDetails(source.locator));
          for (const decision of source.decisions) details.append(make('p', `Recorded decision (${decision.status}; effective ${decision.effectiveAt || 'not recorded'}): ${decision.statement}`), make('p', decision.rationale, 'fine'));
          const citation = result.citations.find(c => c.id === source.id);
          const button = make('button', 'Read source passage', 'secondary'); button.type = 'button'; button.addEventListener('click', () => { void showEvidence(citation.passageId); });
          details.append(button); card.append(details); previewArea.append(card);
        }
        approvalArea.hidden = false;
        say(ready ? `${result.evidence.length} passages selected. Review them, then approve one model request.` : `${result.evidence.length} passages selected. Preview works; AI generation is not activated. ${result.ai.message}`);
      }
    } catch (error) { if (ticket === revision) say(error.message, true); }
    finally { if (ticket === revision) { busy = false; controls(); } }
  });
  generate.addEventListener('click', async () => {
    if (!preview || !consent.checked || !ready || busy) return;
    const ticket = revision; busy = true; controls(); output.replaceChildren(); say('Generating a cited answer from the approved evidence…');
    try {
      const answer = await api('answer-generate', { query: preview.question, includeHistory: preview.includeHistory, fingerprint: preview.fingerprint, approveExternalProcessing: true });
      if (ticket !== revision) return;
      output.append(make('h3', answer.status === 'insufficient' ? 'Evidence is insufficient' : 'Answer from selected evidence'));
      for (const claim of answer.claims) {
        const card = make('article', undefined, 'evidence-card'); card.append(make('p', claim.text));
        for (const citation of claim.citations) {
          const match = answer.citations.find(c => c.id === citation.source);
          const details = make('details'); details.append(make('summary', `Evidence ${citation.source}`), make('p', citation.quote, 'excerpt'), sourceDetails(match.locator));
          const button = make('button', 'Read source passage', 'secondary'); button.type = 'button'; button.addEventListener('click', () => { void showEvidence(match.passageId); }); details.append(button); card.append(details);
        }
        output.append(card);
      }
      if (answer.gaps.length) { output.append(make('h3', 'What the evidence does not establish')); for (const gap of answer.gaps) output.append(make('p', gap)); }
      if (answer.validation) output.append(make('p', answer.validation, 'fine'));
      if (answer.coverage) output.append(make('p', answer.coverage, 'fine'));
      if (answer.usage) output.append(make('p', `Provider-reported tokens: ${answer.usage.inputTokens ?? 'unavailable'} input · ${answer.usage.outputTokens ?? 'unavailable'} output.`, 'fine'));
      say('Answer completed. Check the source quotations before relying on an interpretation.');
    } catch (error) { if (ticket === revision) say(error.message, true); }
    finally { if (ticket === revision) { busy = false; consent.checked = false; controls(); } }
  });
  return { open, reset };
}

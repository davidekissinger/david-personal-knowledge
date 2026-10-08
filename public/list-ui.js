// Shared presentation only; records and citation identifiers are never rewritten.
export function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

export function newestFirst(rows, getDate) {
  const stamp = row => { const value = getDate(row); const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) ? time : -Infinity; };
  return [...rows].sort((a, b) => { const x = stamp(a), y = stamp(b); return x === y ? 0 : x > y ? -1 : 1; });
}

let sequence = 0;
export function resultRow(title, value, dateLabel = 'Record date') {
  const card = make('article', undefined, 'evidence-card search-result');
  const heading = make('h3');
  const toggle = make('button', undefined, 'result-toggle');
  toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
  const headline = make('span', title || 'Untitled record', 'result-title');
  headline.title = title || 'Untitled record';
  const time = value ? new Date(value) : null;
  const valid = time && !Number.isNaN(time.getTime());
  const date = make('span', valid ? time.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Undated', 'result-date');
  date.title = `${dateLabel}: ${valid ? time.toLocaleString() : 'Not recorded'}`;
  toggle.append(headline, date);
  const body = make('div', undefined, 'result-body'); body.hidden = true;
  body.id = `result-body-${++sequence}`; toggle.setAttribute('aria-controls', body.id);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded)); body.hidden = !expanded;
    if (!expanded) for (const details of body.querySelectorAll('details')) details.open = false;
  });
  heading.append(toggle); card.append(heading, body);
  return { card, body, toggle };
}

export function sourceDetails(locator) {
  const details = make('details', undefined, 'source-details');
  details.append(make('summary', 'Source details'), make('p', locator || 'Locator not recorded', 'meta'));
  return details;
}

export function orderControl(id, labelText = 'Order') {
  const container = make('div', undefined, 'order-control');
  const label = make('label', labelText); label.htmlFor = id;
  const select = make('select'); select.id = id;
  for (const [value, text] of [['newest', 'Newest first'], ['relevance', 'Most relevant']]) {
    const option = make('option', text); option.value = value; select.append(option);
  }
  container.append(label, select);
  return { container, select };
}

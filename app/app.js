import { fetchIncidents, ack } from './api.js';

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const byId = new Map(); // what the board shows, as it was first seen
const pending = new Map(); // landed while on screen; the "N new" bar brings them in
const acked = new Set(); // incident ids this viewer has acked
let loaded = false;
let bar = null;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The viewer's zone, in the viewer's order (dd/mm for EU locales). <time> keeps the full UTC value.
const timeText = (iso) => new Date(iso).toLocaleString();

function rowHtml(i) {
  const mark = acked.has(i.id)
    ? '<span data-testid="acked" class="acked">acked</span>'
    : '<button data-testid="ack" class="ack" type="button">Ack</button>';
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}">${esc(timeText(i.openedAt))}</time>
    ${mark}
  </li>`;
}

// The list holds still while it is on screen; a landing waits behind the bar until the on-call shows it.
function render() {
  const incidents = [...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  list.innerHTML = incidents.map(rowHtml).join('');
  empty.hidden = !(loaded && incidents.length === 0);
  renderBar();
}

function renderBar() {
  if (pending.size === 0) {
    bar?.remove();
    bar = null;
    return;
  }
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button';
    bar.dataset.testid = 'new-bar';
    bar.className = 'new-bar';
    bar.addEventListener('click', showNew);
    board.insertBefore(bar, list);
  }
  bar.textContent = `${pending.size} new - show`;
}

function showNew() {
  for (const [id, incident] of pending) byId.set(id, incident);
  pending.clear();
  render();
}

async function tick() {
  let page;
  try {
    page = await fetchIncidents();
  } catch (err) {
    console.error(err); // the next tick retries
    return;
  }
  if (!loaded) {
    loaded = true;
    loader.remove();
    for (const i of page.incidents) byId.set(i.id, i);
  } else {
    for (const i of page.incidents) if (!byId.has(i.id) && !pending.has(i.id)) pending.set(i.id, i);
  }
  render();
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  const id = button.closest('[data-testid="incident-row"]')?.dataset.id;
  if (!id) return;
  button.disabled = true;
  try {
    await ack(id); // api.js keeps the receipt and logs it
    acked.add(id);
  } catch (err) {
    button.disabled = false;
    console.error(err);
    return;
  }
  render();
});

render();
tick();
setInterval(tick, 2000);

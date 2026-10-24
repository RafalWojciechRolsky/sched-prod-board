import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const byId = new Map(); // incident id -> incident
const acked = new Set(); // incident ids this viewer has acked
let loaded = false;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The viewer's zone, in the viewer's order (dd/mm for EU locales). The <time> keeps the full UTC value.
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

function render() {
  const incidents = [...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  list.innerHTML = incidents.map(rowHtml).join('');
  empty.hidden = !(loaded && incidents.length === 0);
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
  }
  for (const i of page.incidents) byId.set(i.id, i);
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

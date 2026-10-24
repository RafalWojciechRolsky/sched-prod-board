import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const bar = document.querySelector('[data-testid="new-bar"]');

const byId = new Map(); // what the board shows, as it was first seen
const pending = new Map(); // landed while on screen; the "N new" bar brings them in
const acked = new Set(); // incident ids this viewer has acked
const rowEls = new Map(); // incident id -> its row element, kept in place
let loaded = false;

// The viewer's zone, in the viewer's order (dd/mm for EU locales). <time> keeps the full UTC value.
const timeText = (iso) => new Date(iso).toLocaleString();

function makeRow(i) {
  const el = document.createElement('li');
  el.dataset.testid = 'incident-row';
  el.dataset.id = i.id;
  el.className = `row ${i.severity}`;
  const id = document.createElement('span');
  id.className = 'id';
  id.textContent = i.id;
  const sev = document.createElement('span');
  sev.className = 'sev';
  sev.textContent = i.severity;
  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const time = document.createElement('time');
  time.dateTime = i.openedAt;
  time.textContent = timeText(i.openedAt);
  const mark = document.createElement('span');
  mark.className = 'mark';
  el.append(id, sev, what, time, mark);
  el._mark = mark;
  return el;
}

function setMark(el, isAcked) {
  if (el._acked === isAcked) return;
  el._acked = isAcked;
  el._mark.textContent = '';
  if (isAcked) {
    const done = document.createElement('span');
    done.dataset.testid = 'acked';
    done.className = 'acked';
    done.textContent = 'acked';
    el._mark.append(done);
  } else {
    const button = document.createElement('button');
    button.dataset.testid = 'ack';
    button.className = 'ack';
    button.type = 'button';
    button.textContent = 'Ack';
    el._mark.append(button);
  }
}

// The list holds still while it is on screen: rows are kept and moved, never rebuilt, and a landing
// waits behind the bar until the on-call shows it.
function render() {
  const incidents = [...byId.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  for (const i of incidents) if (!rowEls.has(i.id)) rowEls.set(i.id, makeRow(i));
  let ref = list.firstChild;
  for (const i of incidents) {
    const el = rowEls.get(i.id);
    if (el === ref) {
      ref = ref.nextSibling;
      continue;
    }
    list.insertBefore(el, ref);
  }
  for (const [id, el] of rowEls) setMark(el, acked.has(id));
  const showEmpty = loaded && incidents.length === 0;
  if (empty.hidden !== !showEmpty) empty.hidden = !showEmpty;
  const showBar = pending.size > 0;
  const barVisible = bar.style.visibility === 'visible';
  if (barVisible !== showBar) bar.style.visibility = showBar ? 'visible' : 'hidden';
  bar.setAttribute('aria-hidden', showBar ? 'false' : 'true');
  const label = showBar ? `${pending.size} new - show` : '';
  if (bar.textContent !== label) bar.textContent = label;
}

bar.addEventListener('click', () => {
  for (const [id, incident] of pending) byId.set(id, incident);
  pending.clear();
  render();
});

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

tick();
setInterval(tick, 2000);

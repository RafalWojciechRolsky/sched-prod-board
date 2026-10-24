// Records the board in use (open-board, ack-incident, watch-board) and prints what happened as JSON.
//   node scripts/record.mjs <board url> [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2];
const outDir = process.argv[3] ?? 'recordings';
if (!url) {
  console.error('usage: node scripts/record.mjs <board url> [outDir]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const t0 = Date.now();
const mmss = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

const report = { url, at: {}, acks: [] };
page.on('console', (m) => {
  const text = m.text();
  if (text.startsWith('ack ')) report.acks.push({ at: mmss(), text });
});
page.on('pageerror', (e) => console.error('pageerror:', e.message));

// open-board: the loader shows, then tonight's incidents
await page.goto(url, { waitUntil: 'domcontentloaded' });
report.at.open = mmss();
await page.waitForSelector('[data-testid="incident-row"]', { timeout: 30000 });
report.at.loaded = mmss();
await page.waitForTimeout(1200);

// ack-incident: ack the top row
const topRow = page.locator('[data-testid="incident-row"]').first();
report.ackedIncident = await topRow.getAttribute('data-id');
report.at.ackClicked = mmss();
await topRow.locator('[data-testid="ack"]').click();
await page.locator(`[data-testid="incident-row"][data-id="${report.ackedIncident}"] [data-testid="acked"]`).waitFor({ timeout: 15000 });
report.at.acked = mmss();

// watch-board: a new incident appears at the top with no reload
report.at.watchFrom = mmss();
try {
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== prev,
    report.ackedIncident,
    { timeout: 600000 },
  );
  report.at.newIncident = mmss();
  report.newIncident = await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
  await page.waitForTimeout(2500);
} catch {
  report.at.newIncident = null; // nothing new arrived within five minutes
}

const video = page.video();
await context.close();
await browser.close();
report.video = await video.path();
console.log(JSON.stringify(report, null, 2));

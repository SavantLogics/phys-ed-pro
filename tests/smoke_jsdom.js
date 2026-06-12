/* PhysEd Pro v3.0 — headless smoke test of the REAL app
   (index.html + logic.js + storage.js) using jsdom + fake-indexeddb.
   Exercises: boot, roster add, keyboard code entry, ladder comment,
   manual weekly override, Canvas import/match.

   Run:  cd <app folder>
         NODE_PATH=/tmp/smoke/node_modules node tests/smoke_jsdom.js
   (needs: npm i jsdom fake-indexeddb) */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const logicSrc = fs.readFileSync(path.join(ROOT, 'logic.js'), 'utf8');
const storageSrc = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');

// Strip the <script src> tags + inline app script; we eval them in order ourselves.
const inlineMatch = html.match(/<script>\s*\/\* ====[\s\S]*?<\/script>/);
if (!inlineMatch) { console.error('FAIL: could not locate inline app script'); process.exit(1); }
const inlineSrc = inlineMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
const shell = html
  .replace(/<script src="\.\/logic\.js"><\/script>/, '')
  .replace(/<script src="\.\/storage\.js"><\/script>/, '')
  .replace(inlineMatch[0], '');

const dom = new JSDOM(shell, { runScripts: 'dangerously', url: 'http://localhost/' });
const w = dom.window;
w.indexedDB = indexedDB;
w.IDBKeyRange = IDBKeyRange;
w.confirm = () => true;
w.print = () => {};

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${extra !== undefined ? ' — got: ' + JSON.stringify(extra) : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* eval() scopes top-level const/let per call, unlike <script> tags,
   so run all three sources in ONE eval (same order as the browser)
   and expose a test hook over the closure. */
const exposeSnippet = `
window.__T = {
  get settings() { return settings; },
  setWeek(d) { weekStart = d; },
  get weekStart() { return weekStart; },
  setPeriod(p) { currentPeriod = p; },
  addStudent, renderEntryGrid, startInlineEdit, startCommentEdit,
  importCanvasCSV, matchCanvasToPoints,
  dbGetAll, dbGet, dbPut, weekKeyOf, getMonday, buildCanvasExportCSV,
  saveBackupToHandle, doBackupNow, checkBackupReminder, recordBackupDone,
};`;

(async () => {
  // Boot the app exactly as the browser would
  w.eval(logicSrc + '\n' + storageSrc + '\n' + inlineSrc + '\n' + exposeSnippet);
  await sleep(300); // let async init() finish
  const T = w.__T;

  console.log('\n== Boot ==');
  ok(w.document.getElementById('dash-cards').innerHTML.includes('Total Students'), 'dashboard rendered on boot');
  ok(T.settings && T.settings.weeklyTotal === 100, 'default settings loaded', T.settings && T.settings.weeklyTotal);
  ok(T.settings.codes.length === 10, 'seed codes present', T.settings.codes.length);

  console.log('\n== Roster ==');
  w.document.getElementById('roster-name').value = 'Test Kid';
  w.document.getElementById('roster-sid').value = '1001';
  await T.addStudent();
  await sleep(50);
  const students = await T.dbGetAll('students');
  ok(students.length === 1 && students[0].name === 'Test Kid', 'student added via UI handler', students);
  const sid = students[0].id;

  console.log('\n== Entry grid: keyboard code entry ==');
  // Pin the week so assertions are deterministic
  T.setWeek(T.getMonday(new Date(2026, 5, 8)));
  T.setPeriod(1);
  await T.renderEntryGrid();
  await sleep(50);
  let cells = [...w.document.querySelectorAll('.code-cell')];
  ok(cells.length === 10, 'one row x 10 day cells rendered', cells.length);
  // type "A" into Monday, press Enter
  T.startInlineEdit(cells[0]);
  const input = cells[0].querySelector('input');
  ok(!!input, 'inline input appears on cell tap');
  input.value = 'A';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(150);
  const entries = await T.dbGetAll('entries');
  ok(entries.length === 1 && entries[0].code === 'A', 'entry saved from keyboard input', entries);

  // invalid code is rejected
  await T.renderEntryGrid(); await sleep(50);
  cells = [...w.document.querySelectorAll('.code-cell')];
  T.startInlineEdit(cells[1]);
  const badInput = cells[1].querySelector('input');
  badInput.value = 'ZZ';
  badInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(150);
  ok((await T.dbGetAll('entries')).length === 1, 'invalid code rejected (still 1 entry)');

  console.log('\n== Points + ladder comment in grid ==');
  await T.renderEntryGrid(); await sleep(50);
  const ptsCell = w.document.querySelector('.pts-cell');
  ok(ptsCell.textContent.trim() === '90', 'auto points = 90 after one absence', ptsCell.textContent);
  const commentCell = w.document.querySelector('.comment-cell');
  ok(commentCell.textContent.includes('One unexcused absence'), 'ladder rule 4 comment shown', commentCell.textContent);

  console.log('\n== Manual weekly override (Adj) ==');
  const adj = w.document.querySelector('.adj-input');
  adj.value = '75';
  adj.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(150);
  const wk = T.weekKeyOf(T.weekStart);
  const ov = await T.dbGet('overrides', `${sid}_${wk}`);
  ok(ov && ov.pts === 75, 'override persisted to IndexedDB', ov);
  await T.renderEntryGrid(); await sleep(50);
  const ptsCell2 = w.document.querySelector('.pts-cell');
  ok(ptsCell2.textContent.includes('75') && ptsCell2.textContent.includes('auto 90'), 'grid shows override + auto value', ptsCell2.textContent);

  console.log('\n== Custom comment override ==');
  const cCell = w.document.querySelector('.comment-cell');
  await T.startCommentEdit(cCell, wk);
  const ta = cCell.querySelector('textarea');
  ok(!!ta, 'comment editor opens');
  ta.value = 'Great improvement this week!';
  ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(150);
  const ov2 = await T.dbGet('overrides', `${sid}_${wk}`);
  ok(ov2 && ov2.comment === 'Great improvement this week!', 'custom comment persisted', ov2);

  console.log('\n== Canvas import + export match ==');
  const csv = 'Student,ID,SIS User ID,SIS Login ID,Section,Assignment\n"    Points Possible",,,,,100\n"Kid, Test",1001,SIS9,tk1,Period 1,\n"Ghost, Casper",4040,,,Period 1,';
  await T.importCanvasCSV(csv);
  await sleep(100);
  const matched = await T.matchCanvasToPoints();
  ok(matched.length === 2, 'canvas roster imported', matched.length);
  ok(matched[0].matched && matched[0].points === 75, 'matched student gets OVERRIDDEN points (75, not 90)', matched[0]);
  ok(!matched[1].matched, 'unknown student unmatched', matched[1]);
  const exportCsv = T.buildCanvasExportCSV(matched, 'PE Test', 100);
  ok(exportCsv.split('\n')[1] === '    Points Possible,,,,,100', 'export carries Points Possible row');
  ok(exportCsv.includes('"Kid, Test",1001,SIS9,tk1,Period 1,75'), 'export row has override points', exportCsv.split('\n')[2]);

  console.log('\n== Settings: custom code (Tier 3) ==');
  w.document.getElementById('new-code').value = 'INJ';
  w.document.getElementById('new-code-meaning').value = 'Injured';
  w.document.getElementById('new-code-deduction').value = '0';
  w.document.getElementById('flag-excused').checked = true;
  w.document.getElementById('add-code-btn').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(150);
  const saved = await T.dbGet('settings', 'main');
  const inj = saved.value.codes.find(c => c.code === 'INJ');
  ok(inj && inj.custom === true && inj.flags.excused === true, 'custom code saved with flags', inj);

  console.log('\n== Backup to folder + reminder banner ==');
  // mock a File System Access handle (createWritable contract)
  let written = null;
  const mockHandle = {
    name: 'PhysEdPro_Backup.json',
    createWritable: async () => ({ write: async (s) => { written = s; }, close: async () => {} }),
  };
  const backup = await T.saveBackupToHandle(mockHandle);
  ok(written !== null, 'backup written through handle');
  const parsed = JSON.parse(written);
  ok(parsed.app === 'PhysEd Pro' && Array.isArray(parsed.students) && parsed.students.length === 1, 'written backup is valid + has data', { app: parsed.app, students: parsed.students.length });
  ok(backup.overrides.length === 1, 'backup includes overrides', backup.overrides.length);

  // banner: stale lastBackupAt + existing data -> banner shows
  await T.dbPut('settings', { key: 'lastBackupAt', value: '2026-06-01T08:00:00' });
  await T.checkBackupReminder();
  ok(w.document.getElementById('backup-banner').classList.contains('show'), 'stale backup shows reminder banner');
  ok(w.document.getElementById('backup-banner-msg').textContent.includes('over a week'), 'banner message mentions staleness');
  // recording a backup hides the banner and bumps lastBackupAt
  await T.recordBackupDone();
  ok(!w.document.getElementById('backup-banner').classList.contains('show'), 'banner hides after backup');
  const last = await T.dbGet('settings', 'lastBackupAt');
  ok(last && !isNaN(Date.parse(last.value)) && (Date.now() - Date.parse(last.value)) < 60000, 'lastBackupAt updated to now', last && last.value);

  console.log('\n== Clear all entries (guarded) ==');
  w.document.getElementById('clear-all-entries').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(200);
  ok((await T.dbGetAll('entries')).length === 0, 'entries cleared');
  ok((await T.dbGetAll('overrides')).length === 0, 'overrides cleared with entries');
  ok((await T.dbGetAll('students')).length === 1, 'roster kept');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

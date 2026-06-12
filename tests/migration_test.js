/* PhysEd Pro v3.0 — v2(localStorage) -> v3(IndexedDB) migration test.
   Run: NODE_PATH=/tmp/smoke/node_modules node tests/migration_test.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

const storageSrc = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${extra !== undefined ? ' — got: ' + JSON.stringify(extra) : ''}`); }
}

function freshWindow() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  w.indexedDB = new FDBFactory(); // isolated DB per scenario
  w.IDBKeyRange = FDBKeyRange;
  return w;
}

const V2_BLOB = {
  students: [
    { id: 3, name: 'Alpha Kid', sid: '300', period: 1 },
    { id: 9, name: 'Beta Kid', sid: '900', period: 4, sisUserId: 'SIS9' },
  ],
  entries: {
    '3_2026-06-08': { studentId: 3, period: 1, date: '2026-06-08', code: 'NP' },
    '9_2026-06-09': { studentId: 9, period: 4, date: '2026-06-09', code: 'EX' },
  },
  settings: {
    main: { key: 'main', value: { weeklyTotal: 80, codes: [{ code: 'A', meaning: 'Absent', deduction: 10 }] } },
    weekStart: { key: 'weekStart', value: '2026-06-08' },
  },
  canvasRoster: [{ student: 'Kid, Alpha', id: '300', sisUserId: '', sisLoginId: '', section: 'Period 1' }],
  _nextId: 10,
};

(async () => {
  console.log('== Scenario 1: v2 data present, fresh v3 DB ==');
  let w = freshWindow();
  w.localStorage.setItem('physed_pro_data', JSON.stringify(V2_BLOB));
  w.eval(storageSrc + '\nwindow.__S = { openDB, dbGet, dbGetAll };');
  await w.__S.openDB();
  const students = await w.__S.dbGetAll('students');
  ok(students.length === 2, 'both students migrated', students.length);
  ok(students.find(s => s.id === 9 && s.sisUserId === 'SIS9'), 'ids + SIS fields preserved');
  ok((await w.__S.dbGet('entries', '3_2026-06-08')).code === 'NP', 'entries migrated');
  ok((await w.__S.dbGet('settings', 'main')).value.weeklyTotal === 80, 'settings migrated');
  ok((await w.__S.dbGet('settings', 'weekStart')).value === '2026-06-08', 'weekStart migrated');
  ok((await w.__S.dbGet('settings', 'canvasRoster')).value.length === 1, 'canvas roster migrated');
  ok(w.localStorage.getItem('physed_pro_migrated_v3') === '1', 'migration flag set');
  ok(w.localStorage.getItem('physed_pro_data') !== null, 'v2 blob kept as backup');

  console.log('\n== Scenario 2: migration runs only once ==');
  // same window: change the blob, reopen — must NOT re-import
  w.localStorage.setItem('physed_pro_data', JSON.stringify({ ...V2_BLOB, students: [{ id: 99, name: 'Zombie', period: 1 }] }));
  await w.__S.openDB();
  ok((await w.__S.dbGetAll('students')).length === 2, 'no re-migration after flag set');

  console.log('\n== Scenario 3: no v2 data, clean install ==');
  w = freshWindow();
  w.eval(storageSrc + '\nwindow.__S = { openDB, dbGetAll };');
  await w.__S.openDB();
  ok((await w.__S.dbGetAll('students')).length === 0, 'clean install starts empty');
  ok(w.localStorage.getItem('physed_pro_migrated_v3') === '1', 'flag set so later v2 junk is ignored');

  console.log('\n== Scenario 4: corrupt v2 blob does not crash ==');
  w = freshWindow();
  w.localStorage.setItem('physed_pro_data', '{not json!!');
  w.eval(storageSrc + '\nwindow.__S = { openDB, dbGetAll };');
  let crashed = false;
  try { await w.__S.openDB(); } catch (e) { crashed = true; }
  ok(!crashed, 'openDB survives corrupt legacy data');
  ok((await w.__S.dbGetAll('students')).length === 0, 'corrupt blob skipped');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

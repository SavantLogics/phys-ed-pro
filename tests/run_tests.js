/* PhysEd Pro v3.0 — Node unit tests for logic.js
   Run: node tests/run_tests.js  (exit 0 = all pass) */
const path = require('path');
const fs = require('fs');
const L = require(path.join(__dirname, '..', 'logic.js'));

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); }
}
function section(name) { console.log(`\n== ${name} ==`); }

/* ---------- helpers ---------- */
function settingsWith(over = {}) {
  return Object.assign({
    weeklyTotal: 100,
    codes: L.DEFAULT_CODES.map(c => ({ ...c, flags: { ...c.flags } })),
    thresholds: { ...L.DEFAULT_THRESHOLDS },
  }, over);
}
const MON = new Date(2026, 5, 8); // Mon Jun 8 2026 (local)
const WEEK = L.getWeekDates(MON);
function codesByDate(list) {
  const m = {};
  list.forEach((c, i) => { if (c) m[L.dateKey(WEEK[i])] = c; });
  return m;
}

/* ---------- dates ---------- */
section('Dates (local, no UTC drift)');
eq(L.dateKey(new Date(2026, 5, 8)), '2026-06-08', 'dateKey is local calendar date');
eq(L.dateKey(L.parseDateKey('2026-06-08')), '2026-06-08', 'parseDateKey round-trips');
eq(L.dateKey(L.getMonday(new Date(2026, 5, 10))), '2026-06-08', 'getMonday from Wednesday');
eq(L.dateKey(L.getMonday(new Date(2026, 5, 14))), '2026-06-08', 'getMonday from Sunday goes back, not forward');
eq(L.dateKey(L.getMonday(new Date(2026, 5, 8))), '2026-06-08', 'getMonday from Monday is identity');
eq(WEEK.length, 10, 'window is 10 weekdays');
eq(L.dateKey(WEEK[4]), '2026-06-12', 'week1 Friday');
eq(L.dateKey(WEEK[5]), '2026-06-15', 'week2 Monday skips weekend');
eq(L.dateKey(WEEK[9]), '2026-06-19', 'week2 Friday');

/* ---------- points ---------- */
section('Points');
const S = settingsWith();
eq(L.calcPoints(codesByDate([]), WEEK, S), 100, 'no codes = full points');
eq(L.calcPoints(codesByDate(['A']), WEEK, S), 90, 'A deducts 10');
eq(L.calcPoints(codesByDate(['N', 'P']), WEEK, S), 90, 'N+P deduct 5 each');
eq(L.calcPoints(codesByDate(['A','A','A','A','A','A','A','A','A','A']), WEEK, S), 0, '10 absences floor at 0');
eq(L.calcPoints(codesByDate(['A', 'A']), WEEK, settingsWith({ weeklyTotal: 10 })), 0, 'floor at 0 with small total');
eq(L.calcPoints(codesByDate(['?']), WEEK, S), 100, 'unknown code deducts nothing');
eq(L.effectivePoints(90, null), 90, 'no override = auto');
eq(L.effectivePoints(90, 75), 75, 'override wins');
eq(L.effectivePoints(90, 0), 0, 'override of 0 is respected');

/* ---------- stats mapping ---------- */
section('Code flags -> weekly stats');
const st = L.weeklyStats(codesByDate(['TNP']), WEEK, S);
eq([st.tardies, st.noDress, st.noPart, st.absences, st.excused], [1, 1, 1, 0, 0], 'TNP counts tardy+nodress+nopart');
const st2 = L.weeklyStats(codesByDate(['NP']), WEEK, S);
eq([st2.tardies, st2.noDress, st2.noPart], [0, 1, 1], 'NP counts nodress+nopart');
const st3 = L.weeklyStats(codesByDate(['EX', 'MED']), WEEK, S);
eq([st3.excused, st3.absences], [2, 0], 'EX/MED count excused, not absent');
eq(L.weeklyStats(codesByDate(['A', 'A', 'T']), WEEK, S).daysRecorded, 3, 'daysRecorded counts coded days');

/* ---------- ladder (rule-by-rule via shared cases table) ---------- */
section('Comment ladder — shared cases table');
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')).cases;
for (const c of table) {
  const cfg = settingsWith();
  if (c.weeklyTotal) cfg.weeklyTotal = c.weeklyTotal;
  if (c.thresholds) cfg.thresholds = Object.assign({ ...L.DEFAULT_THRESHOLDS }, c.thresholds);
  if (c.extraCodes) cfg.codes = cfg.codes.concat(c.extraCodes);
  const stats = L.weeklyStats(codesByDate(c.codes), WEEK, cfg);
  const out = L.ladderComment(stats, cfg.thresholds);
  eq(out.rule, c.expectRule, `${c.name} -> rule ${c.expectRule}`);
}

/* ---------- ladder text spot checks ---------- */
section('Ladder text spot checks');
eq(L.calcComment(codesByDate(['EX', 'A', 'A']), WEEK, S),
  'Multiple unexcused absences this week affected the grade. Consistent attendance is needed.',
  'EX never masks absences (v2 bug fixed)');
eq(L.calcComment(codesByDate([]), WEEK, S),
  'Excellent week — full participation, dressed out, and on time. Keep it up!',
  'clean week is positive');

/* ---------- CSV ---------- */
section('CSV');
const sample = [
  'Student,ID,SIS User ID,SIS Login ID,Section,Assignment 1',
  '"    Points Possible",,,,,100',
  '"Doe, Jane",1001,SIS01,jdoe1,Period 1,99',
  '"Smith, Bob",1002,SIS02,bsmith,Period 2,87',
  '"Student, Test",9999,,,Period 1,0',
  '',
].join('\n');
const rows = L.parseCSV(sample);
eq(rows.length, 2, 'parses 2 real students (skips Points Possible + Test Student)');
eq(rows[0], { student: 'Doe, Jane', id: '1001', sisUserId: 'SIS01', sisLoginId: 'jdoe1', section: 'Period 1' }, 'row fields parsed');
eq(L.parseCSV('Name,Email\nfoo,bar'), null, 'missing required columns -> null');
eq(L.parseCSV('Student,ID'), [], 'header only -> empty');
eq(L.parseCSVLine('a,"b,c",d'), ['a', 'b,c', 'd'], 'quoted comma');
eq(L.parseCSVLine('a,"He said ""hi""",c'), ['a', 'He said "hi"', 'c'], 'escaped quotes');
eq(L.csvEscape('Doe, Jane'), '"Doe, Jane"', 'escape comma');
eq(L.csvEscape('plain'), 'plain', 'no escape needed');

const exportCsv = L.buildCanvasExportCSV(
  [{ student: 'Doe, Jane', id: '1001', sisUserId: 'SIS01', sisLoginId: 'jdoe1', section: 'Period 1', points: 95, matched: true },
   { student: 'Ghost, Casper', id: '4040', sisUserId: '', sisLoginId: '', section: 'Period 1', points: null, matched: false }],
  'PE Points (Jun 8 - Jun 19)', 100);
const lines = exportCsv.trim().split('\n');
eq(lines[0], 'Student,ID,SIS User ID,SIS Login ID,Section,PE Points (Jun 8 - Jun 19)', 'Canvas 5 required columns + assignment');
eq(lines[1], '    Points Possible,,,,,100', 'Points Possible row present');
eq(lines[2], '"Doe, Jane",1001,SIS01,jdoe1,Period 1,95', 'matched student row');
eq(lines[3], '"Ghost, Casper",4040,,,Period 1,', 'unmatched student left blank');
eq(L.parseCSV(exportCsv).length, 2, 'our own export re-parses cleanly (round trip)');

/* ---------- backup staleness ---------- */
section('Backup staleness');
const NOW = Date.parse('2026-06-12T12:00:00');
eq(L.isBackupStale(null, NOW), true, 'no backup ever -> stale');
eq(L.isBackupStale(undefined, NOW), true, 'undefined -> stale');
eq(L.isBackupStale('garbage', NOW), true, 'unparseable date -> stale');
eq(L.isBackupStale('2026-06-10T12:00:00', NOW), false, '2 days old -> fresh');
eq(L.isBackupStale('2026-06-05T12:00:00', NOW), false, 'exactly 7 days -> still fresh');
eq(L.isBackupStale('2026-06-05T11:59:00', NOW), true, '7 days + 1 min -> stale');
eq(L.isBackupStale('2026-06-01T12:00:00', NOW), true, '11 days -> stale');
eq(L.isBackupStale('2026-06-10T12:00:00', NOW, 1), true, 'custom 1-day window -> stale');

/* ---------- summary ---------- */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

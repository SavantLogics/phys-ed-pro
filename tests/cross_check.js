/* PhysEd Pro v3.0 — emits JS engine output for every case in
   cases.json so the Python oracle can diff it.
   Run: node tests/cross_check.js > tests/js_output.json */
const path = require('path');
const fs = require('fs');
const L = require(path.join(__dirname, '..', 'logic.js'));

const MON = new Date(2026, 5, 8);
const WEEK = L.getWeekDates(MON);
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')).cases;

const out = {};
for (const c of table) {
  const cfg = {
    weeklyTotal: c.weeklyTotal || 100,
    codes: L.DEFAULT_CODES.map(x => ({ ...x, flags: { ...x.flags } })).concat(c.extraCodes || []),
    thresholds: Object.assign({ ...L.DEFAULT_THRESHOLDS }, c.thresholds || {}),
  };
  const codesByDate = {};
  c.codes.forEach((code, i) => { if (code) codesByDate[L.dateKey(WEEK[i])] = code; });
  const stats = L.weeklyStats(codesByDate, WEEK, cfg);
  const res = L.ladderComment(stats, cfg.thresholds);
  out[c.name] = { points: stats.points, rule: res.rule, comment: res.text };
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');

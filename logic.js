/* ============================================================
   PhysEd Pro v3.0 — logic.js
   Pure logic only. No DOM, no storage. Shared by:
     - index.html (runtime)
     - tests.html (browser tests)
     - tests/run_tests.js + tests/cross_check.js (Node tests)
   The Python oracle (tests/comment_oracle.py) mirrors this file;
   any change here MUST be mirrored there and cross-checked.
   ============================================================ */

/* ---------- Codes ----------
   Each code carries semantic flags so the comment ladder can
   count "what happened" regardless of which combined code was
   used. Custom (Tier 3) codes declare their own flags. */
const DEFAULT_CODES = [
  { code: 'A',   meaning: 'Absent',                               deduction: 10, custom: false, flags: { absence: true } },
  { code: 'N',   meaning: 'Non-suit',                             deduction: 5,  custom: false, flags: { noDress: true } },
  { code: 'P',   meaning: 'Non-participation',                    deduction: 5,  custom: false, flags: { noPart: true } },
  { code: 'NP',  meaning: 'Non-suit + Non-participation',         deduction: 10, custom: false, flags: { noDress: true, noPart: true } },
  { code: 'TN',  meaning: 'Tardy + Non-suit',                     deduction: 5,  custom: false, flags: { tardy: true, noDress: true } },
  { code: 'TP',  meaning: 'Tardy + Non-participation',            deduction: 5,  custom: false, flags: { tardy: true, noPart: true } },
  { code: 'TNP', meaning: 'Tardy + Non-suit + Non-participation', deduction: 10, custom: false, flags: { tardy: true, noDress: true, noPart: true } },
  { code: 'EX',  meaning: 'Excused',                              deduction: 0,  custom: false, flags: { excused: true } },
  { code: 'MED', meaning: 'Medically Excused',                    deduction: 0,  custom: false, flags: { excused: true } },
  { code: 'T',   meaning: 'Tardy',                                deduction: 0,  custom: false, flags: { tardy: true } },
];

/* Owner-editable comment ladder thresholds (spec §1 + §2). */
const DEFAULT_THRESHOLDS = {
  absCritical: 2,    // rule 1: unexcused absences >= this
  npCritical: 2,     // rule 2: non-participation days >= this
  dressMajor: 2,     // rule 3: non-suit days >= this
  tardyMinor: 2,     // rule 7: tardies >= this
  pctExcellent: 0.95,// rule 10
  pctSolid: 0.85,    // rule 11
};

/* ---------- Dates ----------
   All date keys are LOCAL dates (YYYY-MM-DD). v2 used
   toISOString() (UTC), which made "today" and week labels
   off-by-one for US evenings. */
function dateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function parseDateKey(s) {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function getMonday(d) {
  const dt = new Date(d); const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  dt.setHours(0, 0, 0, 0); return dt;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
/* Grading window = 10 weekdays across 2 calendar weeks. */
function getWeekDates(start) {
  const dates = [];
  for (let i = 0; i < 5; i++) dates.push(addDays(start, i));
  for (let i = 7; i < 12; i++) dates.push(addDays(start, i));
  return dates;
}
function formatDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

/* ---------- Names ----------
   Roster names are stored "First Last" (CSV "Last, First" is
   converted on import), but teachers may also type "Last, First"
   by hand. Sort key = last name, then full name as tiebreaker,
   case-insensitive. */
function lastNameOf(name) {
  const n = (name || '').trim();
  if (!n) return '';
  if (n.includes(',')) return n.split(',')[0].trim();
  const parts = n.split(/\s+/);
  return parts[parts.length - 1];
}
function byLastName(a, b) {
  const an = a.name || '', bn = b.name || '';
  return lastNameOf(an).localeCompare(lastNameOf(bn), undefined, { sensitivity: 'base' })
    || an.localeCompare(bn, undefined, { sensitivity: 'base' });
}
function entryId(studentId, date) { return `${studentId}_${date}`; }
function weekKeyOf(weekStart) { return dateKey(weekStart); }

/* ---------- Points ---------- */
function calcPoints(codesByDate, weekDates, settings) {
  let total = settings.weeklyTotal;
  for (const date of weekDates) {
    const code = codesByDate[dateKey(date)];
    if (code) {
      const def = settings.codes.find(c => c.code === code);
      if (def) total -= def.deduction;
    }
  }
  return Math.max(0, total);
}
function effectivePoints(autoPts, override) {
  return (override === null || override === undefined || override === '') ? autoPts : override;
}

/* ---------- Comment ladder ----------
   Per the signed ladder doc: first match wins, top to bottom.
   Adaptations for the codes-only model (signed off 2026-06-12):
   - Rule 8 (low_part_days) dropped: redundant with noPart counts.
   - Rule 13 (no data) dropped: with exception-only entry, "no
     codes" means a clean week, not an untracked one.
   - Rule 10 requires tardies === 0 so "on time" is never untrue.
     (absence/noDress/noPart > 0 can never reach rule 10 because
     rules 1-6 fire first.)
   - Rules 4/5/6 use >= 1 instead of == 1: identical at default
     thresholds, but still fires if the owner raises a critical
     threshold above 2 (spec's == 1 would leave a 2-absence week
     with no absence comment). */
function weeklyStats(codesByDate, weekDates, settings) {
  const stats = { absences: 0, excused: 0, tardies: 0, noDress: 0, noPart: 0, daysRecorded: 0 };
  for (const date of weekDates) {
    const code = codesByDate[dateKey(date)];
    if (!code) continue;
    stats.daysRecorded++;
    const def = settings.codes.find(c => c.code === code);
    if (!def) continue;
    const f = def.flags || {};
    if (f.absence) stats.absences++;
    if (f.excused) stats.excused++;
    if (f.tardy)   stats.tardies++;
    if (f.noDress) stats.noDress++;
    if (f.noPart)  stats.noPart++;
  }
  stats.points = calcPoints(codesByDate, weekDates, settings);
  stats.pct = settings.weeklyTotal > 0 ? stats.points / settings.weeklyTotal : 0;
  return stats;
}

function ladderComment(stats, thresholds) {
  const t = thresholds || DEFAULT_THRESHOLDS;
  if (stats.absences >= t.absCritical)
    return { rule: 1, text: 'Multiple unexcused absences this week affected the grade. Consistent attendance is needed.' };
  if (stats.noPart >= t.npCritical)
    return { rule: 2, text: 'Did not participate on multiple days. Active participation is required to earn full points.' };
  if (stats.noDress >= t.dressMajor)
    return { rule: 3, text: 'Was not dressed out multiple times this week, which reduced points. Please come prepared.' };
  if (stats.absences >= 1)
    return { rule: 4, text: 'One unexcused absence this week. Please make up any missed participation.' };
  if (stats.noPart >= 1)
    return { rule: 5, text: 'Sat out one day this week. Aim to participate every class.' };
  if (stats.noDress >= 1)
    return { rule: 6, text: 'Was not dressed out once this week. Remember to bring PE clothes.' };
  if (stats.tardies >= t.tardyMinor)
    return { rule: 7, text: 'Late to class multiple times this week. Please arrive on time.' };
  if (stats.excused >= 1)
    return { rule: 9, text: 'Had excused absence(s) this week; otherwise on track.' };
  if (stats.pct >= t.pctExcellent && stats.tardies === 0)
    return { rule: 10, text: 'Excellent week — full participation, dressed out, and on time. Keep it up!' };
  if (stats.pct >= t.pctSolid)
    return { rule: 11, text: 'Solid, consistent week. Good effort.' };
  return { rule: 12, text: 'Met weekly expectations.' };
}

function calcComment(codesByDate, weekDates, settings) {
  const stats = weeklyStats(codesByDate, weekDates, settings);
  return ladderComment(stats, settings.thresholds || DEFAULT_THRESHOLDS).text;
}

/* ---------- CSV ----------
   Canvas gradebook required columns (case-sensitive):
   Student, ID, SIS User ID, SIS Login ID, Section.
   https://community.canvaslms.com/t5/Instructor-Guide/How-do-I-import-grades-in-the-Gradebook/ta-p/807 */
function parseCSVLine(line) {
  const result = []; let current = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current); return result;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const col = {}; header.forEach((h, i) => { col[h.trim().toLowerCase()] = i; });
  const sc = col['student'] ?? -1, ic = col['id'] ?? -1;
  if (sc === -1 || ic === -1) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = parseCSVLine(lines[i]);
    const name = (c[sc] || '').trim();
    if (!name || /^points possible$/i.test(name) || name === 'Student, Test') continue;
    rows.push({
      student: name,
      id: (c[ic] || '').trim(),
      sisUserId: (c[col['sis user id']] || '').trim(),
      sisLoginId: (c[col['sis login id']] || '').trim(),
      section: (c[col['section']] || '').trim(),
    });
  }
  return rows;
}
function csvEscape(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* Builds a Canvas-importable CSV: 5 required columns + one new
   assignment column, with the Points Possible row Canvas's own
   exports carry. matchedRows: [{student,id,sisUserId,sisLoginId,
   section,points,matched}] */
function buildCanvasExportCSV(matchedRows, assignmentName, pointsPossible) {
  let csv = ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Section', csvEscape(assignmentName)].join(',') + '\n';
  csv += ['    Points Possible', '', '', '', '', pointsPossible].join(',') + '\n';
  for (const r of matchedRows) {
    csv += [csvEscape(r.student), csvEscape(r.id), csvEscape(r.sisUserId), csvEscape(r.sisLoginId), csvEscape(r.section), r.matched ? r.points : ''].join(',') + '\n';
  }
  return csv;
}

/* ---------- Backup staleness ----------
   A backup is "stale" if none exists or the last one is older
   than maxAgeDays. Drives the reminder banner. */
function isBackupStale(lastIso, nowMs, maxAgeDays) {
  const days = maxAgeDays === undefined ? 7 : maxAgeDays;
  if (!lastIso) return true;
  const t = Date.parse(lastIso);
  if (isNaN(t)) return true;
  return (nowMs - t) > days * 86400000;
}

/* ---------- Node export (tests) ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CODES, DEFAULT_THRESHOLDS,
    dateKey, parseDateKey, getMonday, addDays, getWeekDates, formatDate, entryId, weekKeyOf,
    lastNameOf, byLastName,
    calcPoints, effectivePoints, weeklyStats, ladderComment, calcComment,
    parseCSV, parseCSVLine, csvEscape, buildCanvasExportCSV, isBackupStale,
  };
}

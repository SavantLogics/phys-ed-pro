/* ============================================================
   PhysEd Pro v3.0 — storage.js
   IndexedDB facade + one-time migration from v2 localStorage.
   Same async API the app already used, so the UI layer didn't
   have to change shape:
     openDB, dbGet, dbGetAll, dbGetByIndex, dbPut, dbDelete, dbClear
   Stores:
     students  (keyPath id, autoIncrement; index: period)
     entries   (keyPath id = `${studentId}_${date}`; indexes: period, studentId, date)
     settings  (keyPath key)
     overrides (keyPath id = `${studentId}_${weekKey}`; index: weekKey)
   MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
   ============================================================ */

const PHYSED_DB_NAME = (typeof window !== 'undefined' && window.PHYSED_DB_NAME) || 'physed_pro';
const PHYSED_DB_VERSION = 1;
const LEGACY_LS_KEY = 'physed_pro_data';
const MIGRATED_FLAG = 'physed_pro_migrated_v3';

let _idb = null;

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHYSED_DB_NAME, PHYSED_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('students')) {
        const s = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
        s.createIndex('period', 'period');
      }
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('period', 'period');
        s.createIndex('studentId', 'studentId');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('overrides')) {
        const s = db.createObjectStore('overrides', { keyPath: 'id' });
        s.createIndex('weekKey', 'weekKey');
      }
    };
    req.onsuccess = async () => {
      _idb = req.result;
      try { await migrateFromLocalStorage(); }
      catch (err) { console.error('Migration error (continuing):', err); }
      // Ask the browser not to evict our data under storage pressure.
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      resolve(_idb);
    };
    req.onerror = () => reject(req.error);
  });
}

function _store(name, mode) {
  return _idb.transaction(name, mode || 'readonly').objectStore(name);
}

async function dbGet(store, key) {
  const v = await _req(_store(store).get(key));
  return v === undefined ? undefined : v;
}
async function dbGetAll(store) {
  return await _req(_store(store).getAll());
}
async function dbGetByIndex(store, index, value) {
  return await _req(_store(store).index(index).getAll(value));
}
async function dbPut(store, data) {
  const os = _store(store, 'readwrite');
  // autoIncrement keyPath stores reject an explicit undefined id
  if (store === 'students' && (data.id === undefined || data.id === null)) {
    const { id, ...rest } = data;
    const key = await _req(os.put(rest));
    data.id = key;
    return key;
  }
  return await _req(os.put(data));
}
async function dbDelete(store, key) {
  return await _req(_store(store, 'readwrite').delete(key));
}
async function dbClear(store) {
  return await _req(_store(store, 'readwrite').clear());
}

/* ---------- v2 -> v3 migration ----------
   v2 kept everything in one localStorage blob. Copy it into
   IndexedDB exactly once; leave the blob in place as a backup.
   localStorage access can THROW (private modes, opaque origins),
   so it goes through a guarded accessor. */
function _safeLS() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch (e) { return null; }
}
async function migrateFromLocalStorage() {
  const ls = _safeLS();
  if (!ls) return;
  if (ls.getItem(MIGRATED_FLAG)) return;
  const raw = ls.getItem(LEGACY_LS_KEY);
  if (!raw) { ls.setItem(MIGRATED_FLAG, '1'); return; }
  const existing = await dbGetAll('students');
  if (existing.length) { ls.setItem(MIGRATED_FLAG, '1'); return; }
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { console.error('Legacy data unreadable, skipping migration:', e); ls.setItem(MIGRATED_FLAG, '1'); return; }
  for (const s of (data.students || [])) await dbPut('students', s); // ids preserved
  for (const [id, e] of Object.entries(data.entries || {})) await dbPut('entries', { id, ...e });
  for (const v of Object.values(data.settings || {})) { if (v && v.key) await dbPut('settings', v); }
  if (Array.isArray(data.canvasRoster) && data.canvasRoster.length) {
    await dbPut('settings', { key: 'canvasRoster', value: data.canvasRoster });
  }
  ls.setItem(MIGRATED_FLAG, '1');
  console.info('PhysEd Pro: migrated v2 localStorage data into IndexedDB.');
}

/* ---------- Backup / restore (JSON) ---------- */
async function exportBackupJSON() {
  return {
    app: 'PhysEd Pro',
    version: 3,
    exportedAt: new Date().toISOString(),
    students: await dbGetAll('students'),
    entries: await dbGetAll('entries'),
    settings: await dbGetAll('settings'),
    overrides: await dbGetAll('overrides'),
  };
}
async function restoreBackupJSON(obj) {
  if (!obj || obj.app !== 'PhysEd Pro' || !Array.isArray(obj.students)) {
    throw new Error('Not a PhysEd Pro backup file');
  }
  await dbClear('students'); await dbClear('entries');
  await dbClear('settings'); await dbClear('overrides');
  for (const s of obj.students) await dbPut('students', s);
  for (const e of (obj.entries || [])) await dbPut('entries', e);
  for (const s of (obj.settings || [])) await dbPut('settings', s);
  for (const o of (obj.overrides || [])) await dbPut('overrides', o);
}

/* ---------- Backup-to-folder (File System Access API) ----------
   Writes the backup straight into a user-chosen file — point it at
   a district-synced Google Drive / OneDrive folder and the data at
   rest lives in district storage (their security, their retention,
   their version history). The file handle persists in IndexedDB.
   https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker */
async function saveBackupToHandle(handle) {
  const backup = await exportBackupJSON();
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(backup, null, 1));
  await writable.close();
  return backup;
}
async function verifyHandlePermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch (e) { return false; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { openDB, dbGet, dbGetAll, dbGetByIndex, dbPut, dbDelete, dbClear, exportBackupJSON, restoreBackupJSON, migrateFromLocalStorage, saveBackupToHandle, verifyHandlePermission };
}

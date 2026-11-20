/**
 * HSSE Safety – Google Drive receiver (Google Apps Script web app).
 *
 * The HSSE Safety app sends every submitted site audit, saved task and saved toolbox meeting here.
 * This script saves, in the Drive of the account that deploys it:
 *   HSSE Safety/
 *     HSSE Safety Records   (Google Sheet: tabs "Site Audits", "Task Updates", "Toolbox Meetings")
 *     Site Audits/2026-11/2026-11-20 PS Karak/   PDF report + photos
 *     Toolbox Meetings/2026-11/2026-11-20 0800 Bay 2/   PDF + photos
 *     Task Updates/  (tasks are rows in the sheet only)
 * A record that is saved again replaces its PDF/photos and updates its sheet row (no duplicates).
 *
 * Setup: see GOOGLE-DRIVE-SETUP.md. Run setup() once, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). Put the web app URL and the key from the log into the app.
 */
const ROOT_NAME = 'HSSE Safety';
const SHEET_NAME = 'HSSE Safety Records';
const TYPES = { audit: 'Site Audits', task: 'Task Updates', toolbox: 'Toolbox Meetings' };

function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); props.setProperty('KEY', key); }
  const root = root_();
  Object.keys(TYPES).forEach(function (t) { child_(root, TYPES[t]); tab_(sheet_(), TYPES[t]); });
  Logger.log('Drive key (paste into the app > Drive): ' + key);
  Logger.log('Drive folder: ' + root.getUrl());
  Logger.log('Records sheet: ' + sheet_().getUrl());
}

/** Makes a new key. Run it if the key leaks, then paste the new key into the app. */
function newKey() {
  PropertiesService.getScriptProperties().deleteProperty('KEY');
  setup();
}

function doGet() {
  return ContentService.createTextOutput('HSSE Safety Drive receiver is running.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const p = JSON.parse(e.postData.contents);
    const key = PropertiesService.getScriptProperties().getProperty('KEY');
    if (!key || p.key !== key) return out_({ ok: false, error: 'bad key' });
    const root = root_();
    const ss = sheet_();
    if (p.type === 'ping') return out_({ ok: true, folderUrl: root.getUrl(), sheetUrl: ss.getUrl() });
    if (!TYPES[p.type] || !p.id) return out_({ ok: false, error: 'bad request' });

    lock.waitLock(60000); locked = true;
    const tab = tab_(ss, TYPES[p.type]);
    const rowIdx = findRow_(tab, p.id);
    const sheetUrl = ss.getUrl() + '#gid=' + tab.getSheetId();

    if (p.deleted) {
      if (rowIdx) {
        const fu = getCell_(tab, rowIdx, 'Folder');
        if (fu) { try { DriveApp.getFolderById(idFromUrl_(fu)).setTrashed(true); } catch (x) {} }
        const del = [['Status', 'Deleted'], ['Saved to Drive', new Date()]];
        if (p.type !== 'task') { del.push(['PDF', '']); del.push(['Folder', '']); }
        writeRow_(tab, rowIdx, p.id, del);
      }
      return out_({ ok: true, sheetUrl: sheetUrl });
    }

    let pdfUrl = '', folderUrl = '';
    if (p.pdf || (p.photos && p.photos.length)) {
      const month = child_(child_(root, TYPES[p.type]), String(p.month || 'Unsorted'));
      let folder = null;
      const prev = rowIdx ? getCell_(tab, rowIdx, 'Folder') : '';
      if (prev) { try { folder = DriveApp.getFolderById(idFromUrl_(prev)); if (folder.isTrashed()) folder = null; } catch (x) { folder = null; } }
      if (folder) {
        folder.setName(clean_(p.folderName));
        const it = folder.getFiles(); while (it.hasNext()) it.next().setTrashed(true); // replace old copies
      } else {
        folder = month.createFolder(clean_(p.folderName));
      }
      if (p.pdf) pdfUrl = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.pdf.data), 'application/pdf', clean_(p.pdf.name))).getUrl();
      (p.photos || []).forEach(function (ph) {
        folder.createFile(Utilities.newBlob(Utilities.base64Decode(ph.data), ph.type || 'image/jpeg', clean_(ph.name)));
      });
      folderUrl = folder.getUrl();
    }
    const row = (p.row || []).slice();
    if (p.type !== 'task') { row.push(['PDF', pdfUrl]); row.push(['Folder', folderUrl]); }
    row.push(['Saved to Drive', new Date()]);
    writeRow_(tab, rowIdx, p.id, row);
    return out_({ ok: true, pdfUrl: pdfUrl, folderUrl: folderUrl, sheetUrl: sheetUrl });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* ---------- helpers ---------- */
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(s) { return String(s || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120); }
function idFromUrl_(u) { const m = String(u).match(/[-\w]{25,}/); return m ? m[0] : ''; }

function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
  props.setProperty('ROOT', f.getId());
  return f;
}
function child_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET');
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root_());
  props.setProperty('SHEET', ss.getId());
  return ss;
}
function tab_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1).setValue('ID'); sh.setFrozenRows(1); sh.getRange(1, 1).setFontWeight('bold');
    const first = ss.getSheetByName('Sheet1');
    if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  }
  return sh;
}
function headers_(sh) { const lc = sh.getLastColumn(); return lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : []; }
function findRow_(sh, id) {
  const lr = sh.getLastRow(); if (lr < 2) return 0;
  const ids = sh.getRange(2, 1, lr - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function writeRow_(sh, rowIdx, id, pairs) {
  const h = headers_(sh);
  if (!h.length) { h.push('ID'); sh.getRange(1, 1).setValue('ID'); }
  pairs.forEach(function (kv) { if (h.indexOf(kv[0]) < 0) { h.push(kv[0]); sh.getRange(1, h.length).setValue(kv[0]).setFontWeight('bold'); } });
  const r = rowIdx || sh.getLastRow() + 1;
  const vals = rowIdx ? sh.getRange(r, 1, 1, h.length).getValues()[0] : new Array(h.length).fill('');
  vals[0] = id;
  pairs.forEach(function (kv) { vals[h.indexOf(kv[0])] = kv[1] == null ? '' : kv[1]; });
  sh.getRange(r, 1, 1, h.length).setValues([vals]);
}
function getCell_(sh, r, name) { const c = headers_(sh).indexOf(name); return c < 0 ? '' : sh.getRange(r, c + 1).getValue(); }
function setCell_(sh, r, name, v) { const c = headers_(sh).indexOf(name); if (c >= 0) sh.getRange(r, c + 1).setValue(v); }

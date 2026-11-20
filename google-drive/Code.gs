/**
 * HSSE Safety – login + Google Drive receiver (Google Apps Script web app).
 *
 * 1. LOGIN: team members sign in to the app with the email + password listed in the "Users" tab of the
 *    "HSSE Safety Records" sheet. To add a person, add a row (Email, Name, Active = Yes) and type a
 *    starting password in "New password". To reset a password, type a new one in "New password".
 *    The script turns it into a secure hash and clears the cell the next time that person signs in.
 *    Set Active to No to block someone.
 * 2. DRIVE: every submitted site audit, saved task and saved toolbox meeting is filed in this account's Drive:
 *      HSSE Safety/
 *        HSSE Safety Records   (Google Sheet: "Site Audits", "Task Updates", "Toolbox Meetings", "Users")
 *        Site Audits/2026-11/2026-11-20 PS Karak/          PDF report + photos
 *        Toolbox Meetings/2026-11/2026-11-20 0800 Bay 2/   PDF + photos
 *        Task Updates/  (tasks are rows in the sheet only)
 *    Saving a record again replaces its PDF/photos and updates its sheet row (no duplicates).
 *
 * Setup: see GOOGLE-DRIVE-SETUP.md. Run setup() once, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone) and give the web app URL to the app.
 */
const ROOT_NAME = 'HSSE Safety';
const SHEET_NAME = 'HSSE Safety Records';
const TYPES = { audit: 'Site Audits', task: 'Task Updates', toolbox: 'Toolbox Meetings', production: 'Production Audits' };
const USERS_TAB = 'Users';
const USER_COLS = ['Email', 'Name', 'Active', 'New password', 'Password hash', 'Last sign-in'];
const START_USERS = [
  ['shaifulsyazwan@octagonmaju.com.my', 'Shaiful Syazwan'],
  ['hsse7@octagonmaju.com.my', 'Masitah'],
  ['hsse10@octagonmaju.com.my', 'Ridzuan']
];
const SESSION_DAYS = 30;

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  const root = root_();
  const ss = sheet_();
  Object.keys(TYPES).forEach(function (t) { child_(root, TYPES[t]); tab_(ss, TYPES[t]); });
  users_(ss);
  Logger.log('Drive folder: ' + root.getUrl());
  Logger.log('Records sheet (add passwords in the "Users" tab): ' + ss.getUrl());
}

/** Signs everyone out (run it if a phone is lost). Everyone signs in again with their password. */
function signOutEveryone() {
  PropertiesService.getScriptProperties().setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('Everyone is signed out.');
}

function doGet() {
  return ContentService.createTextOutput('HSSE Safety Drive receiver is running.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const p = JSON.parse(e.postData.contents);
    const ss = sheet_();
    if (p.type === 'login') return out_(login_(ss, p.email, p.password));
    const who = checkToken_(ss, p.token);
    if (!who) return out_({ ok: false, error: 'signed out' });
    if (p.type === 'password') return out_(changePassword_(ss, who, p.old, p.password));
    const root = root_();
    if (p.type === 'ping') return out_({ ok: true, name: who.name, folderUrl: root.getUrl(), sheetUrl: ss.getUrl() });
    if (!TYPES[p.type] || !p.id) return out_({ ok: false, error: 'bad request' });

    lock.waitLock(60000); locked = true;
    const tab = tab_(ss, TYPES[p.type]);
    const rowIdx = findRow_(tab, p.id);
    const sheetUrl = ss.getUrl() + '#gid=' + tab.getSheetId();

    if (p.deleted) {
      if (rowIdx) {
        const fu = getCell_(tab, rowIdx, 'Folder');
        if (fu) { try { DriveApp.getFolderById(idFromUrl_(fu)).setTrashed(true); } catch (x) {} }
        const del = [['Status', 'Deleted'], ['Saved by', who.name], ['Saved to Drive', new Date()]];
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
    row.push(['Saved by', who.name]);
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

/* ---------- sign-in ---------- */
function users_(ss) {
  let sh = ss.getSheetByName(USERS_TAB);
  if (!sh) {
    sh = ss.insertSheet(USERS_TAB);
    sh.getRange(1, 1, 1, USER_COLS.length).setValues([USER_COLS]);
    sh.getRange(1, 1, 1, USER_COLS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    START_USERS.forEach(function (u, i) { sh.getRange(i + 2, 1, 1, 3).setValues([[u[0], u[1], 'Yes']]); });
  }
  return sh;
}
function col_(name) { return USER_COLS.indexOf(name) + 1; }
function findUser_(sh, email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return 0;
  const lr = sh.getLastRow(); if (lr < 2) return 0;
  const v = sh.getRange(2, 1, lr - 1, 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]).trim().toLowerCase() === email) return i + 2;
  return 0;
}
function hash_(salt, pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  let h = raw; for (let i = 0; i < 5000; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(raw));
  return Utilities.base64Encode(h);
}
function active_(v) { return /^(yes|y|true|1|ya)$/i.test(String(v).trim()); }
function login_(ss, email, pw) {
  const cache = CacheService.getScriptCache();
  const ck = 'tries:' + String(email || '').trim().toLowerCase();
  const tries = Number(cache.get(ck) || 0);
  if (tries >= 5) return { ok: false, error: 'too many tries' };
  const sh = users_(ss);
  const r = findUser_(sh, email);
  const fail = function () { cache.put(ck, String(tries + 1), 900); return { ok: false, error: 'wrong login' }; };
  if (!r || !pw) return fail();
  const row = sh.getRange(r, 1, 1, USER_COLS.length).getValues()[0];
  if (!active_(row[col_('Active') - 1])) return fail();
  const newPw = String(row[col_('New password') - 1] || '');
  let stored = String(row[col_('Password hash') - 1] || '');
  if (newPw) {
    if (pw !== newPw) return fail();
    const salt = Utilities.getUuid();
    stored = salt + '$' + hash_(salt, newPw);
    sh.getRange(r, col_('Password hash')).setValue(stored);
    sh.getRange(r, col_('New password')).setValue('');
  } else {
    const parts = stored.split('$');
    if (parts.length !== 2 || hash_(parts[0], pw) !== parts[1]) return fail();
  }
  cache.remove(ck);
  sh.getRange(r, col_('Last sign-in')).setValue(new Date());
  const emailN = String(row[0]).trim().toLowerCase();
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return { ok: true, token: token_(emailN, exp), email: emailN, name: String(row[1] || emailN), exp: exp, mustChange: !!newPw };
}
function token_(email, exp) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({ e: email, x: exp }));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, PropertiesService.getScriptProperties().getProperty('SECRET')));
  return body + '.' + sig;
}
function checkToken_(ss, t) {
  if (!t || String(t).indexOf('.') < 0) return null;
  const parts = String(t).split('.');
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], PropertiesService.getScriptProperties().getProperty('SECRET')));
  if (sig !== parts[1]) return null;
  let d; try { d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { return null; }
  if (!d || d.x < Date.now()) return null;
  const sh = users_(ss); const r = findUser_(sh, d.e);
  if (!r) return null;
  const row = sh.getRange(r, 1, 1, USER_COLS.length).getValues()[0];
  if (!active_(row[col_('Active') - 1])) return null;
  return { email: d.e, name: String(row[1] || d.e), row: r };
}
function changePassword_(ss, who, oldPw, pw) {
  if (!pw || String(pw).length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  const sh = users_(ss);
  const stored = String(sh.getRange(who.row, col_('Password hash')).getValue() || '').split('$');
  if (stored.length !== 2 || hash_(stored[0], oldPw || '') !== stored[1]) return { ok: false, error: 'Current password is not correct' };
  const salt = Utilities.getUuid();
  sh.getRange(who.row, col_('Password hash')).setValue(salt + '$' + hash_(salt, pw));
  return { ok: true };
}

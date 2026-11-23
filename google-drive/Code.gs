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
 * 3. SYNC: the full record (without photo bytes) is kept in the "Data" tab so every phone and computer that
 *    signs in gets the same tasks, toolbox meetings and submitted audits. Photos are read back from Drive.
 * 4. EMAIL: Monday–Friday 8:30 AM (Malaysia time) a task update goes to every Active person in "Users";
 *    a new task created by Shaiful for someone else is emailed to that person straight away.
 * 5. NEWS: every day at 6 AM (Malaysia time) the latest DOSH, DOE, workplace-accident and safety & health
 *    news in Malaysia is collected from Google News into the "News" tab and shown on the app's dashboard.
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
const MOVEMENT_EDITORS = ['shaifulsyazwan@octagonmaju.com.my']; // who can change the Movement planning
const TASK_NOTIFY_FROM = ['shaifulsyazwan@octagonmaju.com.my'];  // new tasks created by these accounts are emailed to the person assigned
const APP_URL = 'https://shaifulsyazwan10.github.io/hsse-safety-app/';
const TZ = 'Asia/Kuala_Lumpur';

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  const root = root_();
  const ss = sheet_();
  Object.keys(TYPES).forEach(function (t) { child_(root, TYPES[t]); tab_(ss, TYPES[t]); });
  users_(ss);
  setupNews();
  setupEmails();
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
    if (p.type === 'sync') return out_(sync_(ss, p.since));
    if (p.type === 'photo') return out_(photo_(p.id));
    if (p.type === 'news') { lock.waitLock(60000); locked = true; return out_(news_(!!p.force)); }
    const root = root_();
    if (p.type === 'ping') return out_({ ok: true, name: who.name, folderUrl: root.getUrl(), sheetUrl: ss.getUrl() });
    if (p.type === 'movement') {
      // weekly HSSE team movement planning: everyone can read it through sync, only these accounts can change it
      if (MOVEMENT_EDITORS.indexOf(who.email) < 0) return out_({ ok: false, error: 'Only the HSSE manager can update the movement planning' });
      lock.waitLock(60000); locked = true;
      saveData_(ss, 'movement', String(p.id), !!p.deleted, p.deleted ? null : (p.record || null), '', '');
      return out_({ ok: true });
    }
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
      saveData_(ss, p.type, p.id, true, null, '', sheetUrl);
      return out_({ ok: true, sheetUrl: sheetUrl });
    }

    let pdfUrl = '', folderUrl = '';
    const fileIds = [];
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
        fileIds.push(folder.createFile(Utilities.newBlob(Utilities.base64Decode(ph.data), ph.type || 'image/jpeg', clean_(ph.name))).getId());
      });
      folderUrl = folder.getUrl();
    }
    const row = (p.row || []).slice();
    if (p.type !== 'task') { row.push(['PDF', pdfUrl]); row.push(['Folder', folderUrl]); }
    row.push(['Saved by', who.name]);
    row.push(['Saved to Drive', new Date()]);
    writeRow_(tab, rowIdx, p.id, row);
    const firstSave = p.type === 'task' && p.record && !dataRowExists_(ss, 'task', p.id);
    if (p.record) saveData_(ss, p.type, p.id, false, linkPhotos_(p.record, fileIds), pdfUrl, sheetUrl);
    let notified = '';
    if (firstSave && p.record.newTaskNotify) { try { notified = notifyNewTask_(ss, p.record, who); } catch (e) {} }
    return out_({ ok: true, pdfUrl: pdfUrl, folderUrl: folderUrl, sheetUrl: sheetUrl, notified: notified || '' });
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

/* ---------- Safety & health news (Malaysia), refreshed daily ---------- */
// Google News RSS searches, in English and Malay. Each result is tagged with the first group that found it.
const NEWS_FEEDS = [
  { cat: 'DOSH', q: '(DOSH Malaysia OR JKKP OR "Jabatan Keselamatan dan Kesihatan Pekerjaan") when:7d' },
  { cat: 'DOE', q: '("Department of Environment" Malaysia OR "Jabatan Alam Sekitar" OR "JAS Malaysia") when:7d' },
  { cat: 'Accident', q: '("workplace accident" Malaysia OR "industrial accident" Malaysia OR "kemalangan tempat kerja" OR "kemalangan industri" OR "pekerja maut") when:7d' },
  { cat: 'Safety & health', q: '("occupational safety and health" Malaysia OR "NIOSH Malaysia" OR "OSHA 1994" OR "keselamatan dan kesihatan pekerjaan" OR "Akta Keselamatan dan Kesihatan Pekerjaan") when:7d' }
];
const NEWS_TAB = 'News';
const NEWS_KEEP_DAYS = 45;

/** Fetches the latest news into the "News" tab. Runs every day at 6 AM (see setupNews). */
function updateNews() {
  const ss = sheet_();
  let sh = ss.getSheetByName(NEWS_TAB);
  if (!sh) { sh = ss.insertSheet(NEWS_TAB); sh.getRange(1, 1, 1, 6).setValues([['Link', 'Title', 'Source', 'Published', 'Group', 'Added']]); sh.setFrozenRows(1); }
  const lr = sh.getLastRow();
  const old = lr > 1 ? sh.getRange(2, 1, lr - 1, 6).getValues() : [];
  const seen = {}; old.forEach(function (r) { seen[String(r[0])] = 1; seen[normTitle_(r[1])] = 1; });
  const added = [];
  NEWS_FEEDS.forEach(function (f) {
    const lang = [['en-MY', 'MY:en'], ['ms', 'MY:ms']];
    lang.forEach(function (l) {
      const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(f.q) + '&hl=' + l[0] + '&gl=MY&ceid=' + l[1];
      let xml = '';
      try { const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) xml = r.getContentText(); } catch (e) { return; }
      parseRss_(xml).forEach(function (it) {
        const k = normTitle_(it.title);
        if (!it.link || seen[it.link] || seen[k]) return;
        seen[it.link] = 1; seen[k] = 1;
        added.push([it.link, it.title, it.source, it.date, f.cat, new Date()]);
      });
    });
  });
  const cutoff = Date.now() - NEWS_KEEP_DAYS * 864e5;
  const all = old.concat(added).filter(function (r) { const d = new Date(r[3]).getTime(); return !isNaN(d) && d >= cutoff; });
  all.sort(function (a, b) { return new Date(b[3]) - new Date(a[3]); });
  if (lr > 1) sh.getRange(2, 1, lr - 1, 6).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, 6).setValues(all.slice(0, 400));
  PropertiesService.getScriptProperties().setProperty('NEWS_UPDATED', new Date().toISOString());
  Logger.log('News updated: ' + added.length + ' new, ' + Math.min(all.length, 400) + ' kept.');
}

/** Creates the daily 6 AM (Malaysia time) news update. setup() runs it for you. */
function setupNews() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'updateNews') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('updateNews').timeBased().everyDays(1).atHour(6).inTimezone('Asia/Kuala_Lumpur').create();
  updateNews();
}

function news_(force) {
  const props = PropertiesService.getScriptProperties();
  const upd = props.getProperty('NEWS_UPDATED');
  const age = upd ? Date.now() - new Date(upd).getTime() : Infinity;
  if (age > 26 * 36e5 || (force && age > 36e5)) { try { updateNews(); } catch (e) {} }
  const sh = sheet_().getSheetByName(NEWS_TAB);
  const lr = sh ? sh.getLastRow() : 0;
  const rows = lr > 1 ? sh.getRange(2, 1, Math.min(lr - 1, 120), 5).getValues() : [];
  return { ok: true, updated: props.getProperty('NEWS_UPDATED') || '',
    items: rows.map(function (r) { return { link: String(r[0]), title: String(r[1]), source: String(r[2]), date: new Date(r[3]).toISOString(), cat: String(r[4]) }; }) };
}

function parseRss_(xml) {
  const out = [];
  const items = String(xml || '').match(/<item>[\s\S]*?<\/item>/g) || [];
  items.forEach(function (x) {
    const get = function (tag) { const m = x.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? decode_(m[1]) : ''; };
    let title = get('title'); const source = get('source');
    if (source && title.slice(-(source.length + 3)) === ' - ' + source) title = title.slice(0, -(source.length + 3));
    const d = new Date(get('pubDate'));
    out.push({ title: title, link: get('link'), source: source, date: isNaN(d) ? '' : d.toISOString() });
  });
  return out;
}
function decode_(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}
function normTitle_(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80); }

/* ---------- sync between devices ---------- */
const DATA_TAB = 'Data';
const DATA_COLS = ['Key', 'Type', 'ID', 'Updated', 'Deleted', 'PDF', 'Sheet', 'Chunks'];
const CHUNK = 45000; // characters per cell (a Sheets cell holds up to 50,000)
function data_(ss) {
  let sh = ss.getSheetByName(DATA_TAB);
  if (!sh) { sh = ss.insertSheet(DATA_TAB); sh.getRange(1, 1, 1, DATA_COLS.length).setValues([DATA_COLS]); sh.setFrozenRows(1); }
  return sh;
}
/** photos in the record are {k:'p', i:n} placeholders for the n-th uploaded photo; point them at the Drive files */
function linkPhotos_(rec, ids) {
  const walk = function (v) {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      if (v.k === 'p' && typeof v.i === 'number') return ids[v.i] ? { k: 'g', id: ids[v.i], name: v.name || '' } : null;
      const o = {}; Object.keys(v).forEach(function (k) { const x = walk(v[k]); if (x !== null) o[k] = x; }); return o;
    }
    return v;
  };
  const out = walk(rec);
  const clean = function (v) { if (Array.isArray(v)) return v.filter(function (x) { return x !== null; }).map(clean); if (v && typeof v === 'object') { Object.keys(v).forEach(function (k) { v[k] = clean(v[k]); }); } return v; };
  return clean(out);
}
function saveData_(ss, type, id, deleted, rec, pdfUrl, sheetUrl) {
  const sh = data_(ss);
  const key = type + '_' + id;
  const json = rec ? JSON.stringify(rec) : '';
  const chunks = []; for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  const row = [key, type, id, new Date().toISOString(), deleted ? 'yes' : '', pdfUrl || '', sheetUrl || '', chunks.length].concat(chunks);
  const lr = sh.getLastRow();
  let r = 0;
  if (lr > 1) { const keys = sh.getRange(2, 1, lr - 1, 1).getValues(); for (let i = 0; i < keys.length; i++) if (keys[i][0] === key) { r = i + 2; break; } }
  if (!r) r = lr + 1;
  const width = Math.max(sh.getLastColumn(), row.length);
  const full = row.concat(new Array(width - row.length).fill(''));
  sh.getRange(r, 1, 1, width).setValues([full]);
}
function sync_(ss, since) {
  const sh = data_(ss);
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  const now = new Date().toISOString();
  if (lr < 2) return { ok: true, now: now, items: [] };
  const rows = sh.getRange(2, 1, lr - 1, lc).getValues();
  const items = [];
  rows.forEach(function (r) {
    const upd = String(r[3]);
    if (since && upd <= since) return;
    const n = Number(r[7]) || 0;
    let rec = null;
    if (!r[4] && n) { try { rec = JSON.parse(r.slice(8, 8 + n).join('')); } catch (e) { rec = null; } }
    items.push({ type: String(r[1]), id: String(r[2]), updated: upd, deleted: !!r[4], pdfUrl: String(r[5] || ''), sheetUrl: String(r[6] || ''), record: rec });
  });
  return { ok: true, now: now, items: items };
}
function photo_(id) {
  try {
    const b = DriveApp.getFileById(String(id)).getBlob();
    return { ok: true, type: b.getContentType() || 'image/jpeg', data: Utilities.base64Encode(b.getBytes()) };
  } catch (e) { return { ok: false, error: 'photo not found' }; }
}

/* ---------- task emails ---------- */
/** Creates the Monday–Friday 8:30 AM task update. setup() runs it for you. */
function setupEmails() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendTaskDigest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendTaskDigest').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone(TZ).create();
}
/** Runs every day at about 8:30 AM; sends only Monday to Friday. */
function sendTaskDigest() {
  const dow = Number(Utilities.formatDate(new Date(), TZ, 'u')); // 1 = Monday … 7 = Sunday
  if (dow > 5) return;
  sendTaskDigestNow();
}
/** Sends the task update now (use this to test). */
function sendTaskDigestNow() {
  const ss = sheet_();
  const to = teamEmails_(ss);
  if (!to.length) return;
  const tasks = dataRecords_(ss, 'task');
  const now = new Date();
  const dueAt = function (t) { return t.due ? new Date(t.due + 'T' + (t.dueTime || '17:00') + ':00+08:00') : null; };
  const open = tasks.filter(function (t) { return t.status !== 'C'; });
  const over = open.filter(function (t) { const d = dueAt(t); return d && d < now; });
  const soon = open.filter(function (t) { const d = dueAt(t); return d && d >= now && d - now <= 2 * 864e5; });
  const back = Number(Utilities.formatDate(now, TZ, 'u')) === 1 ? 3 : 1; // Monday looks back over the weekend
  const done = tasks.filter(function (t) { return t.status === 'C' && t.completedAt && now - new Date(t.completedAt) <= back * 864e5; });
  const pr = { H: 0, M: 1, L: 2 };
  open.sort(function (a, b) { return (pr[a.priority || 'M'] - pr[b.priority || 'M']) || ((dueAt(a) || 8e15) - (dueAt(b) || 8e15)); });
  const day = Utilities.formatDate(now, TZ, 'EEE d MMM yyyy');
  const subject = (over.length ? '[' + over.length + ' overdue] ' : '') + 'HSSE Task Update – ' + day;
  const P = { H: ['High', '#c62f2f', '#fff'], M: ['Medium', '#f2b300', '#1b1400'], L: ['Low', '#1f8a4c', '#fff'] };
  const S = { P: 'Pending', O: 'On going', C: 'Complete' };
  const esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const left = function (t) {
    const d = dueAt(t); if (!d) return ''; let ms = d - now; const o = ms < 0; ms = Math.abs(ms);
    const dd = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), mi = Math.floor(ms % 36e5 / 6e4);
    const span = dd ? dd + ' day' + (dd > 1 ? 's' : '') + ' ' + h + ' h' : h ? h + ' h ' + mi + ' min' : mi + ' min';
    return o ? 'Overdue by ' + span : span + ' left';
  };
  const note = function (t) { const l = (t.log || [])[(t.log || []).length - 1]; return l && l.note ? l.note : ''; };
  const table = function (list) {
    if (!list.length) return '<p style="color:#4b5a68;margin:6px 0 14px">None.</p>';
    return '<table style="border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 16px">' +
      '<tr style="background:#eef1f4;text-align:left"><th style="padding:6px">Task</th><th style="padding:6px">Priority</th><th style="padding:6px">Assigned to</th><th style="padding:6px">Status</th><th style="padding:6px">%</th><th style="padding:6px">Due</th><th style="padding:6px">Remaining</th><th style="padding:6px">Latest update</th></tr>' +
      list.map(function (t) {
        const p = P[t.priority || 'M']; const d = dueAt(t); const r = left(t);
        return '<tr style="border-top:1px solid #d6dde4"><td style="padding:6px"><b>' + esc(t.title) + '</b></td>' +
          '<td style="padding:6px"><span style="background:' + p[1] + ';color:' + p[2] + ';padding:2px 8px;border-radius:10px;font-weight:700;font-size:12px">' + p[0] + '</span></td>' +
          '<td style="padding:6px">' + esc(t.assignee) + '</td><td style="padding:6px">' + S[t.status] + '</td><td style="padding:6px">' + (t.pct || 0) + '%</td>' +
          '<td style="padding:6px;white-space:nowrap">' + (d ? Utilities.formatDate(d, TZ, 'd MMM yyyy, HH:mm') : '') + '</td>' +
          '<td style="padding:6px;' + (/Overdue/.test(r) ? 'color:#c62f2f;font-weight:700' : '') + '">' + r + '</td><td style="padding:6px">' + esc(note(t)) + '</td></tr>';
      }).join('') + '</table>';
  };
  const people = teamNames_(ss).map(function (n) {
    const mine = open.filter(function (t) { return t.assignee === n; }); const mo = mine.filter(function (t) { return over.indexOf(t) >= 0; });
    return '<li>' + esc(n) + ': ' + mine.length + ' open' + (mo.length ? ', <b style="color:#c62f2f">' + mo.length + ' overdue</b>' : '') + '</li>';
  }).join('');
  const html = '<div style="font-family:Arial,sans-serif;max-width:720px;color:#16222e">' +
    '<div style="background:#00008B;color:#fff;padding:14px 18px;border-bottom:4px solid #f2b300"><b style="font-size:18px">HSSE Safety – Task Update</b><br><span style="font-size:13px">' + day + '</span></div>' +
    '<p style="font-size:14px">Pending <b>' + open.filter(function (t) { return t.status === 'P'; }).length + '</b> · On going <b>' + open.filter(function (t) { return t.status === 'O'; }).length +
    '</b> · Complete <b>' + tasks.filter(function (t) { return t.status === 'C'; }).length + '</b> · Overdue <b style="color:#c62f2f">' + over.length + '</b></p>' +
    (over.length ? '<h3 style="color:#c62f2f;margin:14px 0 0">Overdue</h3>' + table(over) : '') +
    (soon.length ? '<h3 style="color:#b07a00;margin:14px 0 0">Due within 2 days</h3>' + table(soon) : '') +
    '<h3 style="color:#00008B;margin:14px 0 0">All open tasks</h3>' + table(open) +
    (done.length ? '<h3 style="color:#1f8a4c;margin:14px 0 0">Completed ' + (back === 3 ? 'since Friday' : 'since yesterday') + '</h3><ul>' + done.map(function (t) { return '<li><b>' + esc(t.title) + '</b> – ' + esc(t.assignee) + (note(t) ? ' · ' + esc(note(t)) : '') + '</li>'; }).join('') + '</ul>' : '') +
    '<h3 style="color:#00008B;margin:14px 0 0">By person</h3><ul>' + people + '</ul>' +
    '<p style="font-size:13px;margin-top:18px">Update your tasks in the HSSE Safety app: <a href="' + APP_URL + '#tasks">' + APP_URL + '</a></p>' +
    '<p style="font-size:12px;color:#7a8896">Automated email – sent Monday to Friday at 8:30 AM.</p></div>';
  const text = 'HSSE Task Update – ' + day + '\nOpen ' + open.length + ', overdue ' + over.length + '.\n\n' +
    open.map(function (t) { return '- ' + t.title + ' (' + P[t.priority || 'M'][0] + ', ' + t.assignee + ', ' + S[t.status] + ' ' + (t.pct || 0) + '%, ' + left(t) + ')'; }).join('\n') +
    '\n\nUpdate your tasks: ' + APP_URL + '#tasks';
  MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, body: text, name: 'HSSE Safety' });
}
function notifyNewTask_(ss, t, who) {
  if (TASK_NOTIFY_FROM.indexOf(who.email) < 0) return '';
  const email = emailForName_(ss, t.assignee);
  if (!email || email === who.email) return '';
  const P = { H: 'High', M: 'Medium', L: 'Low' };
  const due = t.due ? Utilities.formatDate(new Date(t.due + 'T' + (t.dueTime || '17:00') + ':00+08:00'), TZ, 'EEE d MMM yyyy, HH:mm') : '–';
  const esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;color:#16222e">' +
    '<div style="background:#00008B;color:#fff;padding:14px 18px;border-bottom:4px solid #f2b300"><b style="font-size:18px">New HSSE task for you</b></div>' +
    '<p>' + esc(who.name) + ' has assigned you a task:</p>' +
    '<table style="font-size:14px;border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#4b5a68">Task</td><td><b>' + esc(t.title) + '</b></td></tr>' +
    (t.desc ? '<tr><td style="padding:4px 12px 4px 0;color:#4b5a68">Details</td><td>' + esc(t.desc) + '</td></tr>' : '') +
    '<tr><td style="padding:4px 12px 4px 0;color:#4b5a68">Priority</td><td>' + (P[t.priority || 'M']) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;color:#4b5a68">Date to complete</td><td>' + due + '</td></tr></table>' +
    '<p><a href="' + APP_URL + '#tasks" style="background:#00008B;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Open Task updates</a></p>' +
    '<p style="font-size:12px;color:#7a8896">Automated email from the HSSE Safety app.</p></div>';
  MailApp.sendEmail({ to: email, subject: 'New HSSE task: ' + t.title + ' (due ' + due + ')', htmlBody: html,
    body: who.name + ' has assigned you a task: ' + t.title + '\nPriority: ' + P[t.priority || 'M'] + '\nDue: ' + due + (t.desc ? '\nDetails: ' + t.desc : '') + '\n\nOpen the app: ' + APP_URL + '#tasks', name: 'HSSE Safety' });
  return t.assignee;
}
function teamRows_(ss) { const sh = users_(ss); const lr = sh.getLastRow(); return lr > 1 ? sh.getRange(2, 1, lr - 1, USER_COLS.length).getValues().filter(function (r) { return r[0] && active_(r[2]); }) : []; }
function teamEmails_(ss) { return teamRows_(ss).map(function (r) { return String(r[0]).trim().toLowerCase(); }); }
function teamNames_(ss) { return teamRows_(ss).map(function (r) { return String(r[1] || r[0]).trim(); }); }
function emailForName_(ss, name) {
  const n = String(name || '').trim().toLowerCase(); if (!n) return '';
  const rows = teamRows_(ss);
  let r = rows.filter(function (x) { return String(x[1]).trim().toLowerCase() === n; })[0];
  if (!r) r = rows.filter(function (x) { const f = String(x[1]).trim().toLowerCase(); return f && (f.indexOf(n) === 0 || n.indexOf(f) === 0); })[0];
  return r ? String(r[0]).trim().toLowerCase() : '';
}
function dataRowExists_(ss, type, id) {
  const sh = data_(ss); const lr = sh.getLastRow(); if (lr < 2) return false;
  const key = type + '_' + id; const keys = sh.getRange(2, 1, lr - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) if (keys[i][0] === key) return true;
  return false;
}
function dataRecords_(ss, type) {
  const sh = data_(ss); const lr = sh.getLastRow(), lc = sh.getLastColumn(); if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, lc).getValues().filter(function (r) { return r[1] === type && !r[4] && Number(r[7]); })
    .map(function (r) { try { return JSON.parse(r.slice(8, 8 + Number(r[7])).join('')); } catch (e) { return null; } }).filter(Boolean);
}

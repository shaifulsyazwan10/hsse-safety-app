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

/* ---------- Daily task reminder (AI agent) ----------
 * Every working day (Mon–Fri) at about 8:30 AM Malaysia time, this emails ONE summary of all
 * pending work to REMINDER_TO: overdue + due soon on top, all open tasks, and a count per person.
 * Turn it on: run startDailyReminder() once. Turn it off: run stopDailyReminder().
 * Test it now: run sendDailyTaskReminder() (it sends even on weekends when run by hand).
 */
const REMINDER_TO = 'shaifulsyazwan@octagonmaju.com.my';
const REMINDER_TZ = 'Asia/Kuala_Lumpur';

function startDailyReminder() {
  stopDailyReminder();
  ScriptApp.newTrigger('dailyReminderTrigger').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone(REMINDER_TZ).create();
  Logger.log('Daily reminder is ON: Mon–Fri about 8:30 AM to ' + REMINDER_TO);
}
function stopDailyReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (/^dailyReminderTrigger_?$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  Logger.log('Daily reminder is OFF.');
}
/** Run by the daily alarm (must not end in _ or Google cannot call it). */
function dailyReminderTrigger() {
  const day = Utilities.formatDate(new Date(), REMINDER_TZ, 'u'); // 1 = Mon ... 7 = Sun
  if (day === '6' || day === '7') return;
  sendDailyTaskReminder();
}

function sendDailyTaskReminder() {
  const ss = sheet_();
  const sh = ss.getSheetByName(TYPES.task);
  const sheetTz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const tasks = [];
  if (sh && sh.getLastRow() > 1) {
    const v = sh.getDataRange().getValues();
    const h = v[0].map(String);
    const get = function (row, name) { const i = h.indexOf(name); return i < 0 ? '' : row[i]; };
    for (let r = 1; r < v.length; r++) {
      const status = String(get(v[r], 'Status') || 'Pending').trim();
      if (!get(v[r], 'Task') || /^(complete|deleted)$/i.test(status)) continue;
      const due = dueDate_(get(v[r], 'Date to complete'), get(v[r], 'Time'), sheetTz);
      tasks.push({
        title: String(get(v[r], 'Task')), who: String(get(v[r], 'Assigned to') || 'Not assigned'),
        prio: String(get(v[r], 'Priority') || 'Medium'), status: status,
        pct: Number(get(v[r], 'Progress %')) || 0, due: due,
        note: String(get(v[r], 'Latest update') || get(v[r], 'Last update') || '')
      });
    }
  }
  const HOUR = 3600000;
  tasks.forEach(function (t) { t.left = t.due ? t.due.getTime() - now.getTime() : null; });
  const rank = { High: 0, Medium: 1, Low: 2 };
  tasks.sort(function (a, b) {
    const ad = a.left == null ? Infinity : a.left, bd = b.left == null ? Infinity : b.left;
    return ad - bd || (rank[a.prio] ?? 1) - (rank[b.prio] ?? 1);
  });
  const overdue = tasks.filter(function (t) { return t.left != null && t.left < 0; });
  const soon = tasks.filter(function (t) { return t.left != null && t.left >= 0 && t.left <= 48 * HOUR; });

  const people = {};
  tasks.forEach(function (t) {
    const p = people[t.who] || (people[t.who] = { open: 0, late: 0 });
    p.open++; if (t.left != null && t.left < 0) p.late++;
  });

  const dateTxt = Utilities.formatDate(now, REMINDER_TZ, 'EEE dd MMM yyyy');
  const subject = (overdue.length ? '[' + overdue.length + ' overdue] ' : '') + 'HSSE Pending Work – ' + dateTxt;
  const th = 'style="background:#00008B;color:#fff;padding:6px;text-align:left;font-size:13px"';
  const td = 'style="border-bottom:1px solid #ddd;padding:6px;font-size:13px;vertical-align:top"';
  const prioColor = { High: '#d32f2f', Medium: '#f9a825', Low: '#2e7d32' };
  const table = function (list, title, color) {
    if (!list.length) return '';
    let s = '<h3 style="color:' + color + ';margin:18px 0 6px">' + title + ' (' + list.length + ')</h3>'
      + '<table style="border-collapse:collapse;width:100%"><tr><th ' + th + '>Task</th><th ' + th + '>Priority</th><th ' + th
      + '>Assigned to</th><th ' + th + '>Status</th><th ' + th + '>%</th><th ' + th + '>Due</th><th ' + th + '>Remaining</th><th '
      + th + '>Latest update</th></tr>';
    list.forEach(function (t) {
      s += '<tr><td ' + td + '><b>' + esc_(t.title) + '</b></td>'
        + '<td ' + td + '><span style="color:' + (prioColor[t.prio] || '#555') + ';font-weight:bold">' + esc_(t.prio) + '</span></td>'
        + '<td ' + td + '>' + esc_(t.who) + '</td><td ' + td + '>' + esc_(t.status) + '</td><td ' + td + '>' + t.pct + '%</td>'
        + '<td ' + td + '>' + (t.due ? Utilities.formatDate(t.due, REMINDER_TZ, 'dd MMM yyyy HH:mm') : '-') + '</td>'
        + '<td ' + td + (t.left != null && t.left < 0 ? ' bgcolor="#ffebee"' : '') + '>' + remainTxt_(t.left) + '</td>'
        + '<td ' + td + '>' + esc_(t.note) + '</td></tr>';
    });
    return s + '</table>';
  };

  let html = '<div style="font-family:Arial,sans-serif;max-width:900px">'
    + '<div style="background:#00008B;color:#fff;padding:14px 16px;font-size:18px;font-weight:bold">HSSE Safety – Daily Pending Work</div>'
    + '<p style="font-size:13px;color:#555">' + dateTxt + ' · ' + tasks.length + ' open task(s) · '
    + '<b style="color:#d32f2f">' + overdue.length + ' overdue</b> · <b style="color:#ef6c00">' + soon.length + ' due within 2 days</b></p>';
  if (!tasks.length) {
    html += '<p>Good news – there is no pending work today. ✅</p>';
  } else {
    html += table(overdue, 'Overdue', '#d32f2f') + table(soon, 'Due within 2 days', '#ef6c00') + table(tasks, 'All pending work', '#00008B');
    html += '<h3 style="color:#00008B;margin:18px 0 6px">Per person</h3><table style="border-collapse:collapse"><tr><th ' + th
      + '>Person</th><th ' + th + '>Open</th><th ' + th + '>Overdue</th></tr>';
    Object.keys(people).sort().forEach(function (n) {
      html += '<tr><td ' + td + '>' + esc_(n) + '</td><td ' + td + '>' + people[n].open + '</td><td ' + td
        + (people[n].late ? ' style="color:#d32f2f;font-weight:bold;border-bottom:1px solid #ddd;padding:6px"' : '') + '>' + people[n].late + '</td></tr>';
    });
    html += '</table>';
  }
  html += '<p style="font-size:12px;color:#888;margin-top:20px">Full list: <a href="' + ss.getUrl() + '">HSSE Safety Records</a> (Task Updates tab).</p></div>';

  MailApp.sendEmail({ to: REMINDER_TO, subject: subject, htmlBody: html, name: 'HSSE Task Reminder' });
  Logger.log('Sent "' + subject + '" to ' + REMINDER_TO);
}

function dueDate_(d, t, sheetTz) {
  if (!d) return null;
  const day = d instanceof Date ? Utilities.formatDate(d, sheetTz, 'yyyy-MM-dd') : String(d).trim().replace(/^'/, '');
  let time = t instanceof Date ? Utilities.formatDate(t, sheetTz, 'HH:mm') : String(t || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(time)) time = '17:00';
  if (time.length === 4) time = '0' + time;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const out = new Date(day + 'T' + time + ':00+08:00');
  return isNaN(out) ? null : out;
}
function remainTxt_(ms) {
  if (ms == null) return '-';
  const a = Math.abs(ms), d = Math.floor(a / 86400000), h = Math.floor((a % 86400000) / 3600000);
  const s = (d ? d + ' day' + (d > 1 ? 's ' : ' ') : '') + h + ' h';
  return ms < 0 ? '<b style="color:#d32f2f">Overdue by ' + s + '</b>' : s + ' left';
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

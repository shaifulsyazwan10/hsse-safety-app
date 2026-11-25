---
name: hsse-safety-app
description: Build, update and extend the HSSE Safety Department app (Octagon) — a phone + computer web app with Site Audit inspections (Yes/No/N/A checklist, photos, signatures, scoring, PDF report with logo), Task Updates (Pending/On going/Complete, priority, %, due date, remaining time) and Factory Toolbox Meeting records (brief by, date, time, location, hazard points, photos, PDF). Use this skill whenever the user mentions the HSSE app, safety audit, site audit inspection, HSSE checklist, task update for the safety team, toolbox meeting / TBT records, adding a new safety feature or form, changing a dropdown list (clients, auditors, engineers, contractors), or the daily task update email — even if they do not name the app.
---

# HSSE Safety App

A single-page web app for the HSSE / Safety Department of Octagon Group of Companies. It opens on phone and computer and keeps one shared record for the whole team.

- **Live app (Artifact):** https://claude.ai/artifact/ArdGTfN88sBMYUmodk6uK1
- **Full source:** `assets/hsse-safety-app.html` (the exact published page, ~110 KB, logo embedded)
- **GitHub copy (device storage + Google Drive):** https://shaifulsyazwan10.github.io/hsse-safety-app/ — served from `docs/index.html` in github.com/shaifulsyazwan10/hsse-safety-app (GitHub Pages, branch `main`, folder `/docs`). Build it by wrapping `assets/hsse-safety-app.html` in a full HTML document (doctype, charset, viewport with `viewport-fit=cover`, the small reset incl. `[hidden]{display:none!important}`). Outside claude.ai the same code saves to IndexedDB on each device, downloads PDF/CSV through the browser, and shows Backup / Restore (JSON, merged by `updatedAt`) to move records between devices. There is no shared team data there. `scripts/standalone-test.js` checks this mode.
- **Daily email instructions:** `references/daily-task-email.md`

## How to work on it

1. **Updating the existing app (the usual case).** Publish to the same URL so the team keeps one link and all saved records stay. In a new conversation:
   - `Artifact` action `read` with the URL above, then build on what comes back (it may have changed since this skill was saved). If the read fails, start from `assets/hsse-safety-app.html`.
   - Edit the file, then publish with `url` set to the artifact URL. Omit `capabilities` so the stored declaration (`db`, `user`, `assets {upload:"interact"}`, `downloads`) carries forward. Omit `icon`.
2. **Making a fresh copy for someone else** — publish `assets/hsse-safety-app.html` as a new artifact with `capabilities: {"db":{}, "user":{}, "assets":{"upload":"interact"}, "downloads":true}` and icon `clipboard`.
3. Test in headless Chromium before publishing (Playwright is preinstalled). The page falls back to localStorage when `window.claude` is absent, so it runs from `file://`. For PDF tests, cdnjs may be blocked in the sandbox: `npm i jspdf@2.5.1 html2canvas@1.4.1` and `page.route(/cdnjs/, …)` to the local files; mock `downloads` with `page.evaluate(() => { downloads = {save: async r => …} })`.
4. Before publishing a bigger change, run `scripts/e2e-stress-test.js` (45 checks: all three features on an iPhone 13 profile, required-field blocking, special characters, PDFs with photos and signatures, photo fallback, 400 audits / 800 tasks / 400 toolbox records, slow network, desktop dark mode). It mocks the claude.ai runtime and needs `npm i jspdf@2.5.1 html2canvas@1.4.1` in its parent folder and six large JPEGs `big0..5.jpg` beside it; adjust the paths at the top.
5. Make small changes with targeted edits; the user asks for many small tweaks one at a time and expects a short confirmation of exactly what changed.

## The user's preferences (learned while building it)

These came from direct requests — keep them when adding features:
- **Dropdowns over free text** for names/clients/contractors, but some fields are deliberately free text (Location site, Toolbox "Brief by"). Ask before converting.
- **Required fields** are marked with a red `*` and block Save/Submit with a list of what's missing, scrolling to the first gap. Unanswered questions get highlighted red with "Answer required".
- **"No" answers require a comment** (corrective action) — red-bordered box opens automatically.
- **Sections can be switched off per site** ("Is X involved at this site? Yes/No"); No = all questions N/A, collapsed and excluded from score.
- **Colours:** brand dark blue `#00008B` (headers, buttons), safety yellow `#f2b300` accent, green comply, red not-comply. Priority: High red, Medium yellow, Low green.
- **PDF downloads** (not HTML): A4, Octagon logo top-right (white background, no black), "… / Safety Department" top-left, no Form ID or Project rows, footer with page numbers. Built with html2canvas + jsPDF from cdnjs, one card per block (`makePdf()` helper).
- Date-only for "Conducted on"; contractor is multi-select chips; Company in charge removed.
- Header: white bar with the Octagon logo (`#hdrLogo` ← `LOGO`) + "HSSE Safety / Safety Department", then a dark-blue tab bar with a yellow underline (dashboard look requested from a reference screenshot).
- Plain, short, task-focused UI copy. Malaysia context (MYT, Malay names, Petronas/Shell stations).

## App structure (inside the HTML)

Tabs: **Dashboard** (`dash`, the home page: filters for date range + person, 8 KPI rings, and five plain-SVG charts built by `barChart()` — activity by month, Not comply by section, average score by client, tasks by priority, task leaderboard; colours `--s1/--s2/--s3` = validated categorical slots blue/orange/aqua, each chart has hover tooltips, tap-to-filter and a Table view), **Site audits** (`list` / `form` / `report`), **Task updates** (`tasks` / `task`), **Toolbox meeting** (`tb` / `tbedit` / `tbview`), **Production audit** (`pa` / `paedit` / `paview`: the Production Safety League Program form from the user's Word sample — General information (supervisor, area, date, activity, audit by) and `PA_SECTIONS` = 6 sections / 16 items marked 1 Poor … 5 Excellent, total out of 80, marks 1–2 need a comment, per-item photos, Save draft / Submit, PDF, CSV, and a "Safety league" chart of average score by area). `go(view)` routes; `TABOF` maps views to tabs; `#btnNew` label changes per tab.

**Production audit** tab (`pa` / `paedit` / `paview`): the Production Safety League Program form from the user's Word sample — General information (supervisor, area, date, activity, audit by HSSE) and `PA_SECTIONS` = 6 sections / 16 items marked 1 Poor … 5 Excellent, a Yes/No "Is <section> involved at this site?" switch per section (`r.secOn`, `paSecState`; No = section hidden and left out of the total, every section must be chosen before submit), total out of the involved sections' maximum (`paScore().max`, 80 when all six are involved), marks 1–2 need a comment, per-item photos, Save draft / Submit, PDF (`paPdfArgs`), CSV, a "Safety league" chart of average score by area, a dashboard chart and the Drive type `production`. Records: `production/<id>` `{supervisor, area, date, activity, auditBy, marks{'1.1':{v,c,p[]}}, status, closedAt}`.

Lists (edit these constants to change dropdowns):
- `CLIENTS` – Petronas, Shell, BHP, Petron, Proton, Total Energies, MCD, Mitsubishi, EV, Honda
- `AUDITORS` – safety team: Shaiful Syazwan, Ridzuan, Masitah (also the only task assignees)
- `ENGINEERS` – Not Available + 18 site engineers/supervisors (also used for PH/WL)
- `CONTRACTORS` – 19 contractors/installers
- `SECTIONS` – 17 audit sections, 72 questions (ids like `wah1`, `sky8`); Chemical Q1 wording was assumed (missing from the source PDF)

Shared database collections (`db` capability; read/write from Claude with the `ArtifactData` tool):
- `audits/<id>` – `{site, client, conductedOn (YYYY-MM-DD), work, auditBy, engineer, contractors[], contractor (joined), contractorOther, manpower, sharingPhotos[], sectionPhotos{}, secOn{sectionId:true|false}, answers{qid:{v:"Y"|"N"|"NA", c, x, p[]}}, sigAuditor, ackName, sigAck, status:"draft"|"closed", pct, nc, …}`
- `tasks/<id>` – `{title, desc, assignee, priority:"H"|"M"|"L", status:"P"|"O"|"C", pct, start, due, dueTime, completedAt, log[{at,status,pct,note}]}`
- `production/<id>` – `{supervisor, area, date, activity, auditBy, marks{'1.1':{v:1-5,c,p[]}}, status:'draft'|'closed', closedAt}`; `paScore(r)` gives total, %, average mark and band.
- `toolbox/<id>` – `{briefBy, date, time, location, points[], topic (joined), photos[]}`
- `photos/<id>` – fallback compressed photo data when asset upload isn't allowed. Photos are refs `{k:"a"|"d"|"i", id|data}`; assets serve at `/_blob/<id>`.

Score = Comply ÷ (Comply + Not comply); N/A and switched-off sections excluded (differs from the old Novade weighted score).

## Sign-in + Google Drive (GitHub address only)

The user chose **no Firebase**. On the GitHub address each device keeps its own records (IndexedDB), team members sign in, and records are copied to the department's Google Drive — all through one Apps Script web app (`google-drive/Code.gs`; admin steps in `GOOGLE-DRIVE-SETUP.md`).
- **Sign-in:** users live in the **Users** tab of the "HSSE Safety Records" sheet (Email, Name, Active, New password, Password hash, Last sign-in). Admin types a starting password in *New password*; on first sign-in the script stores a salted SHA-256 hash and clears it, and the app asks the member to change it. `{type:"login"}` returns an HMAC-signed token (30 days, secret in Script Properties; `signOutEveryone()` rotates it). Every other call carries `token`; the script re-checks the user is still Active. 5 wrong tries → 15 min block (CacheService). The app stores `session` in IndexedDB and shows `showLogin()` until signed in; the server URL comes from `docs/drive-config.js` (`window.HSSE_DRIVE_URL`) or is typed once on the sign-in screen (`drive-url`).
- **Drive copy:** `driveSend(type,id)` after audit submit, task save/delete, toolbox save/delete → IndexedDB `drive-queue` → `processDriveQueue()` POSTs JSON (text/plain, no preflight) `{token, type, id, month, folderName, pdf, photos, row}` or `{deleted:true}`. The script files PDF + photos under `HSSE Safety/<type>/<YYYY-MM>/<record>/`, upserts a sheet row by ID with *Saved by*, and returns links stored in `drive-log` and shown as "Saved to Google Drive · Open PDF". Sheet values starting with = + - @ get a leading '.
- **Account screen** (`renderDrive`, header button "Account"): connection check, send all records again, change password, sign out.
- claude.ai's CSP blocks script.google.com, so none of this runs in the artifact (the artifact uses its own shared db, no sign-in).
- Tests: `scripts/gas-mock.js` runs Code.gs on in-memory Drive/Sheets (`/admin?email=&v=&col=` sets a Users cell); `scripts/drive-test.js` (22 checks) and `scripts/standalone-test.js` drive the app against it with `window.HSSE_DRIVE_TEST=true`.

## HSSE Plan (annual, plan vs actual)

Tab **HSSE Plan** (`plan`, between Movement planning and Site audits), from the user's "OM Annual HSSE Plan 2026 – Updated Status Plan" PDF. One record per year in collection `hsseplan` (id "2026"): `{id, year, title, sections:[{title, objective, items:[{id, no, action, freq, plan:[12 bool], actual:[12 ''|'done'|'missed'], notes:[12 str], pct, remark}]}], attachments:[{name, k:'static'|'g'|'a', path|id, type, at}], updatedAt, updatedBy}`.
- Seed: `docs/hsse-plan-2026.json` (also `assets/plan/`): 48 action plans in 10 sections; actual = PDF cell colours (green done / red not done, read by pixel sampling); plan = every month for MONTHLY/WEEKLY, months with a mark, plus "PLANNING ON <MONTH>" remarks; cell labels ("UEM", "BA8 & BA6", "Shoe rack", …) kept as notes. Used until the first saved edit (`plDoc()` falls back to `plSeed`). Original PDF attached as `attachments/HSSE_Plan_2026.pdf` (in `docs/` and as an artifact file). The user agreed to push the PDF and plan data to GitHub.
- Status %: `plPct(i)` = floor(done ÷ planned months for the year ×100), like the PDF (8/12 = 66%); items with `pctMode:'manual'` keep a typed % (9 seed items whose PDF % reflects partial progress: training on request, LTW, HIRARC, ERP HQ drill, SW disposal, walkabout, reward). Saving a month runs `plAutoRemark()` (100% → COMPLETE, below 100 from COMPLETE → ON GOING). Remark is a dropdown (ON GOING, COMPLETE, PENDING, NOT STARTED, NO REQ, PLANNING ON <month>, Other…). Seed planned months were completed for quarterly / twice-yearly / every-2-month / 2-initiative items so the automatic % matches the PDF; `plUpgrade()` adds them to plans saved before `planVer:2`. Overall on the seed data = 46.6%.
- View: table with Plan and Actual rows per action (planned light blue, done green, not done red, current month marked), Status % with bar, Remark; phone shows cards with a 12-month P/A strip. Tiles: Overall achieved = average Status % excluding "NO REQ" and blanks (46.9% on the PDF data; the PDF's own 48.30% cannot be reproduced from its column), Complete, On going, Not done (months). Download PDF = A4 landscape.
- Edit (Shaiful only — same `MOVEMENT_EDITORS` / owner rule; Code.gs refuses others; claude.ai db rule `{path:"hsseplan", write:"owner"}`): tap a month (Planned / Not planned, Done / Not done / Not yet, note), tap an action (name, no., frequency, status %, remark, delete), tap a section (title, objective), + Add action plan, + Add file (GitHub: `{type:"attach"}` → Drive "HSSE Safety/HSSE Plan", opened via `{type:"photo", id}`; claude.ai: assets), Remove file, "Start <year> plan from the previous year".
- Test: `scripts/plan-test.js`.

## Movement planning (weekly)

Tab **Movement planning** (`mv`, second tab, between Dashboard and Site audits): the HSSE Team Movement Planning sheet from the user's Excel file, viewed one week at a time (Previous / This week / Next / date jump / planned-week chips; today highlighted). One record per week, id = Monday's date: `{id, people:[{name, designation, days:[{t, k:'site'|'office'|'leave'|'weekend'}×7], leave, remarks}], updatedAt, updatedBy}`. Colours follow the Excel legend: site task green, office task yellow, on leave red, weekend grey (`--mv-*` tokens). Computer: table (sticky name column); phone (≤760px): one card per person, Monday → Sunday. **Only Shaiful can change it**: `MOVEMENT_EDITORS` in the app and in Code.gs (server refuses others: "Only the HSSE manager…"); on claude.ai the editor is the artifact owner (`userCap.isOwner()`) and the db rule `{path:"movement", read:"view", write:"owner"}` enforces it. Editor tools: tap a cell (type + text + quick PH/AL/EL/MC), tap a name, + Add person, remove person, Create this week's plan (copies last week's people, Office Mon–Fri / Weekend), Delete week, and **Import from Excel** (SheetJS 0.18.5 from cdnjs with `cellStyles`; one sheet per week, `Name` header row, dates under Monday–Sunday; fill 92D050=site, FFF067=office, FF0000=leave). Everyone: Download PDF of the week (A4 landscape: `makePdf({...,orientation:"landscape"})` renders a 1120px-wide box). Synced on GitHub as Drive type `movement` (Data tab only). Test: `scripts/mv-test.js`.

## Sync between devices (GitHub address)

Records live in each device's IndexedDB, so the Apps Script is also the shared store. Every upload carries `record` (the full JSON; photos become `{k:"p",i}` placeholders for the uploaded files via `lastPhotoIdx`), and `saveData_()` keeps it in the **Data** tab (Key, Type, ID, Updated, Deleted, PDF, Sheet, Chunks, then 45,000-character JSON chunks), with photo placeholders turned into `{k:"g", id:<Drive file id>}` by `linkPhotos_()`. `pullSync()` asks `{type:"sync", since}` on start, sign-in, every 2 minutes, when signal returns and when the app comes back to the screen; newer `updatedAt` wins, deletions remove submitted records, and anything still in the local upload queue is kept. On a device's first sync it queues all its own submitted audits, tasks, toolbox meetings and submitted production audits (`sync-pushed-v1`) so older records reach the others. `photoSrc()` fetches `k:"g"` photos with `{type:"photo", id}` and caches them in IndexedDB (`gp:<id>`). Drafts are not synced. Test: `scripts/sync-test.js` (computer + phone).

## Safety & health news (dashboard)

The dashboard shows **Safety & Health News** at the very top, under the heading and above the filters and counters (`#newsCard`) (`renderNewsCard`, `loadNews`). On the GitHub address the app calls the Apps Script with `{type:"news", token, force}`; the script's `updateNews()` runs daily at 6 AM Asia/Kuala_Lumpur (trigger made by `setupNews()`, called from `setup()`), fetches Google News RSS searches (`NEWS_FEEDS`: DOSH/JKKP, DOE/JAS, workplace accidents incl. Malay terms, general OSH; `when:7d`, `hl=en-MY` and `ms`), parses them with regex (`parseRss_`), de-duplicates by link and normalised title, keeps 45 days (max 400) in the **News** sheet tab, and `news_()` returns up to 120 items (refreshing first if older than 26 h). The app caches the last list in IndexedDB (`news-cache`) for offline use; filter chips by group; headlines open the source in a new tab. On claude.ai (CSP blocks outside fetches) the card points to the GitHub version; it would also read a `news/latest` db document if one is ever written. Tests: `scripts/gas-mock.js` stubs UrlFetchApp with sample RSS; `scripts/news-test.js`.

## Task emails (Apps Script MailApp)

The earlier plan (a claude.ai scheduled task + Gmail connector) could not attach Gmail, so emails now come from the department's Apps Script via `MailApp` (sender = the account that owns the script):
- **Daily update:** `setupEmails()` (called by `setup()`) creates a daily trigger at ~8:30 AM Asia/Kuala_Lumpur for `sendTaskDigest()`, which skips Saturday/Sunday and calls `sendTaskDigestNow()`: one email to every Active row of the **Users** tab, built from the task records in the **Data** tab — counts, Overdue, Due within 2 days, All open tasks (priority then due), Completed since yesterday (since Friday on Mondays), per-person open/overdue, link to `APP_URL#tasks`. Subject `[N overdue] HSSE Task Update – Mon 23 Nov 2026`.
- **New task alert:** the app sets `newTaskNotify:true` on a task when it is created; on that task's first save to the Data tab, if the uploader is in `TASK_NOTIFY_FROM` (Shaiful) and the assignee is someone else, `notifyNewTask_()` emails the assignee (matched by Users tab Name, then prefix) and the upload returns `notified:<name>` → toast "Task saved to Google Drive – Masitah notified by email". Updates, self-assigned tasks and tasks created by others send nothing.
- Recipient list from the user: shaifulsyazwan@ / hsse7@ (Masitah) / hsse10@ (Ridzuan) octagonmaju.com.my — kept in the Users tab, not hard-coded. `references/daily-task-email.md` is the older spec. Test: `scripts/email-test.js` (gas-mock records MailApp).

## Sharing

The artifact is private by default; team members need **Contributor** access via the Share menu to add records and upload photos.

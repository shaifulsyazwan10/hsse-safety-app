---
name: hsse-safety-app
description: Build, update and extend the HSSE Safety Department app (Octagon) — a phone + computer web app with Site Audit inspections (Yes/No/N/A checklist, photos, signatures, scoring, PDF report with logo), Task Updates (Pending/On going/Complete, priority, %, due date, remaining time) and Factory Toolbox Meeting records (brief by, date, time, location, hazard points, photos, PDF). Use this skill whenever the user mentions the HSSE app, safety audit, site audit inspection, HSSE checklist, task update for the safety team, toolbox meeting / TBT records, adding a new safety feature or form, changing a dropdown list (clients, auditors, engineers, contractors), or the daily task update email — even if they do not name the app.
---

# HSSE Safety App

A single-page web app for the HSSE / Safety Department of Octagon Group of Companies. It opens on phone and computer and keeps one shared record for the whole team.

- **Live app (Artifact):** https://claude.ai/artifact/ArdGTfN88sBMYUmodk6uK1
- **Full source:** `assets/hsse-safety-app.html` (the exact published page, ~110 KB, logo embedded)
- **GitHub copy (device-only version):** https://shaifulsyazwan10.github.io/hsse-safety-app/ — served from `docs/index.html` in github.com/shaifulsyazwan10/hsse-safety-app (GitHub Pages, branch `main`, folder `/docs`). Build it by wrapping `assets/hsse-safety-app.html` in a full HTML document (doctype, charset, viewport with `viewport-fit=cover`, the small reset incl. `[hidden]{display:none!important}`). Outside claude.ai the same code saves to IndexedDB on each device, downloads PDF/CSV through the browser, and shows Backup / Restore (JSON, merged by `updatedAt`) to move records between devices. There is no shared team data there. `scripts/standalone-test.js` checks this mode.
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
- Plain, short, task-focused UI copy. Malaysia context (MYT, Malay names, Petronas/Shell stations).

## App structure (inside the HTML)

Tabs: **Site audits** (`list` / `form` / `report`), **Task updates** (`tasks` / `task`), **Toolbox meeting** (`tb` / `tbedit` / `tbview`). `go(view)` routes; `TABOF` maps views to tabs; `#btnNew` label changes per tab.

Lists (edit these constants to change dropdowns):
- `CLIENTS` – Petronas, Shell, BHP, Petron, Proton, Total Energies, MCD, Mitsubishi, EV, Honda
- `AUDITORS` – safety team: Shaiful Syazwan, Ridzuan, Masitah (also the only task assignees)
- `ENGINEERS` – Not Available + 18 site engineers/supervisors (also used for PH/WL)
- `CONTRACTORS` – 19 contractors/installers
- `SECTIONS` – 17 audit sections, 72 questions (ids like `wah1`, `sky8`); Chemical Q1 wording was assumed (missing from the source PDF)

Shared database collections (`db` capability; read/write from Claude with the `ArtifactData` tool):
- `audits/<id>` – `{site, client, conductedOn (YYYY-MM-DD), work, auditBy, engineer, contractors[], contractor (joined), contractorOther, manpower, sharingPhotos[], sectionPhotos{}, secOn{sectionId:true|false}, answers{qid:{v:"Y"|"N"|"NA", c, x, p[]}}, sigAuditor, ackName, sigAck, status:"draft"|"closed", pct, nc, …}`
- `tasks/<id>` – `{title, desc, assignee, priority:"H"|"M"|"L", status:"P"|"O"|"C", pct, start, due, dueTime, completedAt, log[{at,status,pct,note}]}`
- `toolbox/<id>` – `{briefBy, date, time, location, points[], topic (joined), photos[]}`
- `photos/<id>` – fallback compressed photo data when asset upload isn't allowed. Photos are refs `{k:"a"|"d"|"i", id|data}`; assets serve at `/_blob/<id>`.

Score = Comply ÷ (Comply + Not comply); N/A and switched-off sections excluded (differs from the old Novade weighted score).

## Firebase (GitHub Pages address)

`docs/index.html` loads `docs/firebase-config.js`. When `window.HSSE_FIREBASE` has an `apiKey` and the page is not inside claude.ai, `initFirebase()` loads the Firebase compat SDK 10.12.2 from gstatic, shows an email/password sign-in screen, and adapts Firestore to the same `db.collection().doc().set/get/delete` + `onSnapshot` interface the app uses on claude.ai. Collections are the same (`audits`, `tasks`, `toolbox`, `photos`); photos are compressed data URLs in `photos/<id>` (no Cloud Storage, so the free Spark plan works). Writes return after 4 s even when offline ("Saved on this device – will upload when online"); offline persistence is on. Access is controlled by `firestore.rules` (email allowlist) in the repo root; setup steps for the user are in `FIREBASE-SETUP.md`. Test with `scripts/firebase-test.js` against the local emulator (`firebase emulators:start --only auth,firestore`, needs Java; create accounts through the emulator's signUp REST endpoint).

## Google Drive copy (Firebase mode only)

`driveSend(type,id)` runs after an audit is submitted, a task is saved/deleted, or a toolbox meeting is saved/deleted. It queues the record in IndexedDB (`drive-queue`) and `processDriveQueue()` POSTs JSON (text/plain, no CORS preflight) to the owner's Apps Script web app: `{key, type, id, month, folderName, pdf:{name,data}, photos:[…], row:[[header,value]…]}` or `{deleted:true}`. PDFs come from `makePdf({...auditPdfArgs(a)|tbPdfArgs(t), blobOnly:true})`. The script (`google-drive/Code.gs` in the repo; user steps in `GOOGLE-DRIVE-SETUP.md`) files PDF + photos under `HSSE Safety/<type>/<YYYY-MM>/<record>/` and upserts a row by ID in the "HSSE Safety Records" sheet. URL + key live in Firestore `settings/drive` (team-only via rules); results go to `drivelog/<type>_<id>` and show as a "Saved to Google Drive · Open PDF" line on the record. Sheet values starting with = + - @ are prefixed with ' . claude.ai's CSP blocks script.google.com, so this does not run in the artifact. Test: `scripts/gas-mock.js` runs Code.gs on in-memory Drive/Sheets; `scripts/drive-test.js` drives the app against it and the Firebase emulator.

## Daily task email

The user wants one email to the safety team Mon–Fri ~5:30 PM MYT summarising tasks. Recipients and the full email spec are in `references/daily-task-email.md`. A scheduled task created from a chat session could not attach the Gmail connector (org setting), so it must be created from the claude.ai scheduled-tasks UI with Gmail selected, using that file as the prompt. A disabled duplicate named "HSSE daily task update email" may exist — suggest deleting it.

## Sharing

The artifact is private by default; team members need **Contributor** access via the Share menu to add records and upload photos.

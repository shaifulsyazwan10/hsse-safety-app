# Sign-in + Google Drive setup (one time, about 10 minutes)

The app at https://shaifulsyazwan10.github.io/hsse-safety-app/ uses one small Google Apps Script, owned by the HSSE department's Google account, for three jobs:

1. **Sign-in** – each team member signs in with an email and password that you manage in the **Users** tab of a Google Sheet.
2. **Google Drive copy** – every submitted site audit, saved task and saved toolbox meeting is saved in that account's Drive:

3. **Daily news** – every day at 6 AM (Malaysia time) the script collects the latest DOSH / JKKP, DOE / JAS, workplace-accident and safety & health news in Malaysia from Google News (English and Malay) into the **News** tab. The dashboard shows it under **Safety & Health News**.

```
My Drive/
└── HSSE Safety/
    ├── HSSE Safety Records        ← Google Sheet: "Site Audits", "Task Updates", "Toolbox Meetings", "Production Audits", "Users"
    ├── Site Audits/2026-11/2026-11-20 PS Karak/          ← PDF report + all photos
    ├── Toolbox Meetings/2026-11/2026-11-20 0800 Bay 2/   ← PDF + briefing photos
    ├── Production Audits/2026-11/2026-11-20 Line 2/      ← PDF + item photos
    └── Task Updates/                                     ← (tasks are rows in the sheet)
```

Saving a record again replaces its PDF and photos and updates its sheet row (no duplicates). A deleted record is marked **Deleted** and its folder goes to the Drive bin. Each row shows **Saved by** (the person signed in). Any tab can be downloaded as CSV (*File → Download → CSV*).

## A. Create the script (admin, once)

Use the Google account that should own the files, for example the HSSE department account.

1. Open https://script.google.com → **New project** → rename it `HSSE Safety`.
2. Delete everything in `Code.gs`, paste the contents of [`google-drive/Code.gs`](google-drive/Code.gs), click **Save**.
3. At the top choose the function **setup** → **Run** → allow the permissions (Drive, Sheets, *connect to an external service* for the news, and *run when you are not present* for the daily 6 AM update). It also collects the first news straight away.
4. **Deploy → New deployment** → type **Web app** → *Execute as:* **Me** → *Who has access:* **Anyone** → **Deploy**. Copy the **Web app URL** (ends with `/exec`).
5. Send that URL to Claude (or paste it into [`docs/drive-config.js`](docs/drive-config.js) as `window.HSSE_DRIVE_URL = "…/exec";` and commit). Then members only type email + password. If you skip this, each person pastes the URL once on the sign-in screen.

## B. Give each member a password (admin)

1. Open **My Drive → HSSE Safety → HSSE Safety Records → Users** tab. The three team members are already listed.
2. For each person, type a **starting password** in the **New password** column (at least 8 characters). Make sure **Active** says **Yes**.
3. Tell each person their starting password privately (WhatsApp/phone).

When the person signs in, the script turns the password into a secure code in **Password hash** and clears **New password**, and the app asks them to choose their own password.

| To… | Do this in the Users tab |
|---|---|
| Add a person | New row: Email, Name, Active = **Yes**, New password = starting password |
| Reset a forgotten password | Type a new one in **New password** |
| Block a person | Set **Active** to **No** (they are signed out at their next upload) |
| Sign everyone out (lost phone) | In the script, run **signOutEveryone** |

## C. On each phone (members)

Open the app link → **Sign in** with email and password → change the starting password when asked. They stay signed in for 30 days and can work with no signal; uploads go through when signal returns. Tip: in Chrome/Safari choose **Add to Home Screen**.

## Notes

- **Updating an existing script** (for example to add the daily news): paste the new code, run **setup** once and allow the new permissions, then *Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy*.

- "Who has access: Anyone" only lets the app reach the script without a Google sign-in. Nothing is saved or shown without a valid team sign-in, and passwords are never stored in readable form.
- **Updating the script later:** paste the new code, then *Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy*. The URL stays the same.
- **Limits (free Google account):** one upload up to about 50 MB (an audit with 25 photos is about 6 MB); about 90 minutes of script time per day, roughly 1,000+ uploads.

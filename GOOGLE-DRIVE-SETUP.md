# Google Drive setup (one time, about 5 minutes)

After this, every **submitted site audit**, **saved task** and **saved toolbox meeting** from the app at https://shaifulsyazwan10.github.io/hsse-safety-app/ is copied to the Google Drive of the account you use below:

```
My Drive/
└── HSSE Safety/
    ├── HSSE Safety Records        ← Google Sheet: tabs "Site Audits", "Task Updates", "Toolbox Meetings"
    ├── Site Audits/2026-11/2026-11-20 PS Karak/          ← PDF report + all photos
    ├── Toolbox Meetings/2026-11/2026-11-20 0800 Bay 2/   ← PDF + briefing photos
    └── Task Updates/                                     ← (tasks are rows in the sheet)
```

Saving a record again replaces its PDF and photos and updates its sheet row, so there are no duplicates. A deleted record is marked **Deleted** in the sheet and its folder goes to the Drive bin. Any tab can be downloaded as CSV (*File → Download → CSV*).

Use the Google account that should own the files, for example the HSSE department account.

1. Open https://script.google.com and click **New project**. Rename it `HSSE Safety Drive`.
2. Delete everything in `Code.gs` and paste the contents of [`google-drive/Code.gs`](google-drive/Code.gs). Click **Save**.
3. In the function list at the top choose **setup** and click **Run**. Allow the permissions it asks for (Drive and Sheets, for your own account).
4. Open **Execution log**. Copy the line `Drive key (paste into the app > Drive): …`.
5. Click **Deploy → New deployment** → type **Web app** →
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**

   → **Deploy**, and copy the **Web app URL** (ends with `/exec`).
6. On **each phone or computer** that uses the app: open the app, tap **Drive** at the top, paste the **Web app URL** and the **Drive key**, tap **Test connection**, then **Save**. The settings stay on that device.
7. Optional: tap **Send all records to Google Drive** on a device to copy everything already saved on it.

Records saved before a device is set up wait on that device and upload as soon as step 6 is done there. Records saved with no signal upload when signal returns (keep the app open for a moment once you are back online).

"Who has access: Anyone" only means the app can reach the script without a Google sign-in; nothing is accepted without the Drive key. Give the key only to your team; it is kept in the app's storage on each device. If the key ever leaks, run `newKey` in the script and paste the new key into the app.

**Updating the script later:** paste the new code, then *Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy*. The URL stays the same.

**Limits (free Google account):** a single upload can be up to about 50 MB (an audit with 25 photos is about 6 MB); Apps Script allows about 90 minutes of run time per day, roughly 1,000+ uploads.

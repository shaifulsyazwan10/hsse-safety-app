# HSSE Safety App – Claude skill

Claude skill for building, updating and extending the HSSE Safety Department app: Site Audit inspections, Task Updates and Factory Toolbox Meeting records, with PDF reports.

- `hsse-safety-app/` – the skill folder (`SKILL.md`, app source in `assets/`, daily email spec in `references/`, end-to-end and stress test in `scripts/`)
- `hsse-safety-app.skill` – packaged file; open it in Claude and choose **Save skill** to install

## Live app

- **GitHub Pages:** https://shaifulsyazwan10.github.io/hsse-safety-app/ (from `docs/index.html`). No sign-in. Records are saved on each phone or computer, and every submitted site audit, saved task and saved toolbox meeting is copied to the department's Google Drive: PDFs and photos in folders by month, plus the **HSSE Safety Records** Google Sheet with one row per record. Setup: [GOOGLE-DRIVE-SETUP.md](GOOGLE-DRIVE-SETUP.md). **Backup** / **Restore** in the app move records between devices.
- **claude.ai:** https://claude.ai/artifact/ArdGTfN88sBMYUmodk6uK1. Records are shared by the whole team inside the app (share it as Contributor from the Share menu). claude.ai blocks the Google Drive copy.

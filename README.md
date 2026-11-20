# HSSE Safety App – Claude skill

Claude skill for building, updating and extending the HSSE Safety Department app: Site Audit inspections, Task Updates and Factory Toolbox Meeting records, with PDF reports.

- `hsse-safety-app/` – the skill folder (`SKILL.md`, app source in `assets/`, daily email spec in `references/`, end-to-end and stress test in `scripts/`)
- `hsse-safety-app.skill` – packaged file; open it in Claude and choose **Save skill** to install

## Live app

- **GitHub Pages + Firebase:** https://shaifulsyazwan10.github.io/hsse-safety-app/ (from `docs/index.html`). Team members sign in with email and password and share one set of records stored in Firebase. Setup: [FIREBASE-SETUP.md](FIREBASE-SETUP.md). Until `docs/firebase-config.js` is filled in, records are saved on each device (with Backup / Restore).
- **claude.ai:** https://claude.ai/artifact/ArdGTfN88sBMYUmodk6uK1. Records are shared by the whole team (share it as Contributor from the Share menu).

# Firebase setup (one time, about 10 minutes)

The app at https://shaifulsyazwan10.github.io/hsse-safety-app/ uses Firebase for shared team records and sign-in. Everything below is on the free **Spark** plan (no card needed).

1. **Create the project** – https://console.firebase.google.com → *Add project* → name it `hsse-safety` → Google Analytics can be off → *Create*.
2. **Turn on sign-in** – *Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save*.
3. **Add the team accounts** – *Authentication → Users → Add user* for each person, with a starting password:
   - shaifulsyazwan@octagonmaju.com.my
   - hsse7@octagonmaju.com.my
   - hsse10@octagonmaju.com.my
4. **Create the database** – *Build → Firestore Database → Create database* → location **asia-southeast1 (Singapore)** → *Start in production mode* → *Create*.
5. **Lock the database to the team** – *Firestore → Rules*, replace everything with the contents of [`firestore.rules`](firestore.rules), then *Publish*. (It also allows the `settings` and `drivelog` collections used by the Google Drive copy.)
6. **Allow the GitHub address to sign in** – *Authentication → Settings → Authorized domains → Add domain* → `shaifulsyazwan10.github.io`.
7. **Get the web config** – *Project settings (gear) → Your apps → Web (`</>`)* → nickname `hsse-web` → *Register app* → copy the `firebaseConfig` object into [`docs/firebase-config.js`](docs/firebase-config.js) as `window.HSSE_FIREBASE = { ... };` and commit. (These values identify the project; they are not passwords. Security comes from step 5.)

## Adding or removing a person
Add/remove the user in *Authentication → Users*, and add/remove their email in the list in *Firestore → Rules* (and in `firestore.rules`), then *Publish*.

## Free plan limits
1 GiB stored (roughly 7,000–10,000 photos at the app's compressed size), 50,000 reads and 20,000 writes per day. Photos are stored inside the database, so Cloud Storage (which needs the paid Blaze plan) is not used.

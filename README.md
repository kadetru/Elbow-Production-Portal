# Elbow Production Portal

Champion Fiberglass elbow bending portal: Production Tracking and Planning.
Hosted on GitHub Pages, data in Firebase Firestore (project `cfi-elbow-production-portal`).

## Files

| File | What it is |
|---|---|
| `index.html` | The portal |
| `auth.js` | Sign-in screen and sign-out |
| `firebase-config.js` | Identifies the Firebase project (not secret) |
| `firestore.rules` | Who can read and edit. Paste into the Firebase console; it is not read from here |
| `migrate.html` | One-time copy of the old claude.ai data into Firestore |

**Never commit** the backup JSON or the service account key file to this repo.

## Access

- Accounts are created in Firebase console → Authentication → Users → Add user.
- Every signed-in user can **view**.
- To let someone **edit**, add a document in Firestore → `users` collection:
  - Document ID = their User UID (copy it from Authentication → Users)
  - Field `role` (string) = `editor`
- Anyone without that document is view-only. Remove the document to take edit access away.

## First-time setup (in order)

1. Upload these files to the root of the repo's `main` branch.
2. Repo → Settings → Pages → Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save.
3. Firebase console → Firestore Database → Rules → replace everything with the contents of `firestore.rules` → Publish.
4. Firebase console → Authentication → Settings → Authorized domains → Add `kadetru.github.io`.
5. Make yourself an editor (see Access above).
6. Open `https://kadetru.github.io/<repo-name>/migrate.html`, sign in, choose the backup JSON from your PC, click **Copy into Firestore**, and wait for "Migration complete".
7. Open the portal and check that Overview totals match the claude.ai version for the same dates.
8. Planning → Upload Backlog: upload the two NetSuite backlog files again to fill in order details (PO, rep, memo).

After step 7, stop using the claude.ai version. New uploads go to this portal only.

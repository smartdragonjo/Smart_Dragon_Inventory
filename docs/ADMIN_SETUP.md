# Smart Dragon Inventory — Admin MVP Setup

## 1. Firebase Authentication

In Firebase Console → Authentication → Sign-in method:

- Enable **Google** provider.
- Add the production domains used by the admin page to **Authorized domains**, including:
  - `smartdragonjo.github.io`
  - `smartdragon-search.firebaseapp.com` (normally already present)

The initial Owner account is:

- `smartdragonjordan@gmail.com`

## 2. Firestore Rules

Publish the project root file `firestore.rules` in Firebase Console → Firestore Database → Rules.

These rules preserve public reads for the existing `cars` collection and add the admin workflow collections.

## 3. First login and import

Open:

`https://smartdragonjo.github.io/Smart_Dragon_Inventory/admin/`

Generate the import artifact from the repository root:

```powershell
python scripts/analyze_csv.py
python scripts/build_migration_preview.py
python scripts/prepare_import.py
```

Sign in with the Owner Google account, then press **استيراد البيانات الحالية**. The import reads `exports/import_ready.json`, validates the entire file before writing, and imports only `ready` legacy records. Deterministic IDs (`legacy_<sourceRow>`) make retries update the same records. Reimporting can overwrite subsequent edits to those records; it does not delete records absent from the file. Multi-batch imports can partially complete; retry the same file after resolving an error.

`exports/import_summary.json` describes local generation only. Its `firebaseUploadPerformed: false` is not evidence of the current database contents. The admin success message and Firestore documents are the upload verification.

## 3a. Deployment order and search health

1. With a project-authorized Firebase CLI account, inspect existing indexes:
   `firebase.cmd firestore:indexes --project smart-dragon-search`
2. Publish `firestore.rules` and the indexes in `firestore.indexes.json` using Firebase Console, or:
   `firebase.cmd deploy --only firestore:rules,firestore:indexes --project smart-dragon-search`
   Preserve unrelated production indexes; do not accept deletion of unrelated indexes.
3. Wait for indexes to finish building. Deploy the updated static files including `exports/import_ready.json`.
4. In Admin, import the ready records (or use **إعادة بناء ملخص الشركات** for an already populated database).
5. Use **فحص فهارس البحث**, then verify Make → Model → Year and the returned fitments on the public page.

The admin runs direct, uncached server probes at login. Missing-index fallbacks show a persistent warning banner; permission/network errors propagate instead of triggering expensive collection scans. The banner also reports missing/dirty summary documents. Browser warnings are local to the same origin/browser; the login probes independently check the project from other admin devices.

Equality-only queries can use Firestore index merging, so absence of a dedicated composite index alone does not prove a query will fail. The probes test the actual query shapes. See [Firebase index merging documentation](https://firebase.google.com/docs/firestore/query-data/index-overview#use_index_merging).

`meta/makes` contains the sorted unique approved makes, `revision`, `dirty`, and `updatedAt`. Public clients read this one document, cached for ten minutes. The owner admin marks it dirty atomically with each vehicle write batch and rebuilds it after saving, deleting, approving, importing, or restoring. Revision checks retry when another admin changes vehicles during a rebuild. If rebuilding fails, the banner and repair button expose recovery. Cold public reads fail visibly while the summary is missing/dirty; existing browser caches can remain stale for up to ten minutes.

The rebuild scans approved vehicles on admin writes, not customer visits. Direct Console/API writes bypass this workflow and require a manual rebuild. Publish the rules before using the updated admin: summary writes are owner-only.

## 4. Adding an Editor later

After the editor signs in once and you know their Firebase Authentication UID, create this document manually in Firestore for now:

Collection: `users`
Document ID: `<EDITOR_FIREBASE_UID>`

```json
{
  "email": "editor@example.com",
  "displayName": "Editor Name",
  "role": "editor",
  "enabled": true
}
```

Editor changes are written to `change_requests` with `pending_review`. Only the Owner can approve and publish them.

## 5. Current boundary

Production public search reads approved Firestore records and `meta/makes`. `data/vehicles.json` remains a local preview asset and is not the admin import source.

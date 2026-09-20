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

Sign in with the Owner Google account, then press **استيراد البيانات الحالية** once. The import uses deterministic IDs (`legacy_<sourceRow>`), so rerunning it updates the same legacy records rather than creating duplicates.

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

The public customer vehicle selector still reads `data/vehicles.json`. The Admin MVP writes to Firestore. Switching the public selector to approved Firestore records is a separate deployment step after the admin data is verified.

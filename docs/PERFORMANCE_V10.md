# Public search performance v10

The public vehicle selector now avoids re-reading the complete approved vehicle collection after the manufacturer is chosen.

- Manufacturer list: loaded once per browser session and cached in `sessionStorage` for 10 minutes.
- Models: queried progressively by `status + make`.
- Years and match candidates: queried progressively by `status + make + model`.
- Selected vehicle: reuses the vehicle document already returned by the progressive query and only fetches its approved fitments.
- Active category definitions: warmed and cached while manufacturers load.
- If a Firestore composite index is unavailable, the code falls back to the previous approved-vehicle scan instead of breaking customer search.

No Firestore security-rule change is required for v10.

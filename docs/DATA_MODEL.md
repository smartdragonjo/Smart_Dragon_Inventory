# Smart Dragon Inventory — Data Model

> Status: Draft for migration preparation  
> Scope: Data model only. Firebase is not enabled yet.

## 1. Goals

The data model must support:

- Customer flow: Make → Model → Year.
- Explicit `yearStart` / `yearEnd` ranges maintained by editors/owner.
- Dynamic categories created by the Owner.
- Review workflow before publication.
- Bulk approval by the Owner.
- Audit history and backups.
- Future integration with:
  - Smart Dragon Search (`/search`)
  - Smart Dragon API
  - Smart Dragon MCP
  - AI product recommendations

The AI layer must never invent vehicle fitment data. Fitment must come from approved records.

---

## 2. Core Collections

### `vehicles`

Represents an approved vehicle/year-range record.

```json
{
  "make": "Toyota",
  "model": "Corolla",
  "arabicMake": "تويوتا",
  "arabicKeywords": ["كورولا"],
  "yearStart": 2019,
  "yearEnd": 2022,

  "status": "approved",
  "dataQuality": "complete",
  "hasOverlap": false,

  "createdAt": null,
  "createdBy": null,
  "updatedAt": null,
  "updatedBy": null,
  "approvedAt": null,
  "approvedBy": null
}
```

### Vehicle rules

- `make` is required.
- `model` is required.
- `yearStart` and `yearEnd` are required before publication.
- `yearStart <= yearEnd`.
- Unknown years must not be published.
- Overlapping ranges are allowed only after review.
- Public search reads approved records only.

---

### `categories`

Dynamic fitment categories managed by the Owner.

```json
{
  "name": "اللمبات",
  "slug": "lighting",
  "active": true,

  "fieldsDefinition": [
    {
      "key": "lowBeam",
      "label": "الواطي",
      "type": "bulb",
      "required": false
    },
    {
      "key": "highBeam",
      "label": "العالي",
      "type": "bulb",
      "required": false
    },
    {
      "key": "fogLight",
      "label": "الضباب",
      "type": "bulb",
      "required": false
    }
  ],

  "createdAt": null,
  "createdBy": null,
  "updatedAt": null,
  "updatedBy": null
}
```

Only the Owner may create, edit, disable, or delete categories.

---

### `vehicle_fitments`

Stores category-specific data separately from the vehicle identity.

```json
{
  "vehicleId": "VEHICLE_DOCUMENT_ID",
  "categoryId": "lighting",

  "fields": {
    "lowBeam": {
      "type": "replaceable_bulb",
      "code": "H11",
      "aliases": [],
      "technology": "halogen",
      "dependsOnTrim": false,
      "notApplicable": false,
      "notes": null
    },

    "highBeam": {
      "type": "replaceable_bulb",
      "code": "9005",
      "aliases": ["HB3"],
      "technology": "halogen",
      "dependsOnTrim": false,
      "notApplicable": false,
      "notes": null
    },

    "fogLight": {
      "type": null,
      "code": null,
      "aliases": [],
      "technology": null,
      "dependsOnTrim": false,
      "notApplicable": true,
      "notes": null
    }
  },

  "notes": null,
  "source": "legacy_csv",
  "status": "approved",

  "createdAt": null,
  "createdBy": null,
  "updatedAt": null,
  "updatedBy": null
}
```

---

## 3. Bulb Value Model

Do not store every bulb value as one uncontrolled text field.

### Replaceable bulb example

```json
{
  "type": "replaceable_bulb",
  "code": "9005",
  "aliases": ["HB3"],
  "technology": "halogen",
  "dependsOnTrim": false,
  "notApplicable": false,
  "notes": null
}
```

### OEM LED / trim-dependent example

Legacy value:

```text
LED/OEM varies by trim
```

Structured form:

```json
{
  "type": "oem_led",
  "code": null,
  "aliases": [],
  "technology": "LED",
  "dependsOnTrim": true,
  "notApplicable": false,
  "notes": "Varies by trim"
}
```

### Not applicable example

Legacy value:

```text
N/A
```

Structured form:

```json
{
  "type": null,
  "code": null,
  "aliases": [],
  "technology": null,
  "dependsOnTrim": false,
  "notApplicable": true,
  "notes": null
}
```

`N/A` means not applicable / the part does not exist for that field.  
It must not be treated as missing information.

---

## 4. Wiper Category

Recommended field definition:

```json
{
  "name": "المساحات",
  "slug": "wipers",
  "fieldsDefinition": [
    {
      "key": "driver",
      "label": "السائق",
      "type": "wiper_size",
      "unit": "inch"
    },
    {
      "key": "passenger",
      "label": "الراكب",
      "type": "wiper_size",
      "unit": "inch"
    },
    {
      "key": "rear",
      "label": "الخلفية",
      "type": "wiper_size",
      "unit": "inch"
    }
  ]
}
```

Values should be selected from predefined sizes where possible.

Example:

```json
{
  "driver": 26,
  "passenger": 16,
  "rear": null
}
```

---

## 5. Screens Category

The legacy `Screen_Frame_Type_Size` field mixes several concepts.

Future structured representation:

```json
{
  "name": "الشاشات",
  "slug": "screens",
  "fieldsDefinition": [
    {
      "key": "options",
      "label": "خيارات الشاشة",
      "type": "screen_options"
    }
  ]
}
```

Example fitment:

```json
{
  "options": [
    {
      "size": 9,
      "unit": "inch",
      "mountType": "double_din",
      "systemType": "android",
      "oemCompatible": false,
      "notes": null
    },
    {
      "size": 10,
      "unit": "inch",
      "mountType": "double_din",
      "systemType": "android",
      "oemCompatible": false,
      "notes": null
    }
  ]
}
```

Legacy screen text must not be aggressively parsed automatically. Ambiguous values should remain under review.

---

## 6. Change Review Workflow

### `change_requests`

Editors do not directly overwrite published data.

```json
{
  "targetType": "vehicle",
  "targetId": "DOCUMENT_ID",
  "action": "update",

  "before": {},
  "after": {},

  "status": "pending_review",

  "submittedBy": "USER_UID",
  "submittedAt": null,

  "reviewedBy": null,
  "reviewedAt": null,
  "reviewNotes": null
}
```

Supported statuses:

```text
pending_review
approved
rejected
needs_review
```

Owner must be able to approve multiple requests in one bulk action.

---

## 7. Audit Log

### `audit_logs`

Audit records should be append-only from the normal admin UI.

```json
{
  "action": "vehicle.update",
  "entityType": "vehicle",
  "entityId": "DOCUMENT_ID",

  "before": {},
  "after": {},

  "userId": "USER_UID",
  "userEmail": "user@example.com",

  "timestamp": null
}
```

The frontend must not be the security boundary for audit logs.

---

## 8. Users / Roles

### `users`

```json
{
  "email": "editor@example.com",
  "role": "editor",
  "active": true,
  "createdAt": null,
  "createdBy": "OWNER_UID"
}
```

Supported roles:

```text
owner
editor
```

### Owner

May:

- Add and edit data.
- Delete data.
- Manage users.
- Manage categories.
- Approve/reject changes.
- Bulk approve.
- View audit logs.
- Manage backups.

### Editor

May:

- Add data.
- Edit data.
- Submit changes for review.

May not:

- Delete published data.
- Approve changes.
- Manage users.
- Manage categories.

Actual enforcement must be implemented in Firebase Security Rules / trusted backend logic later.

---

## 9. Migration Statuses

The CSV migration preview currently uses:

```text
ready
needs_review
conflict
duplicate_exact
```

### `ready`

Can be transformed into import candidates.

### `needs_review`

Must not be published automatically.

Typical reasons:

- Unknown year range.
- Missing fitment information.
- Incomplete record.

### `conflict`

Same vehicle and same range exist with different data.

Requires manual resolution.

### `duplicate_exact`

Redundant copy of another record.

Should not become a second imported vehicle record.

---

## 10. Data Quality

Current migration quality values:

```text
complete
partial
unknown_years
conflicting
duplicate
```

These are migration/admin metadata. They are not customer-facing labels.

---

## 11. Overlapping Year Ranges

`hasOverlap = true` is a warning, not an automatic rejection.

Possible causes:

- Different trim levels.
- Different equipment packages.
- Incorrect legacy ranges.
- Duplicate or conflicting source data.

Overlap requires review before final publication where ambiguity exists.

---

## 12. Smart Dragon Search Integration

Existing system:

```text
https://smartdragonjo.com/search
```

Existing Firestore collection:

```text
cars
```

Approximate structure:

```json
{
  "car": "Toyota",
  "model": "Corolla",
  "year": "-",
  "url": "https://..."
}
```

Future flow:

```text
Customer selects Make → Model → Year
↓
Inventory resolves approved vehicle
↓
Search adapter checks existing cars collection by Make + Model
↓
If a matching URL exists:
"تعرف على الاكسسوارات المخصصة لسيارتك"
```

This integration is independent of AI recommendations.

---

## 13. Smart Dragon AI

Future integrations:

- Smart Dragon API
- Smart Dragon MCP
- smartdragonjo.com product catalogue

Correct flow:

```text
Approved vehicle
↓
Verified fitment data
↓
Safe vehicle context
↓
AI recommendation layer
↓
Store products
```

The AI must not invent fitment values.

---

## 14. Migration Safety Rules

During migration:

1. Never modify `data.csv`.
2. Keep `exports/data_clean.csv` as a derived review artifact only.
3. Do not auto-import:
   - `needs_review`
   - `conflict`
   - `duplicate_exact`
4. Do not automatically guess unknown years.
5. Do not automatically merge conflicting records.
6. Do not automatically normalize ambiguous screen descriptions.
7. Alias normalization (for example `HB3` → `9005`) should preserve aliases.
8. Keep source row references during migration for traceability.

---

## 15. Current Stage

Firebase is still disabled.

The next migration step is to create an import-preparation script that:

- Reads `exports/migration_preview.csv`.
- Selects `ready` records only.
- Preserves source row references.
- Converts legacy values into a structured JSON preview.
- Does not upload anything to Firebase.
- Produces reviewable local output before any database connection.

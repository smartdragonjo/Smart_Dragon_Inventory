# Dynamic Categories v4

The `categories` Firestore collection is now the schema source for fitment fields.

Each category document uses its slug as the document id and contains:

- `name`: Arabic/display name.
- `slug`: stable technical id.
- `active`: whether the category appears in admin vehicle forms and the public result UI.
- `fieldsDefinition`: array of field definitions.

Supported field types in this version:

- `text`: generic fitment text.
- `number`: numeric value, optionally with a unit.
- `bulb`: lamp/bulb code with the existing bulb parser.

The owner account automatically seeds the legacy categories when they do not exist:

- `lighting`
- `wipers`
- `screens`

Existing `vehicle_fitments` remain compatible. New category fitments are stored in the same collection using the existing document convention `<vehicleId>_<categorySlug>`.

Public search reads only active categories and renders their defined fields dynamically. Inactive categories stay in Firestore and existing fitment data is not deleted.

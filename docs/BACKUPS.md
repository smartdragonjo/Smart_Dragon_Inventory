# Local JSON backups

The Admin > Backups page exports the current `vehicles` and `vehicle_fitments` data as a local JSON file.

The exported root is an array compatible with `data/vehicles.json`. Each record preserves the Firestore vehicle document ID in `source.backupVehicleId`. The importer uses that ID when `source.type` is `firestore_backup`, so restoring the file updates the same vehicle documents instead of generating new legacy IDs.

## Restore later

1. Keep the downloaded backup file in a safe local location.
2. When restoration is required, rename/copy it to `data/vehicles.json` in the project.
3. Deploy that file.
4. Sign in as Owner and use **Import current data** from the dashboard.

This v9 backup covers vehicle records and fitment data only. Categories, users, review requests and audit logs are not included.

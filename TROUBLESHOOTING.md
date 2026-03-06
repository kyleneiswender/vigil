# Troubleshooting

## Stuck processes after Ctrl-C

If PocketBase or the Vite dev server keeps running after you close the
start script, run the cleanup script:

```
cleanup.bat           # Windows
./cleanup.sh          # macOS / Linux
```

This force-kills any lingering PocketBase and Vite/node processes
associated with this project. It targets PocketBase by image name and
Vite by port number (5173), so it will not affect unrelated Node
applications.

## Backing up the database

All vulnerability data, user accounts, scoring weights, and audit logs
are stored in `backend/pb_data/`. To create a timestamped backup:

```
backup.bat            # Windows
./backup.sh           # macOS / Linux
```

Backups are saved to `backups/pb_data_YYYY-MM-DD_HHMM/`. For a
consistent snapshot, stop PocketBase first. The script will warn you if
PocketBase is still running and ask for confirmation before proceeding.

## Resetting the database

> **Warning:** Deleting `backend/pb_data/` permanently removes **all**
> vulnerability records, user accounts, scoring weights, and audit logs.
> This action cannot be undone.

To reset to a clean state:

1. Stop the application (Ctrl-C in the start window, or run the
   cleanup script).
2. **Back up first:** run `backup.bat` or `./backup.sh`.
3. Delete the data folder: `backend/pb_data/`
4. Run `start.bat` or `./start.sh` — PocketBase will recreate the
   database and run migrations automatically.
5. Open `http://localhost:8090/_/` to create a new superadmin account.
6. Create an organization, then create user accounts and assign them to
   the organization (see the main README for details).

## Port already in use

If you see "address already in use" errors for port 8090 or 5173, a
previous instance may still be running. Run the cleanup script to kill
lingering processes, then try starting again.

## PocketBase migration errors

If PocketBase fails with migration errors after a version change, the
safest fix is:

1. Back up `backend/pb_data/` (run the backup script).
2. Delete `backend/pb_data/`.
3. Restart — PocketBase will rebuild the database from the migration
   files in `backend/pb_migrations/`.

Note: you will lose all existing data and will need to recreate your
admin and user accounts.

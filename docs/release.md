# Release and Recovery

## Compatibility

Passagen Web `0.3.x` requires Python 3.12 or newer, `passagen-core>=0.3,<0.4`, and the Passagen
Schema version accepted by Core. Startup stops before serving requests when the database Schema is
incompatible. Upgrade Core and run `passagen db init` through Passagen CLI before retrying.

Published wheels include the compiled React application. Building a release from source requires
Node.js `>=24 <25`, npm `>=11 <12`, and the frontend dependencies installed with
`npm --prefix frontend ci`; installing and running a published wheel does not require Node.js.

## Release Checklist

1. Run `make check` and `make check-e2e`.
2. Run `uv run pytest` in the adjacent `passagen-core` checkout.
3. Build with `uv build` and confirm the wheel contains `passagen_web/static/index.html` and its
   hashed assets.
4. Install the wheel into a clean environment and run
   `passagen-web serve --data-dir PATH --no-open`.
5. Verify deep links under `/papers` and `/collections`, PDF byte ranges, and all write workflows.
6. Confirm a foreign `Origin` receives `403` for a write request.
7. Record the supported Passagen package and database Schema versions in the release notes.

## Backup

Stop Passagen Web and Passagen CLI processes before taking a backup. Copy the entire data directory,
not only `passagen.db`, because artifact records refer to managed files beneath the same directory.
For example:

```bash
cp -a ~/passagen-data ~/backups/passagen-data-$(date +%Y%m%d-%H%M%S)
```

Confirm the backup contains `passagen.db` and the managed artifact directories before upgrading.

## Upgrade

1. Stop the running local service.
2. Take a complete data-directory backup.
3. Upgrade Passagen within its supported range and run `passagen db init --data-dir PATH` if its
   release notes require a migration.
4. Upgrade Passagen Web and start it against the same data directory.
5. Verify the Library, tags, collections, and one artifact from each supported type.

## Recovery

If startup reports an incompatible Schema, do not replace or edit the database through Passagen Web.
Use the matching Passagen release to complete the documented migration, or reinstall the previous
Passagen Web and Passagen versions.

If an upgrade or migration cannot be repaired, stop all Passagen processes, move the failed data
directory aside, and restore the complete backup to its original location. Never copy only an older
database over newer artifact directories.

The `.passagen-web.lock` file is advisory state. A stale file after a crash is harmless because the
operating-system lock is released when the process exits. Do not delete it to bypass an active lock.

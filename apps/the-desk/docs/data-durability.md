# Data collection, workspace saves, and recovery

The active data folder is shown in **Data & backups**, along with the exact source
checkout, the collection checkpoint, backup age, disk space and restore-test result.
Keep this folder private and out of Git. Local services must remain running and the
computer awake to collect observations and take scheduled backups.

Use the same explicit `--data-dir /absolute/path` (or `DESK_DATA_DIR`) when
switching checkouts if they should share the same workspace and research archive.
The data directory lock still allows only one server. QA fixtures use separate
temporary folders; the system does not silently migrate or combine branch data.

## Collection

One data-directory lock prevents two Desk servers from opening the same storage.
One Swing research collector owns the selected market. Opening charts and Lab tabs
does not create model calls. Desk state and research writers use WAL, FULL synchronous writes,
foreign-key checks and a bounded busy timeout.

Each observation commits its new closed source candles, tracker events, prior
forecast resolutions, new prediction, usage reservation and full tracker checkpoint
in one transaction. The paid model request starts only after that commit. The
returned response and final usage commit together in a second transaction. If a
write fails, the run stops before another request. An interrupted paid request has
unknown/pending cost; it is never assumed free or retried as another paid request.
Unique run/minute and run/sampling-slot constraints prevent duplicate samples.

`run_bars` retains all completed 1m source candles used in new runs, including the
full warmup. Each row records run, symbol, observation time, warmup status, original
OHLCV and content hash. Provider, quote times, tick and source cutoff remain in the
immutable prediction inputs. This is REST snapshot coverage, not a tick-complete
feed. Legacy migration copies only candles already present in retained observations
and ledger records; it does not invent missing history or forward outcomes.

Restart remains paused and presents the last committed tracker checkpoint as an
archived snapshot. A new observation run requires an explicit start. Gaps, revised
completed bars, config changes and old unfinished outcomes retain their boundaries.
The system does not synthesize observations during downtime.

## Chart and indicator saves

The browser uses one ordered save queue. Per-setting revisions reject an older tab
overwriting a newer layout. Acknowledgement follows the server transaction commit.
While the server is unavailable, the tab retains a local draft and retries with
backoff. Reload can recover that draft; an already-saved identical draft is cleared.
Conflicting drafts remain visible for review. **Save layout** explicitly saves the
reviewed current tab, including drawings and indicator settings. A browser workspace
mirror also retains the complete serialized chart layout, including Pine indicator
identity and settings. On reload, an in-flight tab queue remains authoritative; when
the server is empty after a new build, the mirror seeds it at revision zero. If the
server has a newer revision, it wins and replaces the stale mirror. Browser drafts
are a recovery aid, not a replacement for the server database or verified backups.

## Verified snapshots

Snapshots run at startup, every 15 minutes while the server is running, on clean
shutdown and from **Back up now**. The service uses SQLite's online backup API,
including committed WAL data. It checks SQLite integrity, foreign keys, known JSON
columns, row counts and SHA-256 file hashes. A snapshot is published by atomic rename
only after validation and fsync. Failed attempts never replace the last good copy.

Scope: `desk.sqlite3` (layouts, indicators, settings, paper ledger and agent records),
`swing-research.sqlite3` (source candles, observations, runs, usage and checkpoints),
`robinhood-workspace.sqlite3`, Spider JSON reports, and the Journal database when
the launcher supplies its path. Databases are independently consistent snapshots;
this is not a cross-database distributed transaction. Login keys, credentials,
process files, logs, provider rate-limit caches and preserved corrupt originals
are excluded. Reconnect broker accounts after recovering onto another installation.

Keep the latest eight snapshots, one per retained hour for 24 hours, one per day
for seven days, one per week for four weeks and the latest ten manual snapshots, within a 512 MiB target. Capacity rotation
keeps the newest two verified snapshots and the pre-rebuild baseline even if those
protected copies exceed the target; it removes older unprotected copies first.
Backups and manifests have private filesystem permissions. Preserved corrupt files
and offline pre-restore quarantines are never removed by retention.

Local backups protect against application/database corruption. They share the
disk's physical risk. Configure another-volume copy folder in the data screen, or
download snapshots for separate storage. A missing or changed destination is
reported; the service will not recreate a missing mounted-drive folder on the
system volume and falsely call it an external backup. Local backups continue.

## Test and restore

The UI's **Verify** rechecks checksums and database contents. **Test restore** creates
and validates a separate copy, then removes the test copy. Neither replaces live data.

From the app directory, first inspect and test a selected snapshot:

```sh
python3 -B storage_cli.py list
python3 -B storage_cli.py verify SNAPSHOT_ID
python3 -B storage_cli.py restore SNAPSHOT_ID --out /tmp/desk-restore-inspection
```

To install an affected database, stop the server first:

```sh
python3 -B launch.py --stop
python3 -B storage_cli.py install SNAPSHOT_ID --database swing-research.sqlite3
python3 -B launch.py --detach
```

The installer refuses a live data-directory lock, verifies the chosen backup,
stages the replacement, and preserves the previous database plus WAL/SHM files in
`data/recovery/before-restore-*`. Restoring rolls the selected database back to the
backup cutoff; newer records are not silently merged or manufactured. Select only
the affected database. Journal restoration is a separate offline operation using
its own application procedure; the Desk installer will not replace a live Journal.

For a recovery-drive source, add `--backup-root /Volumes/Drive/DeskBackups` before
the command. Restoring into a new folder works without changing the current data.

If startup integrity checks fail, normal collection/trading services do not start.
The loopback recovery page stays available at `/data-health.html`, showing available
snapshots. Stop that recovery server before using the offline installer.

## Focused validation

```sh
python3 -B -m unittest discover -s tests -p test_storage.py
python3 -B -m unittest discover -s tests -p 'test_swing*.py'
python3 -B -m unittest discover -s tests -p test_jev_costs.py
python3 -B -m unittest discover -s tests -p test_engine.py
node --test tests/test_durable_settings.mjs tests/test_workspace_mirror.mjs tests/test_swing_evidence.mjs
DESK_LAYOUT_BROWSER=1 node --test tests/test_chart_persistence_browser.mjs
```

Fault tests cover interrupted transactions, no billing before durable reservation,
atomic response/usage writes, restart hydration, WAL-aware backups, failed snapshot
publication, damaged backups, stale workspace saves, unavailable copy destinations,
offline installation and a real restore of saved records.

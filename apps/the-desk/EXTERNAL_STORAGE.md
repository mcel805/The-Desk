# Desk external storage

The Desk and its related research files use `/Volumes/SAMSUNG USB/Mark-External-Storage`.
The managed budget is 200,000,000,000 bytes (200 GB). The rest of the USB is available for other uses.

The verified migration relocated 613,722,874 bytes across the Desk, Lux Journal,
research outputs, archives, evidence folders, and 200 existing chart PNGs.
The receipts in this folder record the original paths and database row counts.
Original paths remain usable through symbolic links; application source and small
storage-control files remain on the Mac. Other apps' Codex chat history was not moved.

## Everyday use

Open [Data & Backups](http://127.0.0.1:18880/data-health.html) to see the active drive.
The Desk's normal launcher now enforces the storage policy:

```sh
python3 -B '/Users/markceleste/Documents/ChatGPT/The Trader - a trading company/apps/the-desk/launch.py' --detach
```

When the USB is missing, the Desk stops its database services and shows a connection
error. Choose **Continue with temporary local storage** to use a separate workspace.
External history is unavailable in that workspace. Paid research and agents do not
resume automatically after a restart.

After reconnecting, choose **Save temporary work & return to USB** in the storage
banner. The temporary dataset is copied and hash-verified under
`offline-sessions/<session>/` before its local copy is removed. Main and temporary
SQLite histories are preserved separately; they are never overwritten or merged.
The banner reports preserved offline workspaces and their paths.

macOS screenshots first enter the small local `Capture-Inbox` in the Desk's
`.storage-control` folder. While the storage supervisor runs, completed captures
are copied, verified, and removed from the inbox into `live/captures/macOS` on the
USB. The inbox remains writable while the drive is absent. Existing research PNG
paths link to `live/captures/research-root`.

The policy is persistent whenever the Desk is launched. Automatic login startup
is not installed: macOS denied the background login service access to Documents,
so that unsuccessful entry was removed. After a reboot, start the Desk normally.

## Data and verification

- `live/desk`: settings, research, fills, chat records, backups, and Desk-owned LLM logs.
- `live/journal`: existing Lux Journal database and attachments.
- Other `live/research-*` folders: migrated research archives, charts, and evidence.
- `offline-sessions`: complete preserved temporary workspaces.
- `migration-receipt-20261025.json` and `research-migration-receipt-20261025.json`: verified migration receipts.

The volume must be mounted and carry its configured identity marker. The supervisor
does not create substitute directories under `/Volumes` when it is missing.
It monitors the storage budget and checks capacity before copying captures or
archiving temporary work. Collection guards stop new research when storage is unavailable.
Verified backup copies on the same USB share that drive's physical failure risk.

Authentication and shared Codex runtime metadata remain in their existing local locations. No Codex authentication or
configuration files were linked onto the USB. Desk analyst processes use separate
log destinations and non-persisted internal threads; durable Spider chat
events are saved in `live/desk/spider/chat-events` and included in verified snapshots.
These runtime settings are documented in the
[official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

The Mac may still use local storage for application code, credentials, operating
system caches, browser downloads, and the explicitly selected temporary workspace.
Browser downloads retain the browser's own destination setting.

## UI regression check

The healthy-drive status sits inside the existing header; disconnected/temporary
notices float outside the page grid. `tests/verify_storage_notice_browser.js`
executes all three storage states on the local trading page and verifies chart
height, header/account alignment, and viewport-contained footer without writing
settings or switching the real storage mode. HTTP fixtures explicitly mark their
isolated server children as managed so they cannot route through the production
storage supervisor.

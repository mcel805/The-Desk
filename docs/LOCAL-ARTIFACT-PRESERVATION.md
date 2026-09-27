# Local artifact preservation and Git baseline

This note documents the initial Trading Research repo boundary for the Digital Company buildout.

## Kept on disk, excluded from Git for now

- `tmp/`: mixed helper scripts, build inputs, logs, and rendered material; needs item-by-item curation before any part is versioned.
- `output/`: reports, PDFs, chart packages, and generated analysis; retained as local outputs until their source/provenance and intended retention are reviewed.
- `research/`: includes broker-reconciliation material, chart inputs, and derived research; retained locally pending a separate data-rights, sensitivity, and retention review.
- `dashboard/data/`, chart PNGs under `dashboard/assets/`, and `indicators/**/validation/`: local session/chart inputs and generated validation evidence; retained pending curation.
- `indicators/**/releases/`: historical release snapshots and validation artifacts; retained locally to avoid an unreviewed bulk import into the first baseline.
- `.lavish/`: review-session HTML and local review state.
- `.env` files, SQLite/database files, logs, and operating-system metadata.

Nothing in those locations was deleted or moved by this baseline. Some excluded files may contain sensitive or user-specific records; inspect before sharing or copying. The root ignore rules are not a backup policy.

## Baseline posture

The repository currently has no commits and no remote. The first commit should contain reusable source, role instructions, and product/method documentation only. Review staged paths and the ignore rules before committing; keep excluded research and generated artifacts local until their inclusion is deliberate.

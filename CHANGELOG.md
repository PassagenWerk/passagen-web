# Changelog

All notable changes to Passagen Web are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Idempotent single-tag assignment endpoints `PUT/DELETE /api/papers/{paper_id}/tags/{tag_id}`
  returning the updated paper; the full-replacement `PUT /api/papers/{paper_id}/tags` remains for
  batch callers.
- Multi-tag library filtering through repeated `tag` query parameters with
  `tag_match=all|any` on `GET /api/papers`; `GET /api/tags` now reports each tag's `paper_count`
  from a single aggregate query.
- `/tags` workspace for searching, creating, renaming, recoloring, and deleting Library Tags with
  per-tag usage counts and a delete confirmation that states the affected papers.
- In-context tag picker on the sticky reading toolbar (`Tags N`): search, instant assign/remove
  with retryable failure states, and "Create and assign" for new tags without leaving the reading
  position.

### Changed

- The Find panel replaces the single-tag select and the embedded per-row tag manager with a
  searchable multi-select tag filter that keeps the selected tags and match mode in the URL.
- `Edit Library Data` was renamed to `Edit Metadata` and no longer edits tag assignments.

## [0.3.0] - 2026-09-04

### Added

- Processing runs API (`POST/GET /api/processing-runs`, run detail and progress event polling)
  backed by the Core `ProcessingService` and an in-process single-worker runner with persisted
  state; active runs are marked `interrupted` on restart instead of showing as running forever.
- PDF import endpoint `POST /api/papers/import` accepting multipart multi-file uploads with
  content-addressed deduplication and per-file failure reasons.
- `Processing` workspace in the React app (PDF upload, pending/failed paper views, batch process
  and retry, recent runs, run detail with progress log), plus per-paper
  Process/Continue/Reprocess actions on the paper page.
- `passagen-web serve --config` escape hatch; the server loads the same
  `<data-dir>/passagen.yaml` as the CLI via Core `load_settings()` and logs the config path in
  use at startup.

### Changed

- Reprocess choices now state every affected stage and support rebuilding only the Outline;
  completed papers keep these controls collapsed by default in the Library reader, while the
  Processing workspace explains each stage, its rebuild scope, and LLM usage.

## [0.2.0] - 2026-09-04

### Changed

- Replaced the `passagen-cli` implementation dependency with the shared `passagen-core` package.

## [0.1.1] - 2026-09-03

### Fixed

- CI build jobs now install `ca-certificates` before downloading the uv
  installer, fixing release builds on runners using internal TLS.

## [0.1.0] - 2026-09-03

### Added

- Local paper library browsing, search, filtering, sorting, and pagination.
- Structured summary and outline reading with evidence-linked PDF navigation.
- Editable paper metadata, library tags, and ordered paper collections.
- Responsive React interface served by the local FastAPI process.
- Browser launch control, origin protection, instance locking, and structured logs.
- Self-contained wheels with compiled frontend assets and release verification.

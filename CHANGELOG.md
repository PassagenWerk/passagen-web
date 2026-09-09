# Changelog

All notable changes to Passagen Web are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-09-10

Requires `passagen-core` `0.7.x` and Passagen Schema version 10.

### Added

- Added a multi-stage Docker image and Compose service for Passagen Web. The image contains the
  compiled frontend and Python runtime, exposes only port 8765, mounts the initialized library at
  `/data`, and receives the LLM key, bind address, browser origin, and volume ownership through
  local environment configuration.
- Added URL-driven full-width focus modes for Collection Ask and Research Document reading, with
  responsive document selection and directional transitions between research layers.
- Added deletion for completed and failed Research Documents, including confirmation, automatic
  selection of the next document, and cleanup through the Core service.

### Changed

- Reworked Collections into a dedicated Research Desk with full-width synthesis and document
  workspaces, a collapsible paper rail, and focused long-form reading layouts on desktop/mobile.
- Research Document titles are now generated from document content instead of remaining fixed to
  the report kind and collection name.

## [0.6.0] - 2026-09-09

Requires `passagen-core` `0.6.x` and Passagen Schema version 10.

### Added

- Added a collection research workspace with `Synthesis`, `Reports`, and `Ask` tabs alongside the
  existing Papers tab. Synthesis shows the latest citation-checked collection overview with
  generated or reused provenance, generation strategy, stale and partial-coverage badges, and a
  polling generate/regenerate flow with an explicit partial opt-in.
- Added collection reports for review, comparison, research gaps, and custom prompts, including a
  persistent history, queued/running/failed/interrupted states, detail views, coverage
  information, and citation navigation.
- Added collection-scoped Ask conversations using the existing chat and saved-answer workflow.
  Answers show the papers selected for retrieval, and citations navigate to the cited paper or
  exact PDF page inside the collection.
- Added paper Ask conversations with create/rename/delete, asynchronous question turns
  (`202` + polling), pending/failed/retry states, source badges, citation chips that navigate to
  Summary, Outline, or an exact PDF page, optimistic question rendering, and aggregate generation
  run and token usage.
- Added a structured answer archive with titles, tags, saved-answer search, question reuse,
  unarchive, and full structured JSON export.
- Added generated/reused and stale provenance to answers, distinct `Reused` and `Stale` badges,
  and an explicit fresh-answer action. Saved answers also display current stale state and reasons.
- Added collection synthesis and report APIs with asynchronous submission, polling, history,
  detail views, and reuse responses, plus scope-aware conversation and QA-record APIs carrying
  collection IDs, citation paper IDs, and selected retrieval papers.

### Fixed

- Archiving an answer now invalidates the Saved-search cache, and the Ask workspace has explicit
  narrow-screen layout rules for conversation controls and the composer.

### Changed

- Answer, synthesis, and report runs now share the Core generation dispatcher, so they use the
  same claim, execution, and startup-recovery semantics; leftover queued or running products are
  interrupted consistently instead of appearing to run forever.
- Reworked paper reading as a three-pane model that displays at most two panes: Reader alone,
  Reader with Ask, Reader with PDF, or Ask with PDF. Ask now opens beside the active Summary,
  Outline, or Note; opening cited PDF evidence shifts Ask left without losing conversation state.
- Added a Paper launch control beside Ask in the main Reader toolbar, restored companion-pane
  transition animations, and collapse structured Summary content to one column whenever either
  Ask or PDF occupies the second pane.
- Removed the focused-reader top padding gap above the sticky artifact toolbar, and added a
  one-step `Paper only` action that closes Ask and PDF while retaining focused single-pane reading.
- Redesigned Ask around a lazy new-conversation draft, a compact History settings popover,
  independently scrolling messages and saved answers, a grounded-answer welcome state, and a
  fixed composer. Previous conversations are no longer selected by default or exposed as a
  permanent toolbar row.

## [0.5.0] - 2026-09-05

Requires `passagen-core` `0.5.x` and Passagen Schema version 4.

### Added

- Author abstracts in the shared paper contract and reader, displayed separately before generated
  Summary and Outline content.
- Validated cleaned abstracts as the primary Reader column alongside the retained original
  extraction, with a stacked mobile layout and automatic fallback when no current artifact exists.

### Changed

- Moved Author Abstract above the Summary/Outline tabs as a collapsible single-column reader with
  Cleaned/Original switching, and condensed metadata editing and reprocessing into header popovers.
- Added a global Header indicator for active and idle processing tasks.
- Exposed non-blocking Abstract clean as a selectable processing stage between Full text and
  Summary, with clearer rebuild scope and LLM usage guidance.
- Replaced the paper Reader's general Reprocess dropdown with contextual reset controls for
  Metadata, Abstract clean, Summary, and Outline, each with an explicit rebuild confirmation.
- Made the independent Abstract clean reset preserve existing Summary and Outline artifacts.
- Reorganized documentation around user startup, network serving, shared configuration, developer
  architecture, completed versus planned capabilities, and forge-neutral cross-repository
  links.

## [0.4.0] - 2026-09-05

Requires `passagen-core` `0.4.x` and Passagen Schema version 3.

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

### Fixed

- The listen-port preflight now sets `SO_REUSEADDR` like the actual server socket, so restarting
  the server (for example between e2e runs) no longer fails with a false "port is already in use"
  while sockets from the previous run are still in `TIME_WAIT`.

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

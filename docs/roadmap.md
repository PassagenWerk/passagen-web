# Passagen Web Development Roadmap

This document defines the implementation plan for a local web interface over the paper library
managed by Passagen. It covers repository boundaries, technical choices, milestones, acceptance
criteria, and deferred work.

## Product Goal

The first usable release should complete this workflow:

```text
Open local library
  -> search, filter, and sort papers
  -> inspect metadata, summary, and outline
  -> open the managed PDF at a relevant page
  -> add or edit tags
  -> select papers into an ordered collection
```

The first release is a local, single-user application. It does not provide user accounts, remote
hosting, collaborative editing, PDF annotation, vector search, or collection synthesis.

## Repository Boundary

Passagen and Passagen Web remain separate repositories with different responsibilities.

| Repository | Responsibility |
| --- | --- |
| `Passagen` | Domain models, SQLite schema and migrations, repositories, catalog application services, artifact validation, pipeline, and CLI |
| `Passagen-web` | FastAPI adapter, HTTP schemas, PDF streaming, React UI, local server lifecycle, and browser-facing tests |

The dependency direction is one way:

```text
passagen_web -> passagen public API -> storage and artifacts
```

Passagen must not import `passagen_web`. Passagen Web must not copy SQLAlchemy rows, execute ad-hoc
SQL against `passagen.db`, or infer artifact paths by scanning the data directory.

Tags and collections are durable paper-library concepts used by future CLI and synthesis flows.
Their tables, migrations, invariants, and application services therefore belong to Passagen. Pure
UI preferences such as theme and panel width stay in browser storage.

## Technical Baseline

- Python 3.12+
- `uv` for Python dependency and environment management
- FastAPI and Uvicorn for the local HTTP application
- Pydantic for request and response schemas
- React, TypeScript, and Vite for the frontend
- A lightweight client-side router and query cache selected during M1
- Browser-native PDF viewing initially, with PDF.js introduced when reliable page linking requires it
- pytest for backend tests
- Vitest and Testing Library for frontend tests
- Playwright for a small set of end-to-end workflows
- Ruff, basedpyright, and mypy for Python checks
- ESLint and TypeScript for frontend checks

The production application serves the compiled React assets and API from one Uvicorn process. The
default listener is `127.0.0.1`; exposing the service to a LAN is outside the first release.

## Target Repository Layout

```text
Passagen-web/
├── pyproject.toml
├── uv.lock
├── README.md
├── docs/
│   ├── architecture.md
│   └── roadmap.md
├── src/
│   └── passagen_web/
│       ├── __init__.py
│       ├── app.py
│       ├── cli.py
│       ├── config.py
│       ├── dependencies.py
│       ├── api/
│       │   ├── papers.py
│       │   ├── tags.py
│       │   ├── collections.py
│       │   └── artifacts.py
│       ├── schemas/
│       │   ├── papers.py
│       │   ├── tags.py
│       │   └── collections.py
│       └── static/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/
│       ├── components/
│       ├── features/
│       │   ├── papers/
│       │   ├── tags/
│       │   ├── collections/
│       │   └── reader/
│       ├── routes/
│       └── main.tsx
└── tests/
    ├── api/
    ├── integration/
    └── e2e/
```

The Python distribution is named `passagen-web` and the import package is `passagen_web`. The CLI
entry point is `passagen-web`.

## Data Contracts

The existing Passagen database is the source of truth for paper identity, metadata, status, import
time, and artifact references. The Web API resolves artifacts through Passagen services and never
returns local filesystem paths to the browser.

Passagen needs durable models equivalent to:

```text
tags
- id
- name
- normalized_name
- color
- created_at

paper_tags
- paper_id
- tag_id
- created_at

collections
- id
- name
- description
- created_at
- updated_at

collection_papers
- collection_id
- paper_id
- position
- note
- added_at
```

Required invariants:

- Tag normalized names are unique.
- A tag can be assigned to a paper only once.
- A paper can occur in a collection only once.
- Collection positions are deterministic and can be reordered atomically.
- Deleting a paper removes its tag assignments and collection memberships.
- Deleting a collection never deletes papers.
- User-edited bibliographic fields retain source `user` when the Passagen pipeline is rerun.
- Generated summary and outline artifacts remain immutable from the Web UI.

## HTTP Contract

The initial API is rooted at `/api` and includes:

```text
GET    /api/health
GET    /api/papers
GET    /api/papers/{paper_id}
GET    /api/papers/{paper_id}/summary
GET    /api/papers/{paper_id}/outline
GET    /api/papers/{paper_id}/pdf
PATCH  /api/papers/{paper_id}/metadata
PUT    /api/papers/{paper_id}/tags

GET    /api/tags
POST   /api/tags
PATCH  /api/tags/{tag_id}
DELETE /api/tags/{tag_id}

GET    /api/collections
POST   /api/collections
GET    /api/collections/{collection_id}
PATCH  /api/collections/{collection_id}
DELETE /api/collections/{collection_id}
POST   /api/collections/{collection_id}/papers
PATCH  /api/collections/{collection_id}/papers/order
DELETE /api/collections/{collection_id}/papers/{paper_id}
```

Paper listing supports query text, status, tag, venue, year, collection, sort field, sort direction,
and pagination. List responses contain metadata and artifact availability flags but not full summary
or outline content.

HTTP schemas are owned by Passagen Web and are distinct from Passagen storage records. This keeps
filesystem paths and storage implementation details out of the public response contract.

## M0: Project Foundation

### Work

- Configure the Python project, `src/passagen_web` package, and CLI entry point.
- Add FastAPI, Uvicorn, Pydantic, test, lint, and type-check dependencies.
- Add the Vite React and TypeScript frontend.
- Configure Vite to proxy `/api` to the development FastAPI server.
- Add shared check commands and CI for Python and frontend code.
- Document local development commands and the two-repository checkout requirement.

### Deliverables

- `uv run passagen-web --help`
- `uv run passagen-web serve --data-dir PATH`
- FastAPI `/api/health` endpoint
- React application shell
- Automated lint, type-check, unit-test, and build jobs

### Acceptance Criteria

- A clean checkout can install both Python and frontend dependencies using documented commands.
- The development server loads the React application and proxies health requests successfully.
- The command rejects a missing or invalid Passagen data directory with a concise error.
- The server listens only on `127.0.0.1` unless explicitly configured otherwise.
- Python and frontend checks run without requiring external services.

## M1: Passagen Catalog Contract

This milestone is implemented primarily in the Passagen repository and blocks writable Web
features.

### Work

- Add a public `passagen.catalog` application-service boundary.
- Add typed paper filters, sort options, pagination results, and detail projections.
- Add forward migrations and storage models for tags and collections.
- Add services for tag lifecycle, paper tag assignment, collection lifecycle, membership, and order.
- Add a user metadata update service that records field source `user` and preserves overrides during
  subsequent pipeline updates.
- Add safe artifact resolution that verifies relative paths remain under `data_dir`.
- Define the supported Passagen package and database schema compatibility range.

### Deliverables

- Public `CatalogService` or equivalent facade
- Tag and collection migration
- Catalog unit and SQLite integration tests
- Passagen package version consumable by Passagen Web

### Acceptance Criteria

- Passagen Web can implement all catalog operations without importing ORM rows or opening a Session.
- Duplicate tags and memberships fail with typed, user-facing domain errors.
- Collection reorder commits atomically and rejects unknown or duplicate member IDs.
- Forced metadata processing does not overwrite fields whose source is `user`.
- Artifact resolution rejects absolute paths, path traversal, and missing files.
- Existing Passagen databases upgrade without losing papers or artifacts.

## M2: Read-Only Paper API

### Work

- Construct one catalog dependency from configured `database_path` and `data_dir`.
- Implement health, paper list, paper detail, summary, and outline endpoints.
- Validate structured summary JSON with the Passagen summary schema before returning it.
- Render outline Markdown in the browser rather than converting it to trusted HTML on the server.
- Map not-found, invalid-artifact, incompatible-schema, and database-busy failures to stable errors.
- Add pagination and deterministic sorting.

### Deliverables

- Read-only `/api/papers` endpoints
- OpenAPI schema
- API component tests against a temporary Passagen library

### Acceptance Criteria

- Papers can be filtered by title query, venue, year, status, tag, and collection.
- Papers can be sorted by title, venue, year, import time, and update time.
- A list request does not read every summary or outline artifact.
- Missing artifacts produce an availability state or a stable 404 response, not a traceback.
- API responses never contain absolute or relative local artifact paths.
- Unsupported database versions fail during startup with an actionable message.

## M3: Library Browsing UI

### Work

- Build responsive paper list and paper detail routes.
- Add text search, filters, sort controls, and pagination or incremental loading.
- Persist search, filter, sort, and selected paper state in the URL.
- Present metadata, processing state, tags, and artifact availability.
- Add Summary and Outline readers with loading, empty, and invalid-artifact states.
- Use a three-pane desktop layout and separate list/detail navigation on narrow screens.
- Add keyboard navigation for moving through the visible paper list.

### Deliverables

- Searchable paper library screen
- Paper detail screen
- Structured Summary reader
- Markdown Outline reader
- Responsive desktop and mobile layouts

### Acceptance Criteria

- A user can find a paper by title and narrow results by venue, year, status, or tag.
- Browser refresh and back/forward navigation preserve the current library view.
- Selecting a paper shows Summary first and allows switching to Outline.
- Missing Summary or Outline is explained using the paper processing status.
- The principal browsing workflow is usable by keyboard.
- The page loads correctly at supported desktop and mobile widths.

## M4: PDF Reading

### Work

- Add a PDF endpoint resolved from the `original_pdf` artifact.
- Implement `Content-Type`, inline disposition, content length, cache validators, and byte ranges.
- Start with a browser-native embedded or new-tab reader.
- Evaluate PDF.js for consistent embedded reading and direct page navigation.
- Link summary and outline evidence page references to the PDF reader.
- Handle missing, replaced, or integrity-invalid PDF artifacts explicitly.

### Deliverables

- `/api/papers/{paper_id}/pdf` with Range support
- PDF reader route
- Evidence-page links

### Acceptance Criteria

- Large PDFs start rendering without being loaded completely into API memory.
- Refreshing or seeking in a PDF works through HTTP Range requests.
- A crafted paper ID or URL cannot read files outside the configured data directory.
- Selecting an evidence page opens the same paper near the requested page.
- Missing and corrupt PDFs produce a readable application error.

## M5: Tags and User Metadata

### Work

- Implement tag list, create, rename, recolor, delete, and assignment endpoints.
- Add an inline tag editor to paper details and multi-select tag assignment to the paper list.
- Add optional editing for approved bibliographic fields such as title, venue, and year.
- Use `updated_at` or an explicit revision as an optimistic concurrency token.
- Show pending, saved, conflict, and failed states without optimistic data loss.
- Confirm destructive tag deletion when it affects existing papers.

### Deliverables

- Tag management UI
- Inline paper tag editing
- Controlled user metadata editor
- Concurrency conflict handling

### Acceptance Criteria

- Creating tags that differ only by normalization does not create duplicates.
- Tag edits remain after restarting both Passagen Web and Passagen CLI.
- Metadata edits are marked with source `user` and survive a Passagen metadata refresh.
- Concurrent changes receive a conflict response instead of silently overwriting newer data.
- Failed writes restore or clearly mark unsaved frontend state.

## M6: Paper Collections

### Work

- Implement collection create, rename, description edit, and delete endpoints.
- Add single-paper and multi-select actions for adding papers to a collection.
- Add collection detail with deterministic manual ordering and paper removal.
- Persist collection order in one atomic request after drag, keyboard, or button reordering.
- Add optional per-membership notes if they are required by the synthesis workflow.
- Make collection filters available from the main library screen.

### Deliverables

- Collection navigation and management UI
- Multi-select paper organization workflow
- Ordered collection detail screen

### Acceptance Criteria

- A user can create a collection and add selected papers from filtered search results.
- Adding the same paper twice is idempotent or returns a clear domain error.
- Reordering survives restart and cannot leave duplicate or missing positions.
- Removing a paper from a collection does not delete the paper or its artifacts.
- Collection membership can be used as a paper-list filter.

## M7: Local Distribution and Release Quality

### Work

- Build the React application into packaged Python static assets.
- Serve the SPA and API from one process with correct fallback routing.
- Add automatic browser opening with an opt-out flag.
- Detect port conflicts and avoid starting duplicate servers for the same data directory.
- Add origin or startup-token protection for local write endpoints.
- Add structured logs without exposing paper content or local secrets by default.
- Add end-to-end tests for browse, read, tag, and collection workflows.
- Document installation, upgrade, backup, compatibility, and recovery procedures.

### Deliverables

- Installable `passagen-web` Python package
- Single-command local startup
- Version compatibility checks
- Release checklist and user documentation

### Acceptance Criteria

- `uv tool install` or the documented equivalent installs a runnable application.
- One command starts the API, serves the UI, and optionally opens the browser.
- Production startup does not require Node.js or a frontend development server.
- Another website cannot perform unauthenticated write requests to the local application.
- Core end-to-end workflows pass against a temporary real SQLite database and fixture artifacts.
- Upgrade instructions preserve Passagen papers, tags, and collections.

## M8: Collection Synthesis

This milestone is deliberately deferred until collection organization is stable. The synthesis
pipeline belongs to Passagen; Passagen Web provides configuration, progress, and result views.

### Proposed Work

- Define synthesis runs and synthesis artifact schemas in Passagen.
- Snapshot collection membership, order, paper summary artifact hashes, prompt version, and model at
  run creation.
- Execute synthesis outside the HTTP request lifecycle and persist progress.
- Show generated narrative, provenance, failures, and historical runs in Passagen Web.
- Allow reruns without mutating previous synthesis artifacts.

### Proposed Acceptance Criteria

- A historical synthesis remains reproducible after collection membership changes.
- Regenerated paper summaries do not silently change the inputs of an existing run.
- Each narrative section can identify its contributing papers.
- Browser disconnection does not cancel or lose a running synthesis job.

## Search Evolution

The first implementation uses indexed SQL filters and case-insensitive title matching. This is
appropriate for a local library of hundreds or a few thousand papers.

SQLite FTS5 should be added only after measuring a real need. Its index may include title, authors,
venue, selected structured-summary fields, and outline text. The FTS index is derived data and must
be rebuildable from canonical metadata and artifacts. Vector search remains out of scope until a
separate retrieval use case and embedding lifecycle are defined.

## Security Requirements

- Listen on loopback by default.
- Do not expose arbitrary filesystem endpoints.
- Resolve every artifact through a paper and artifact kind known to Passagen.
- Verify resolved paths remain inside `data_dir` before opening them.
- Use parameterized application services rather than route-level SQL.
- Protect write requests from cross-origin attacks even on localhost.
- Escape user metadata and sanitize rendered Markdown; do not enable raw HTML by default.
- Never place API keys, provider credentials, or full Passagen configuration in browser responses.
- Return concise errors to the browser and keep sensitive diagnostics in local logs.

## Testing Strategy

| Layer | Coverage |
| --- | --- |
| Passagen unit | Catalog invariants, normalization, ordering, user metadata precedence |
| Passagen integration | Migrations, SQLite transactions, artifact path safety |
| Web API | HTTP validation, response schemas, errors, Range requests, write conflicts |
| Frontend unit | Filter state, tag editor, collection actions, readers |
| End-to-end | Browse, search, read Summary/Outline/PDF, edit tags, organize a collection |

Tests use temporary databases and generated fixture artifacts. They must not read or modify a
developer's real `data/` directory or call external metadata and LLM services.

## First Release Definition

The first release is complete when M0 through M7 are accepted and a user can reliably:

- Start Passagen Web against an existing Passagen data directory.
- Browse papers without exposing storage implementation details.
- Search, filter, sort, and navigate the library.
- Read validated Summary and Outline artifacts.
- Open the managed PDF and follow evidence-page links.
- Create and edit tags with durable storage.
- Create ordered paper collections and manage their membership.
- Restart or upgrade the application without losing user organization data.

M8 collection synthesis is a subsequent release and is not required for the initial browsing and
organization product.

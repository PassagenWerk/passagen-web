# Passagen Web

Passagen Web is a local web interface for browsing and organizing papers managed by
[Passagen](../Passagen). It provides paper search and filtering, structured summary and outline
reading, inline user metadata editing, PDF reading, tags, and ordered paper collections.

The application is designed as a local single-user service:

```text
Browser -> Passagen Web API -> Passagen application services -> SQLite and artifacts
```

Passagen remains responsible for the database schema, migrations, paper processing, and artifact
semantics. This repository owns the HTTP API, browser UI, and local server lifecycle.

The M0 project foundation is in place. See [`docs/roadmap.md`](docs/roadmap.md) for scope and
milestones, and [`docs/architecture.md`](docs/architecture.md) for repository boundaries.

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js `>=24 <25` and npm `>=11 <12`
- A Passagen checkout alongside this repository and an initialized Passagen data directory

The expected development checkout is:

```text
Passagen/
├── passagen-cli/
└── passagen-web/
```

M0 does not import Passagen internals. The adjacent checkout becomes a package dependency when the
public `passagen.catalog` service planned in M1 is available.

## Setup

```bash
uv sync
npm --prefix frontend ci
uv run pre-commit install
```

The frontend declares the same runtime range in `frontend/package.json`. npm strict engine checking
rejects unsupported Node.js or npm versions during dependency installation.

The pre-commit configuration installs both `pre-commit` and `pre-push` hooks by default. Commit
hooks format and lint changed code; push hooks run basedpyright, mypy, Python tests, and the complete
frontend check when their respective files changed. Re-run the install command after cloning the
repository or recreating `.git`.

## Development

Start the API against a data directory containing `passagen.db`:

```bash
uv run passagen-web serve --data-dir ../passagen-cli/data
```

In a second terminal, start Vite:

```bash
npm --prefix frontend run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the FastAPI process. API documentation is at
`http://127.0.0.1:8765/api/docs`.

The listen address defaults to `127.0.0.1`. Passing `--host` is an explicit opt-in to another
interface.

## Checks

Run all checks with `make check`, or run each side independently:

```bash
make check-python
make check-frontend
```

Frontend production assets are written to `src/passagen_web/static` by
`npm --prefix frontend run build`. Serving those assets from the Python package is planned for M7.

GitLab CI runs equivalent Python and frontend lint, test, and build jobs from
`.gitlab-ci.yml`. Test results and Python coverage are published through GitLab reports.

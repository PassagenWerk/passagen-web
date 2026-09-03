# Architecture

Passagen Web is a local browser adapter over the public Passagen application API. Dependencies flow
in one direction:

```text
React UI -> /api schemas -> FastAPI routes -> passagen.catalog -> storage and artifacts
```

## Repository Boundary

Passagen owns durable domain concepts, migrations, transactions, artifact validation, and catalog
services. Passagen Web owns browser-facing schemas, HTTP behavior, PDF streaming, frontend state,
and the local server lifecycle.

The Web application must not import Passagen ORM models, open its SQLite database directly, scan the
data directory for artifacts, or return filesystem paths. The adjacent Passagen checkout provides
the `passagen.catalog` boundary used by read and write milestones.

## Runtime

`passagen-web serve` creates immutable runtime settings and validates the library before Uvicorn is
started. FastAPI dependencies read these settings from application state. Development runs Vite on
`127.0.0.1:5173`, proxying `/api` to FastAPI on `127.0.0.1:8765`.

Production static asset packaging and SPA fallback routing are deferred to M7. This avoids coupling
the development foundation to a provisional distribution design.

## HTTP Boundary

All API routes live under `/api`. Pydantic response models are defined in `passagen_web.schemas` and
remain independent of Passagen storage records. Stable domain-error mapping will be added alongside
the read-only catalog endpoints in M2.

## Frontend Boundary

Feature code is organized by domain as it is introduced. TanStack Query owns server state and React
Router owns URL navigation; local visual preferences remain browser state. API calls are isolated in
`frontend/src/api` so generated or hand-written contracts can evolve without leaking fetch behavior
into components.

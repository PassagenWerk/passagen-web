# syntax=docker/dockerfile:1

# Build from the passagen-web repository root:
#   docker build --build-context passagen-core=../passagen-core -t passagen-web:local .

FROM node:24-bookworm-slim AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend ./frontend
RUN mkdir -p src/passagen_web && npm --prefix frontend run build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS python-build
WORKDIR /src
COPY --from=passagen-core pyproject.toml uv.lock README.md LICENSE ./passagen-core/
COPY --from=passagen-core src ./passagen-core/src
COPY pyproject.toml uv.lock README.md LICENSE hatch_build.py ./passagen-web/
COPY src ./passagen-web/src
COPY --from=frontend /src/src/passagen_web/static ./passagen-web/src/passagen_web/static

WORKDIR /src/passagen-web
ENV UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv
RUN mkdir -p /app && uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim-bookworm AS runtime
ARG APP_UID=1000
ARG APP_GID=1000
RUN groupadd --system --gid "${APP_GID}" passagen \
    && useradd --system --uid "${APP_UID}" --gid "${APP_GID}" \
      --create-home --shell /usr/sbin/nologin passagen
WORKDIR /app
COPY --from=python-build --chown=passagen:passagen /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
USER passagen
EXPOSE 8765
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=3)"
ENTRYPOINT [
  "passagen-web", "serve",
  "--data-dir", "/data",
  "--host", "0.0.0.0",
  "--port", "8765",
  "--no-open"
]
CMD []

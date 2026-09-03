.PHONY: check check-python check-frontend dev-api dev-frontend

check: check-python check-frontend

check-python:
	uv run ruff check .
	uv run ruff format --check .
	uv run basedpyright
	uv run mypy
	uv run pytest

check-frontend:
	npm --prefix frontend run check

check-e2e:
	npm --prefix frontend run test:e2e

dev-api:
	uv run passagen-web serve --data-dir "$(DATA_DIR)"

dev-frontend:
	npm --prefix frontend run dev

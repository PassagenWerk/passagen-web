# Changelog

All notable changes to Passagen Web are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

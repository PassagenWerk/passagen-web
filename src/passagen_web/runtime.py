from __future__ import annotations

import errno
import fcntl
import json
import logging
import os
import socket
from pathlib import Path
from types import TracebackType
from typing import Self, TextIO

from passagen_web.config import ConfigurationError


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
        }
        keys = ("host", "port", "method", "path", "status_code", "error_code", "run_id", "config")
        for key in keys:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, separators=(",", ":"))


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


class LibraryLock:
    def __init__(self, data_dir: Path, *, host: str, port: int) -> None:
        self.path = data_dir / ".passagen-web.lock"
        self.host = host
        self.port = port
        self._file: TextIO | None = None

    def __enter__(self) -> Self:
        lock_file = self.path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            lock_file.seek(0)
            owner = lock_file.read().strip()
            lock_file.close()
            detail = f" ({owner})" if owner else ""
            raise ConfigurationError(
                f"Passagen Web is already using this data directory{detail}"
            ) from exc
        lock_file.seek(0)
        lock_file.truncate()
        lock_file.write(f"pid={os.getpid()} host={self.host} port={self.port}")
        lock_file.flush()
        self._file = lock_file
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._file is None:
            return
        fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
        self._file.close()
        self._file = None


def ensure_port_available(host: str, port: int) -> None:
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ConfigurationError(f"Listen address could not be resolved: {host}") from exc

    last_error: OSError | None = None
    for family, socket_type, protocol, _canonical_name, address in addresses:
        candidate = socket.socket(family, socket_type, protocol)
        try:
            candidate.bind(address)
            return
        except OSError as exc:
            last_error = exc
        finally:
            candidate.close()
    if last_error is not None and last_error.errno == errno.EADDRINUSE:
        raise ConfigurationError(f"Port {port} is already in use on {host}") from last_error
    raise ConfigurationError(f"Could not listen on {host}:{port}") from last_error

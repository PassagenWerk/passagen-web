import json
import logging
import socket
from pathlib import Path

import pytest

from passagen_web.config import ConfigurationError
from passagen_web.runtime import JsonFormatter, LibraryLock, ensure_port_available


def test_library_lock_rejects_a_second_process_for_the_same_data_dir(tmp_path: Path) -> None:
    with (
        LibraryLock(tmp_path, host="127.0.0.1", port=8765),
        pytest.raises(ConfigurationError, match="already using this data directory"),
        LibraryLock(tmp_path, host="127.0.0.1", port=8766),
    ):
        pass

    with LibraryLock(tmp_path, host="127.0.0.1", port=8766):
        assert "port=8766" in (tmp_path / ".passagen-web.lock").read_text()


def test_port_preflight_reports_an_existing_listener() -> None:
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    try:
        with pytest.raises(ConfigurationError, match=f"Port {port} is already in use"):
            ensure_port_available("127.0.0.1", port)
    finally:
        listener.close()


def test_json_formatter_emits_structured_fields_without_message_arguments() -> None:
    record = logging.LogRecord("passagen_web", logging.INFO, "", 0, "server_starting", (), None)
    record.host = "127.0.0.1"
    record.port = 8765

    payload = json.loads(JsonFormatter().format(record))

    assert payload["event"] == "server_starting"
    assert payload["host"] == "127.0.0.1"
    assert payload["port"] == 8765

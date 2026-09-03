from pathlib import Path

import pytest

from passagen_web.config import ConfigurationError, Settings


def test_settings_resolve_a_valid_library(data_dir: Path) -> None:
    settings = Settings.from_data_dir(data_dir)

    assert settings.data_dir == data_dir.resolve()
    assert settings.database_path == data_dir.resolve() / "passagen.db"
    assert settings.host == "127.0.0.1"
    assert settings.app_url == "http://127.0.0.1:8765"


def test_settings_reject_missing_data_directory(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="data directory does not exist"):
        Settings.from_data_dir(tmp_path / "missing")


def test_settings_reject_directory_without_database(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="database does not exist"):
        Settings.from_data_dir(tmp_path)


def test_settings_validate_ports_and_additional_browser_origins(data_dir: Path) -> None:
    settings = Settings.from_data_dir(
        data_dir,
        host="0.0.0.0",
        port=9000,
        allowed_origins=("http://127.0.0.1:5173/",),
    )

    assert settings.app_url == "http://127.0.0.1:9000"
    assert settings.allowed_origins == ("http://127.0.0.1:5173",)
    with pytest.raises(ConfigurationError, match="Port must be"):
        Settings.from_data_dir(data_dir, port=70000)
    with pytest.raises(ConfigurationError, match="Invalid allowed origin"):
        Settings.from_data_dir(data_dir, allowed_origins=("https://example.com/path",))

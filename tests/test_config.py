from pathlib import Path

import pytest

from passagen_web.config import ConfigurationError, Settings


def test_settings_resolve_a_valid_library(data_dir: Path) -> None:
    settings = Settings.from_data_dir(data_dir)

    assert settings.data_dir == data_dir.resolve()
    assert settings.database_path == data_dir.resolve() / "passagen.db"
    assert settings.host == "127.0.0.1"


def test_settings_reject_missing_data_directory(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="data directory does not exist"):
        Settings.from_data_dir(tmp_path / "missing")


def test_settings_reject_directory_without_database(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="database does not exist"):
        Settings.from_data_dir(tmp_path)

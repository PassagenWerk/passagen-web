from pathlib import Path

import pytest
from passagen.storage.database import initialize_database


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    path = tmp_path / "data"
    path.mkdir()
    initialize_database(path / "passagen.db")
    return path

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from passagen_web.cli import main
from passagen_web.config import ConfigurationError


def test_serve_starts_on_loopback_by_default(data_dir: Path) -> None:
    with (
        patch("passagen_web.cli.ensure_port_available"),
        patch("passagen_web.cli.threading.Timer") as timer,
        patch("passagen_web.cli.uvicorn.run") as run,
    ):
        main(["serve", "--data-dir", str(data_dir)])

    run.assert_called_once()
    assert run.call_args.kwargs == {
        "host": "127.0.0.1",
        "port": 8765,
        "log_config": None,
        "access_log": False,
    }
    timer.return_value.start.assert_called_once_with()
    timer.return_value.cancel.assert_called_once_with()


def test_serve_rejects_an_invalid_library(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run = Mock()
    with patch("passagen_web.cli.uvicorn.run", run), pytest.raises(SystemExit) as error:
        main(["serve", "--data-dir", str(tmp_path / "missing")])

    assert error.value.code == 2
    assert "Passagen data directory does not exist" in capsys.readouterr().err
    run.assert_not_called()


def test_serve_rejects_an_incompatible_database(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "passagen.db").touch()
    run = Mock()

    with patch("passagen_web.cli.uvicorn.run", run), pytest.raises(SystemExit) as error:
        main(["serve", "--data-dir", str(data_dir)])

    assert error.value.code == 2
    assert "Database schema 0 is incompatible" in capsys.readouterr().err
    run.assert_not_called()


def test_serve_can_disable_browser_opening_and_reports_port_conflicts(
    data_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    with (
        patch(
            "passagen_web.cli.ensure_port_available",
            side_effect=ConfigurationError("Port 8765 is already in use"),
        ),
        patch("passagen_web.cli.uvicorn.run") as run,
        pytest.raises(SystemExit) as error,
    ):
        main(["serve", "--data-dir", str(data_dir), "--no-open"])

    assert error.value.code == 2
    assert "Port 8765 is already in use" in capsys.readouterr().err
    run.assert_not_called()

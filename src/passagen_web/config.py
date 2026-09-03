from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


class ConfigurationError(ValueError):
    """Raised when the local Passagen library cannot be opened."""


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8765
    allowed_origins: tuple[str, ...] = ()

    @property
    def database_path(self) -> Path:
        return self.data_dir / "passagen.db"

    @property
    def app_url(self) -> str:
        browser_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
        if browser_host == "::":
            browser_host = "::1"
        if ":" in browser_host and not browser_host.startswith("["):
            browser_host = f"[{browser_host}]"
        return f"http://{browser_host}:{self.port}"

    @classmethod
    def from_data_dir(
        cls,
        data_dir: Path,
        *,
        host: str = "127.0.0.1",
        port: int = 8765,
        allowed_origins: tuple[str, ...] = (),
    ) -> "Settings":
        resolved = data_dir.expanduser().resolve()
        if not resolved.is_dir():
            raise ConfigurationError(f"Passagen data directory does not exist: {resolved}")

        database_path = resolved / "passagen.db"
        if not database_path.is_file():
            raise ConfigurationError(f"Passagen database does not exist: {database_path}")

        if not 1 <= port <= 65535:
            raise ConfigurationError("Port must be between 1 and 65535")
        for origin in allowed_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
            ):
                raise ConfigurationError(f"Invalid allowed origin: {origin}")

        return cls(
            data_dir=resolved,
            host=host,
            port=port,
            allowed_origins=tuple(origin.rstrip("/") for origin in allowed_origins),
        )

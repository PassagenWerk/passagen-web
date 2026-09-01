from dataclasses import dataclass
from pathlib import Path


class ConfigurationError(ValueError):
    """Raised when the local Passagen library cannot be opened."""


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8765

    @property
    def database_path(self) -> Path:
        return self.data_dir / "passagen.db"

    @classmethod
    def from_data_dir(
        cls, data_dir: Path, *, host: str = "127.0.0.1", port: int = 8765
    ) -> "Settings":
        resolved = data_dir.expanduser().resolve()
        if not resolved.is_dir():
            raise ConfigurationError(f"Passagen data directory does not exist: {resolved}")

        database_path = resolved / "passagen.db"
        if not database_path.is_file():
            raise ConfigurationError(f"Passagen database does not exist: {database_path}")

        return cls(data_dir=resolved, host=host, port=port)

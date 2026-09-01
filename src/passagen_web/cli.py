import argparse
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from passagen_web.app import create_app
from passagen_web.config import ConfigurationError, Settings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="passagen-web", description="Browse a Passagen library")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="start the local web server")
    serve.add_argument("--data-dir", type=Path, required=True, help="Passagen data directory")
    serve.add_argument("--host", default="127.0.0.1", help="listen address (default: 127.0.0.1)")
    serve.add_argument("--port", type=int, default=8765, help="listen port (default: 8765)")
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        settings = Settings.from_data_dir(args.data_dir, host=args.host, port=args.port)
    except ConfigurationError as error:
        parser.error(str(error))

    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()

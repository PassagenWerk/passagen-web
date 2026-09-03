import argparse
import logging
import threading
import webbrowser
from collections.abc import Sequence
from pathlib import Path

import uvicorn
from passagen.catalog import IncompatibleSchemaError

from passagen_web.app import create_app
from passagen_web.config import ConfigurationError, Settings
from passagen_web.runtime import LibraryLock, configure_logging, ensure_port_available


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="passagen-web", description="Browse a Passagen library")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="start the local web server")
    serve.add_argument("--data-dir", type=Path, required=True, help="Passagen data directory")
    serve.add_argument("--host", default="127.0.0.1", help="listen address (default: 127.0.0.1)")
    serve.add_argument("--port", type=int, default=8765, help="listen port (default: 8765)")
    serve.add_argument("--no-open", action="store_true", help="do not open a browser")
    serve.add_argument(
        "--allow-origin",
        action="append",
        default=[],
        metavar="URL",
        help="allow an additional browser origin for writes (repeatable)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        settings = Settings.from_data_dir(
            args.data_dir,
            host=args.host,
            port=args.port,
            allowed_origins=tuple(args.allow_origin),
        )
        application = create_app(settings)
    except (ConfigurationError, IncompatibleSchemaError) as error:
        parser.error(str(error))

    configure_logging()
    logger = logging.getLogger("passagen_web")
    logger.info("server_starting", extra={"host": settings.host, "port": settings.port})
    browser_timer = threading.Timer(0.75, webbrowser.open, args=(settings.app_url,))
    browser_timer.daemon = True
    if not args.no_open:
        browser_timer.start()
    try:
        with LibraryLock(settings.data_dir, host=settings.host, port=settings.port):
            ensure_port_available(settings.host, settings.port)
            uvicorn.run(
                application,
                host=settings.host,
                port=settings.port,
                log_config=None,
                access_log=False,
            )
    except ConfigurationError as error:
        parser.error(str(error))
    finally:
        browser_timer.cancel()
        logger.info("server_stopped")


if __name__ == "__main__":
    main()

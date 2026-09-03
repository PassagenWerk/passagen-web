import os
import shutil
import subprocess
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    PLUGIN_NAME = "custom"

    def initialize(self, version: str, build_data: dict[str, object]) -> None:
        if version == "editable" or os.environ.get("PASSAGEN_WEB_SKIP_FRONTEND_BUILD") == "1":
            return
        index = Path(self.root) / "src" / "passagen_web" / "static" / "index.html"
        if not (Path(self.root) / "frontend" / "node_modules").is_dir():
            if index.is_file():
                return
            raise RuntimeError(
                "Frontend dependencies are missing; run `npm --prefix frontend ci` before building"
            )
        npm = shutil.which("npm")
        if npm is None:
            raise RuntimeError("Node.js 24 and npm 11 are required to build Passagen Web")
        subprocess.run(
            [npm, "--prefix", "frontend", "run", "build"],
            cwd=self.root,
            check=True,
        )
        if not index.is_file():
            raise RuntimeError("Frontend build did not produce static/index.html")

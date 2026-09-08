"""In-process single-worker runners for persisted processing and generation runs."""

from __future__ import annotations

import logging
import threading

from passagen.generation import GenerationRunDispatcher
from passagen.processing import ProcessingService
from passagen.providers import check_provider_health

logger = logging.getLogger("passagen_web.runner")


class ProcessingRunner:
    """Execute queued processing runs one at a time on a background thread.

    Run state lives in the database, so a crash or shutdown never strands a run:
    whatever is still queued/running is marked ``interrupted`` at next startup.
    """

    def __init__(self, service: ProcessingService, *, poll_interval: float = 0.2) -> None:
        self._service = service
        self._poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._loop, name="passagen-processing-runner", daemon=True
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self, *, timeout: float = 5.0) -> None:
        self._stop.set()
        self._thread.join(timeout=timeout)

    def _loop(self) -> None:
        while not self._stop.is_set():
            run = self._service.next_queued_run()
            if run is None:
                self._stop.wait(self._poll_interval)
                continue
            logger.info("processing_run_dequeued", extra={"run_id": run.id})
            try:
                health = check_provider_health(self._service.settings.providers)
                self._service.execute_run(run.id, provider_health=health)
            except Exception:
                # execute_run already persisted the failure; this is a safety net.
                logger.exception("processing_run_crashed", extra={"run_id": run.id})


class GenerationRunner:
    """Execute queued answer, synthesis, and report runs one at a time."""

    def __init__(self, dispatcher: GenerationRunDispatcher, *, poll_interval: float = 0.2) -> None:
        self._dispatcher = dispatcher
        self._poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._loop, name="passagen-generation-runner", daemon=True
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self, *, timeout: float = 5.0) -> None:
        self._stop.set()
        self._thread.join(timeout=timeout)

    def _loop(self) -> None:
        while not self._stop.is_set():
            run = self._dispatcher.claim_next_queued_run()
            if run is None:
                self._stop.wait(self._poll_interval)
                continue
            logger.info("generation_run_dequeued", extra={"run_id": run.id, "kind": run.kind})
            try:
                self._dispatcher.execute_run(run.id)
            except Exception:
                # execute_run already persisted the failure; this is a safety net.
                logger.exception("generation_run_crashed", extra={"run_id": run.id})

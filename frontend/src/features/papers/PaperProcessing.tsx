import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Paper } from "../../api/papers";
import type { RebuildStage } from "../../api/processing";
import { useEscapeClose } from "../../components/useEscapeClose";
import type { PaperProcessingController } from "./usePaperProcessing";

const rebuildScope: Record<RebuildStage, string> = {
  metadata: "Metadata, Full text, Abstract clean, Summary, and Outline",
  parse: "Full text, Abstract clean, Summary, and Outline",
  abstract: "The cleaned Abstract view",
  summary: "Summary and Outline",
  outline: "Outline",
};

export function PaperProcessingStatus({
  paper,
  processing,
}: {
  paper: Paper;
  processing: PaperProcessingController;
}) {
  if (processing.activeRun) {
    return (
      <section className="paper-processing" aria-label="Processing status">
        <p className="processing-note">
          Processing{processing.activeRun.current_stage
            ? `: ${processing.activeRun.current_stage}`
            : " queued"} -{" "}
          <Link to={`/processing/runs/${processing.activeRun.id}`}>view run</Link>
        </p>
      </section>
    );
  }

  const complete = paper.status === "outlined";
  if (complete && !processing.latestFailure && !processing.error) return null;

  return (
    <section className="paper-processing" aria-label="Processing status">
      <div className="paper-processing-actions">
        {!complete ? (
          <button
            type="button"
            className="text-button"
            disabled={processing.isStarting}
            onClick={() => processing.start()}
          >
            {processing.isStarting
              ? "Starting..."
              : paper.status === "discovered"
                ? "Process"
                : "Continue processing"}
          </button>
        ) : null}
        {processing.latestFailure ? (
          <span className="form-status is-error">
            Last run failed at {processing.latestFailure.category}: {processing.latestFailure.message}
          </span>
        ) : null}
        {processing.error ? (
          <span className="form-status is-error" role="alert">{processing.error.message}</span>
        ) : null}
      </div>
    </section>
  );
}

export function StageReprocessButton({
  stage,
  label,
  processing,
}: {
  stage: RebuildStage;
  label: string;
  processing: PaperProcessingController;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = `reprocess-${stage}-panel`;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEscapeClose(open, close);

  return (
    <div className="stage-reprocess">
      <button
        ref={trigger}
        className="stage-reprocess-trigger"
        type="button"
        aria-label={`Reprocess from ${label}`}
        title={`Reprocess from ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={Boolean(processing.activeRun) || processing.isStarting}
        onClick={() => setOpen((value) => !value)}
      >
        <ResetIcon />
      </button>
      {open ? (
        <div
          className="settings-panel stage-reprocess-panel"
          id={panelId}
          role="dialog"
          aria-label={`Reprocess from ${label}`}
        >
          <strong>Reprocess from {label}?</strong>
          <span>{rebuildScope[stage]} will be regenerated for this paper.</span>
          <span>Earlier stages and user-edited metadata are kept.</span>
          {stage === "abstract" ? (
            <span>Summary and Outline remain unchanged; failures are reported as warnings.</span>
          ) : null}
          <button
            type="button"
            className="text-button"
            disabled={processing.isStarting}
            onClick={() => processing.start(stage, close)}
          >Confirm reprocess</button>
        </div>
      ) : null}
    </div>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13">
      <path d="M13 5V2l-1.3 1.3A5.5 5.5 0 1 0 13.2 9h-1.6a4 4 0 1 1-1-4.6L9 6h4Z" />
    </svg>
  );
}

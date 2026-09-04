import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { fetchPapers, type Paper } from "../../api/papers";
import {
  createRun,
  fetchRuns,
  importPapers,
  isActiveRun,
  type ImportResult,
  type ProcessingRun,
  type RebuildStage,
  type RunPaperFailure,
} from "../../api/processing";

const statusLabels: Record<string, string> = {
  discovered: "Discovered",
  metadata_resolved: "Metadata",
  parsed: "Parsed",
  summarized: "Summary",
  outlined: "Outlined",
};

const rebuildStages: { value: RebuildStage; label: string }[] = [
  { value: "metadata", label: "Metadata" },
  { value: "parse", label: "Parse" },
  { value: "summary", label: "Summary" },
];

export function ProcessingPage() {
  const queryClient = useQueryClient();
  const papers = useQuery({
    queryKey: ["processing-papers"],
    queryFn: () => fetchPapers(new URLSearchParams("limit=200")),
    retry: false,
  });
  const runs = useQuery({
    queryKey: ["processing-runs"],
    queryFn: () => fetchRuns({ limit: 50 }),
    retry: false,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isActiveRun) ? 1500 : false,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["processing-runs"] });
    await queryClient.invalidateQueries({ queryKey: ["processing-papers"] });
    await queryClient.invalidateQueries({ queryKey: ["papers"] });
  }

  const pendingPapers = (papers.data?.items ?? []).filter(
    (paper) => paper.status !== "outlined",
  );
  const paperById = new Map((papers.data?.items ?? []).map((paper) => [paper.id, paper]));
  const failures = latestFailures(runs.data ?? []);

  return (
    <div className="processing-page">
      <div className="panel-heading">
        <span className="index-number">01</span>
        <h2>Processing</h2>
      </div>

      <UploadCard onImported={refresh} />

      <section className="processing-card" aria-labelledby="pending-heading">
        <div className="processing-card-heading">
          <h3 id="pending-heading">Pending papers</h3>
          <ProcessButton
            label="Process pending papers"
            paperIds={pendingPapers.map((paper) => paper.id)}
            onStarted={refresh}
          />
        </div>
        {pendingPapers.length === 0 ? (
          <p className="processing-note">No papers are waiting for processing.</p>
        ) : (
          <ul className="processing-list">
            {pendingPapers.map((paper) => (
              <PendingPaperRow key={paper.id} paper={paper} onStarted={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section className="processing-card" aria-labelledby="failed-heading">
        <div className="processing-card-heading">
          <h3 id="failed-heading">Failed papers</h3>
          {failures.length > 0 ? (
            <ProcessButton
              label="Retry all failed"
              paperIds={failures.map((failure) => failure.paper_id)}
              onStarted={refresh}
            />
          ) : null}
        </div>
        {failures.length === 0 ? (
          <p className="processing-note">No failed papers in recent runs.</p>
        ) : (
          <ul className="processing-list">
            {failures.map((failure) => (
              <FailedPaperRow
                key={failure.paper_id}
                failure={failure}
                paper={paperById.get(failure.paper_id)}
                onStarted={refresh}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="processing-card" aria-labelledby="runs-heading">
        <div className="processing-card-heading">
          <h3 id="runs-heading">Recent runs</h3>
        </div>
        {runs.error ? (
          <p className="processing-note is-error">{runs.error.message}</p>
        ) : null}
        {(runs.data ?? []).length === 0 && !runs.isPending ? (
          <p className="processing-note">No processing runs yet.</p>
        ) : (
          <ul className="processing-list">
            {(runs.data ?? []).map((run) => (
              <RunRow key={run.id} run={run} paperById={paperById} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadCard({ onImported }: { onImported: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const upload = useMutation({
    mutationFn: importPapers,
    onSuccess: async (data) => {
      setResult(data);
      await onImported();
    },
  });

  function submit(files: File[]) {
    if (files.length === 0 || upload.isPending) return;
    upload.mutate(files);
  }

  return (
    <section className="processing-card" aria-labelledby="upload-heading">
      <div className="processing-card-heading">
        <h3 id="upload-heading">Import PDFs</h3>
      </div>
      <div
        className={`upload-dropzone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          submit([...event.dataTransfer.files]);
        }}
      >
        <p>Drop PDF files here, or</p>
        <button
          type="button"
          className="primary-button"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Importing..." : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          aria-label="PDF files to import"
          onChange={(event) => {
            submit([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>
      {upload.error ? (
        <p className="form-status is-error" role="alert">{upload.error.message}</p>
      ) : null}
      {result ? (
        <div className="upload-result" role="status">
          {result.added.length > 0 ? <p>Imported: {result.added.length} new paper(s).</p> : null}
          {result.duplicates.length > 0 ? (
            <p>Duplicates skipped: {result.duplicates.length}.</p>
          ) : null}
          {result.failed.map((failure) => (
            <p key={failure.filename} className="is-error">
              {failure.filename}: {failure.reason === "not_a_pdf" ? "not a PDF file" : failure.message}
            </p>
          ))}
          {result.added.length === 0 &&
          result.duplicates.length === 0 &&
          result.failed.length === 0 ? (
            <p>No files were imported.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProcessButton({
  label,
  paperIds,
  onStarted,
  fromStage,
}: {
  label: string;
  paperIds: string[];
  onStarted: () => Promise<void>;
  fromStage?: RebuildStage;
}) {
  const start = useMutation({
    mutationFn: () => createRun(paperIds, fromStage ? "rebuild" : "continue", fromStage),
    onSuccess: onStarted,
  });
  return (
    <span className="process-action">
      <button
        type="button"
        className="primary-button"
        disabled={paperIds.length === 0 || start.isPending}
        onClick={() => start.mutate()}
      >
        {start.isPending ? "Starting..." : label}
      </button>
      {start.error ? (
        <span className="form-status is-error" role="alert">{start.error.message}</span>
      ) : null}
    </span>
  );
}

function PendingPaperRow({
  paper,
  onStarted,
}: {
  paper: Paper;
  onStarted: () => Promise<void>;
}) {
  return (
    <li className="processing-row">
      <div className="processing-row-main">
        <Link to={`/papers/${paper.id}`}>{paper.title ?? paper.original_filename}</Link>
        <span className="processing-row-meta">
          {statusLabels[paper.status] ?? paper.status}
        </span>
      </div>
      <ProcessButton
        label={paper.status === "discovered" ? "Process" : "Continue processing"}
        paperIds={[paper.id]}
        onStarted={onStarted}
      />
    </li>
  );
}

function FailedPaperRow({
  failure,
  paper,
  onStarted,
}: {
  failure: RunPaperFailure;
  paper: Paper | undefined;
  onStarted: () => Promise<void>;
}) {
  const [fromStage, setFromStage] = useState<RebuildStage>("metadata");
  return (
    <li className="processing-row">
      <div className="processing-row-main">
        {paper ? (
          <Link to={`/papers/${paper.id}`}>{paper.title ?? paper.original_filename}</Link>
        ) : (
          <span>{failure.paper_id}</span>
        )}
        <span className="processing-row-meta is-error">
          {failure.category}: {failure.message}
        </span>
      </div>
      <div className="processing-row-actions">
        <ProcessButton label="Retry" paperIds={[failure.paper_id]} onStarted={onStarted} />
        <span className="reprocess-control">
          <select
            aria-label="Reprocess from stage"
            value={fromStage}
            onChange={(event) => setFromStage(event.target.value as RebuildStage)}
          >
            {rebuildStages.map((stage) => (
              <option key={stage.value} value={stage.value}>
                From {stage.label}
              </option>
            ))}
          </select>
          <ProcessButton
            label="Reprocess"
            paperIds={[failure.paper_id]}
            fromStage={fromStage}
            onStarted={onStarted}
          />
        </span>
      </div>
    </li>
  );
}

function RunRow({
  run,
  paperById,
}: {
  run: ProcessingRun;
  paperById: Map<string, Paper>;
}) {
  const summary = run.result
    ? `${run.result.updated.length} updated, ${run.result.skipped.length} skipped, ${run.result.failed.length} failed`
    : run.status === "running"
      ? `Running: ${run.current_stage ?? "starting"}${run.current_paper_id ? ` (${paperById.get(run.current_paper_id)?.title ?? run.current_paper_id})` : ""}`
      : null;
  return (
    <li className="processing-row">
      <div className="processing-row-main">
        <Link to={`/processing/runs/${run.id}`}>
          Run {run.id.slice(0, 8)} · {run.mode}
          {run.from_stage ? ` from ${run.from_stage}` : ""}
        </Link>
        <span className={`processing-row-meta status-${run.status}`}>
          {run.status}
          {summary ? ` · ${summary}` : ""}
        </span>
      </div>
      <span className="processing-row-meta">
        {new Date(run.created_at).toLocaleString()}
      </span>
    </li>
  );
}

function latestFailures(runs: ProcessingRun[]): RunPaperFailure[] {
  const failures = new Map<string, RunPaperFailure>();
  for (const run of runs) {
    for (const failure of run.result?.failed ?? []) {
      if (!failures.has(failure.paper_id)) failures.set(failure.paper_id, failure);
    }
  }
  // Papers that succeeded in a later run are no longer failing.
  for (const run of [...runs].reverse()) {
    for (const paperId of run.result?.updated ?? []) failures.delete(paperId);
  }
  return [...failures.values()];
}

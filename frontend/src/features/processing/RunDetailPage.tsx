import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import {
  fetchRun,
  fetchRunEvents,
  isActiveRun,
} from "../../api/processing";

export function RunDetailPage() {
  const { runId } = useParams();
  const run = useQuery({
    queryKey: ["processing-run", runId],
    queryFn: () => fetchRun(runId!),
    enabled: Boolean(runId),
    retry: false,
    refetchInterval: (query) => (query.state.data && isActiveRun(query.state.data) ? 1500 : false),
  });
  const active = run.data ? isActiveRun(run.data) : true;
  const events = useQuery({
    queryKey: ["processing-run-events", runId],
    queryFn: () => fetchRunEvents(runId!),
    enabled: Boolean(runId),
    retry: false,
    refetchInterval: active ? 1500 : false,
  });

  const data = run.data;
  return (
    <div className="processing-page">
      <div className="panel-heading">
        <span className="index-number">02</span>
        <h2>Run detail</h2>
        <Link className="mobile-back" to="/processing">Back to processing</Link>
      </div>

      {run.isPending ? <p className="processing-note">Loading run...</p> : null}
      {run.error ? <p className="processing-note is-error">{run.error.message}</p> : null}

      {data ? (
        <>
          <section className="processing-card" aria-labelledby="run-summary-heading">
            <div className="processing-card-heading">
              <h3 id="run-summary-heading">
                Run {data.id.slice(0, 8)} · {data.mode}
                {data.from_stage ? ` from ${data.from_stage}` : ""}
              </h3>
              <span className={`run-status status-${data.status}`}>{data.status}</span>
            </div>
            <dl className="metadata-grid run-meta">
              <div><dt>Created</dt><dd>{new Date(data.created_at).toLocaleString()}</dd></div>
              <div>
                <dt>Finished</dt>
                <dd>{data.finished_at ? new Date(data.finished_at).toLocaleString() : "—"}</dd>
              </div>
              <div><dt>Papers</dt><dd>{data.paper_ids.length}</dd></div>
              <div>
                <dt>Current stage</dt>
                <dd>{isActiveRun(data) ? (data.current_stage ?? "starting") : "—"}</dd>
              </div>
            </dl>
            {data.error ? <p className="processing-note is-error">{data.error}</p> : null}
            {data.result ? (
              <p className="processing-note">
                {data.result.updated.length} updated, {data.result.skipped.length} skipped,{" "}
                {data.result.failed.length} failed
              </p>
            ) : null}
            {data.result && data.result.failed.length > 0 ? (
              <ul className="processing-list">
                {data.result.failed.map((failure) => (
                  <li key={failure.paper_id} className="processing-row">
                    <div className="processing-row-main">
                      <Link to={`/papers/${failure.paper_id}`}>{failure.paper_id}</Link>
                      <span className="processing-row-meta is-error">
                        {failure.category}: {failure.message}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="processing-list">
              {data.paper_ids.map((paperId) => (
                <li key={paperId} className="processing-row">
                  <div className="processing-row-main">
                    <Link to={`/papers/${paperId}`}>{paperId}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="processing-card" aria-labelledby="run-events-heading">
            <div className="processing-card-heading">
              <h3 id="run-events-heading">Progress</h3>
            </div>
            <ol className="event-log" aria-live="polite">
              {(events.data ?? []).map((event) => (
                <li key={event.sequence}>
                  <span className="event-stage">{event.stage}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </div>
  );
}

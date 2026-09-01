import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "../api/health";

export function AppShell() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const connectionLabel = health.isPending
    ? "Connecting"
    : health.isSuccess
      ? "Library online"
      : "Library unavailable";

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Passagen home">
          <span className="wordmark-mark">P</span>
          <span>PASSAGEN</span>
        </a>
        <div className={`connection ${health.isSuccess ? "is-online" : ""}`} role="status">
          <span className="connection-dot" />
          {connectionLabel}
        </div>
      </header>

      <section className="workspace" aria-labelledby="library-title">
        <div className="eyebrow">LOCAL RESEARCH INDEX / 001</div>
        <h1 id="library-title">Your reading,<br />held in one place.</h1>
        <p className="intro">
          Search papers, follow their arguments, and shape collections without sending your
          library anywhere.
        </p>

        <div className="library-preview" aria-label="Library foundation status">
          <div className="preview-index">01</div>
          <div>
            <p className="preview-label">FOUNDATION</p>
            <h2>Catalog connection</h2>
            <p>The application shell is ready. Paper browsing arrives with the catalog API.</p>
          </div>
          <span className="preview-state">M0</span>
        </div>
      </section>

      <footer>
        <span>PRIVATE BY DEFAULT</span>
        <span>127.0.0.1</span>
      </footer>
    </main>
  );
}

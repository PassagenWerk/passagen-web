import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";

import { fetchHealth } from "../api/health";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
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
        <div className="masthead-actions">
          <nav className="primary-nav" aria-label="Primary navigation">
            <Link
              to="/"
              className={location.pathname.startsWith("/collections") ? "" : "active"}
              aria-current={location.pathname.startsWith("/collections") ? undefined : "page"}
            >Library</Link>
            <NavLink to="/collections">Collections</NavLink>
          </nav>
          <div className={`connection ${health.isSuccess ? "is-online" : ""}`} role="status">
            <span className="connection-dot" />
            {connectionLabel}
          </div>
        </div>
      </header>

      {children}

      <footer>
        <span>PRIVATE BY DEFAULT</span>
        <span>J/K TO NAVIGATE</span>
      </footer>
    </main>
  );
}

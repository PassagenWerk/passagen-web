import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "../api/health";
import { LibraryPage } from "../features/papers/LibraryPage";

interface AppShellProps {
  readingFocused: boolean;
  onFocusReading: () => void;
  onExitReading: () => void;
}

export function AppShell({
  readingFocused,
  onFocusReading,
  onExitReading,
}: AppShellProps) {
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

      <LibraryPage
        readingFocused={readingFocused}
        onFocusReading={onFocusReading}
        onExitReading={onExitReading}
      />

      <footer>
        <span>PRIVATE BY DEFAULT</span>
        <span>J/K TO NAVIGATE</span>
      </footer>
    </main>
  );
}

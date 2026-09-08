import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { fetchHealth } from "../api/health";
import { fetchRuns, isActiveRun } from "../api/processing";
import { useDisplayPreferences, type ThemePreference } from "../features/preferences/displayPreferences";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const { theme, setTheme, readerFontSize, setReaderFontSize } = useDisplayPreferences();
  const [themeOpen, setThemeOpen] = useState(false);
  const [textSizeOpen, setTextSizeOpen] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const runs = useQuery({
    queryKey: ["processing-runs"],
    queryFn: () => fetchRuns({ limit: 50 }),
    enabled: health.isSuccess,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isActiveRun) ? 1500 : 10_000,
  });
  const libraryActive =
    !location.pathname.startsWith("/collections") &&
    !location.pathname.startsWith("/processing") &&
    !location.pathname.startsWith("/tags");
  const connectionLabel = health.isPending
    ? "Connecting"
    : health.isSuccess
      ? "Library online"
      : "Library unavailable";
  const processingActive = (runs.data ?? []).some(isActiveRun);
  const processingLabel = health.isPending || runs.isPending
      ? "Checking processing"
    : !health.isSuccess || runs.isError
      ? "Processing unavailable"
      : processingActive
        ? "Processing active"
        : "Processing idle";

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
              className={libraryActive ? "active" : ""}
              aria-current={libraryActive ? "page" : undefined}
            >Library</Link>
            <NavLink to="/collections">Collections</NavLink>
            <NavLink to="/processing">Processing</NavLink>
          </nav>
          <div className="theme-settings">
            <button
              className="settings-toggle"
              type="button"
              aria-expanded={themeOpen}
              aria-controls="theme-settings"
              onClick={() => {
                setTextSizeOpen(false);
                setThemeOpen((open) => !open);
              }}
            >Mode</button>
            {themeOpen ? (
              <fieldset className="settings-panel theme-settings-panel" id="theme-settings">
                <legend>Theme</legend>
                {(["system", "light", "dark"] as ThemePreference[]).map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="theme"
                      value={option}
                      checked={theme === option}
                      onChange={() => {
                        setTheme(option);
                        setThemeOpen(false);
                      }}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
          <div className="header-text-settings">
            <button
              className="reader-settings-toggle"
              type="button"
              aria-label="Text size"
              aria-expanded={textSizeOpen}
              aria-controls="text-size-settings"
              onClick={() => {
                setThemeOpen(false);
                setTextSizeOpen((open) => !open);
              }}
            >Aa</button>
            {textSizeOpen ? (
              <fieldset className="settings-panel reader-settings-panel" id="text-size-settings">
                <legend>Reading and conversation text</legend>
                <output htmlFor="reader-font-size">{readerFontSize}px</output>
                <div className="reader-size-slider">
                  <span aria-hidden="true">A</span>
                  <input
                    id="reader-font-size"
                    type="range"
                    min="14"
                    max="24"
                    step="1"
                    value={readerFontSize}
                    aria-label="Global font size"
                    onChange={(event) => setReaderFontSize(Number(event.target.value))}
                  />
                  <span aria-hidden="true">A</span>
                </div>
              </fieldset>
            ) : null}
          </div>
          <div className="header-statuses">
            <div className={`connection ${health.isSuccess ? "is-online" : ""}`} role="status">
              <span className="connection-dot" />
              {connectionLabel}
            </div>
            <Link
              className={`connection processing-status ${processingActive ? "is-active" : ""}`}
              to="/processing"
            >
              <span className="connection-dot" />
              <span role="status" aria-live="polite">{processingLabel}</span>
            </Link>
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

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { fetchHealth } from "../api/health";
import { useDisplayPreferences, type ThemePreference } from "../features/preferences/displayPreferences";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const { theme, setTheme } = useDisplayPreferences();
  const [themeOpen, setThemeOpen] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const libraryActive =
    !location.pathname.startsWith("/collections") &&
    !location.pathname.startsWith("/processing") &&
    !location.pathname.startsWith("/tags");
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
              onClick={() => setThemeOpen((open) => !open)}
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

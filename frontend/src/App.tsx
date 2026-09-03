import { useState } from "react";
import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";

export function App() {
  const [readingFocused, setReadingFocused] = useState(false);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell
            readingFocused={readingFocused}
            onFocusReading={() => setReadingFocused(true)}
            onExitReading={() => setReadingFocused(false)}
          />
        }
      />
      <Route
        path="/papers/:paperId"
        element={
          <AppShell
            readingFocused={readingFocused}
            onFocusReading={() => setReadingFocused(true)}
            onExitReading={() => setReadingFocused(false)}
          />
        }
      />
      <Route
        path="/papers/:paperId/pdf"
        element={
          <AppShell
            readingFocused={readingFocused}
            onFocusReading={() => setReadingFocused(true)}
            onExitReading={() => setReadingFocused(false)}
          />
        }
      />
    </Routes>
  );
}

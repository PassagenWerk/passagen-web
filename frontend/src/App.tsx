import { useState } from "react";
import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { CollectionsPage } from "./features/collections/CollectionsPage";
import { LibraryPage } from "./features/papers/LibraryPage";

export function App() {
  const [readingFocused, setReadingFocused] = useState(false);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell>
            <LibraryPage
              readingFocused={readingFocused}
              onFocusReading={() => setReadingFocused(true)}
              onExitReading={() => setReadingFocused(false)}
            />
          </AppShell>
        }
      />
      <Route
        path="/papers/:paperId"
        element={
          <AppShell>
            <LibraryPage
              readingFocused={readingFocused}
              onFocusReading={() => setReadingFocused(true)}
              onExitReading={() => setReadingFocused(false)}
            />
          </AppShell>
        }
      />
      <Route
        path="/papers/:paperId/pdf"
        element={
          <AppShell>
            <LibraryPage
              readingFocused={readingFocused}
              onFocusReading={() => setReadingFocused(true)}
              onExitReading={() => setReadingFocused(false)}
            />
          </AppShell>
        }
      />
      <Route path="/collections" element={<AppShell><CollectionsPage /></AppShell>} />
      <Route path="/collections/:collectionId" element={<AppShell><CollectionsPage /></AppShell>} />
      <Route path="/collections/:collectionId/papers/:paperId" element={<AppShell><CollectionsPage /></AppShell>} />
      <Route path="/collections/:collectionId/papers/:paperId/pdf" element={<AppShell><CollectionsPage /></AppShell>} />
    </Routes>
  );
}

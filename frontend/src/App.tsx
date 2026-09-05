import { useState } from "react";
import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { CollectionsPage } from "./features/collections/CollectionsPage";
import { LibraryPage } from "./features/papers/LibraryPage";
import { DisplayPreferencesProvider } from "./features/preferences/DisplayPreferencesProvider";
import { ProcessingPage } from "./features/processing/ProcessingPage";
import { RunDetailPage } from "./features/processing/RunDetailPage";
import { TagsPage } from "./features/tags/TagsPage";

export function App() {
  const [readingFocused, setReadingFocused] = useState(false);

  return (
    <DisplayPreferencesProvider>
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
      <Route path="/tags" element={<AppShell><TagsPage /></AppShell>} />
      <Route path="/tags/:tagId" element={<AppShell><TagsPage /></AppShell>} />
      <Route path="/processing" element={<AppShell><ProcessingPage /></AppShell>} />
      <Route path="/processing/runs/:runId" element={<AppShell><RunDetailPage /></AppShell>} />
      </Routes>
    </DisplayPreferencesProvider>
  );
}

import { AppShell } from "./components/AppShell";
import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/papers/:paperId" element={<AppShell />} />
    </Routes>
  );
}

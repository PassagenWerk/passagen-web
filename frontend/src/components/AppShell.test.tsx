import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { AppShell } from "./AppShell";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", database: "available" }), { status: 200 }),
    ),
  );
});

test("shows the connected library state", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Library online")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Your reading/ })).toBeInTheDocument();
});

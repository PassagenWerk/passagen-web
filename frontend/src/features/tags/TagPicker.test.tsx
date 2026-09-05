import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { Tag } from "../../api/papers";
import { TagPicker } from "./TagPicker";

afterEach(cleanup);

function makeTags(count: number): Tag[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tag-${index}`,
    name: `Topic ${index}`,
    color: null,
    created_at: "2026-01-01",
    paper_count: 0,
  }));
}

test("filters a large tag list through search", () => {
  render(<TagPicker tags={makeTags(200)} selectedIds={[]} onToggle={() => undefined} />);

  expect(screen.getAllByRole("option")).toHaveLength(200);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tags" }), {
    target: { value: "topic 42" },
  });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /Topic 42/ })).toBeInTheDocument();
});

test("shows selected tags first and toggles them", () => {
  const onToggle = vi.fn();
  render(
    <TagPicker tags={makeTags(3)} selectedIds={["tag-2"]} onToggle={onToggle} />,
  );

  const options = screen.getAllByRole("option");
  expect(options[0]).toHaveAccessibleName(/Topic 2/);
  expect(options[0]).toHaveAttribute("aria-selected", "true");
  expect(options[1]).toHaveAttribute("aria-selected", "false");

  fireEvent.click(options[1]);
  expect(onToggle).toHaveBeenCalledWith("tag-0");
});

test("supports arrow-key navigation and Enter selection from the search field", () => {
  const onToggle = vi.fn();
  render(<TagPicker tags={makeTags(3)} selectedIds={[]} onToggle={onToggle} />);

  const search = screen.getByRole("searchbox", { name: "Search tags" });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  const options = screen.getAllByRole("option");
  expect(options[0]).toHaveFocus();
  fireEvent.keyDown(options[0], { key: "ArrowDown" });
  expect(options[1]).toHaveFocus();
  fireEvent.keyDown(options[1], { key: "ArrowUp" });
  expect(options[0]).toHaveFocus();

  fireEvent.keyDown(search, { key: "Enter" });
  expect(onToggle).toHaveBeenCalledWith("tag-0");
});

test("offers to create a tag only when no exact match exists", () => {
  const onCreate = vi.fn();
  render(
    <TagPicker
      tags={[
        { id: "tag-1", name: "Systems", color: null, created_at: "2026-01-01", paper_count: 0 },
      ]}
      selectedIds={[]}
      onToggle={() => undefined}
      onCreate={onCreate}
      createLabel={(name) => `Create and assign "${name}"`}
    />,
  );

  const search = screen.getByRole("searchbox", { name: "Search tags" });
  fireEvent.change(search, { target: { value: "systems" } });
  expect(screen.queryByRole("button", { name: /Create and assign/ })).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: "Methods" } });
  fireEvent.click(screen.getByRole("button", { name: 'Create and assign "Methods"' }));
  expect(onCreate).toHaveBeenCalledWith("Methods");
});

test("surfaces failed toggles with a retry control", () => {
  const onRetry = vi.fn();
  render(
    <TagPicker
      tags={makeTags(1)}
      selectedIds={[]}
      onToggle={() => undefined}
      failedIds={new Map([["tag-0", "network error"]])}
      onRetry={onRetry}
    />,
  );

  expect(screen.getByText(/Not saved: network error/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledWith("tag-0");
});

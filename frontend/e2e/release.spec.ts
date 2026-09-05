import { expect, test } from "@playwright/test";

test("runs the packaged collection and reader workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Alpha Systems" })).toBeVisible();

  await page.getByRole("link", { name: "Collections" }).click();
  await page.getByRole("textbox", { name: "New collection" }).fill("Release reading");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Release reading" })).toBeVisible();

  await page.getByRole("link", { name: "Add papers" }).click();
  await page.getByRole("checkbox", { name: "Select Alpha Systems" }).check();
  await page.getByRole("checkbox", { name: "Select Beta Storage" }).check();
  await page.getByRole("button", { name: "Add selected papers" }).click();
  await page.getByRole("link", { name: "View collection" }).click();
  await expect(page.getByText("2 papers").first()).toBeVisible();

  await page.getByRole("button", { name: "Move Alpha Systems down" }).click();
  await page.getByRole("link", { name: "Alpha Systems" }).click();
  await expect(page.getByRole("link", { name: "Back to Release reading" })).toBeVisible();
  await expect(page.getByText("A release-quality problem")).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous" })).toHaveAttribute(
    "href",
    /paper-b$/,
  );

  await page.getByRole("button", { name: "Open PDF panel" }).click();
  await expect(page.getByTitle("Alpha Systems PDF")).toHaveAttribute("src", /paper-a\/pdf/);
});

test("runs the tag management, in-context assignment, and filtering workflow", async ({
  page,
}) => {
  // Global tags workspace: create two tags, including a deep-route reload.
  await page.goto("/tags");
  await expect(page.getByRole("heading", { name: "Organize your library." })).toBeVisible();
  await page.getByRole("textbox", { name: "New Library Tag" }).fill("Systems");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Systems" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Systems" })).toBeVisible();

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("link", { name: /Alpha Systems/ })).toBeVisible();

  // Assign an existing tag while reading Alpha Systems.
  await page.getByRole("link", { name: /Alpha Systems/ }).click();
  await expect(page.getByText("A release-quality problem")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Author abstract" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cleaned" })).toBeVisible();
  await expect(page.getByText("A cleaned author-written overview of Alpha Systems.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original extraction" })).toBeVisible();
  await expect(page.getByText("An author-written overview of Alpha Systems.")).toBeVisible();
  await page.getByRole("button", { name: "Tags 0" }).click();
  await page.getByRole("option", { name: /Systems/ }).click();
  await expect(page.getByRole("option", { name: /Systems/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Tags 1" })).toBeVisible();

  // Create and assign a new tag without leaving the reading position.
  await page.getByRole("searchbox", { name: "Search tags" }).fill("Deep Reading");
  await page.getByRole("button", { name: 'Create and assign "Deep Reading"' }).click();
  await expect(page.getByRole("button", { name: "Tags 2" })).toBeVisible();

  // Escape closes the picker and restores focus to the toggle.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Tags" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tags 2" })).toBeFocused();

  // Assign one tag to Beta Storage.
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: /Beta Storage/ }).click();
  await page.getByRole("button", { name: "Tags 0" }).click();
  await page.getByRole("option", { name: /Systems/ }).click();
  await expect(page.getByRole("button", { name: "Tags 1" })).toBeVisible();

  // Multi-tag filtering: match all narrows to Alpha Systems; match any returns both.
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: /All tags/ }).click();
  await page.getByRole("option", { name: /Systems/ }).click();
  await expect(page.locator("a.paper-row")).toHaveCount(2);
  await page.getByRole("option", { name: /Deep Reading/ }).click();
  await expect(page.locator("a.paper-row")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Alpha Systems/ })).toBeVisible();

  await page.getByRole("radio", { name: "Any selected tag" }).click();
  await expect(page.locator("a.paper-row")).toHaveCount(2);
  expect(page.url()).toContain("tag_match=any");

  await page.reload();
  await expect(page.locator("a.paper-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Systems/ })).toBeVisible();

  // Manage tags from the filter entry point.
  await page.getByRole("link", { name: "Manage" }).click();
  await expect(page).toHaveURL(/\/tags$/);
  const systems = page.getByRole("link", { name: /Systems/ });
  await expect(systems).toBeVisible();
  await page.getByRole("searchbox", { name: "Search Library Tags" }).fill("deep");
  await expect(page.getByRole("link", { name: /Systems/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Deep Reading/ }).click();
  await expect(page.getByRole("heading", { name: "Deep Reading" })).toBeVisible();
  await expect(page.getByText("Library Tag / 1 paper")).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill("Focused Reading");
  await page.getByRole("button", { name: "Save tag" }).click();
  await expect(page.getByRole("heading", { name: "Focused Reading" })).toBeVisible();

  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete tag" }).click();
  await expect(page).toHaveURL(/\/tags$/);
  await expect(page.getByRole("link", { name: /Focused Reading/ })).toHaveCount(0);
});

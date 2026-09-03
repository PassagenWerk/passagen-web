import { expect, test } from "@playwright/test";

test("runs the packaged library, tag, collection, and reader workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Alpha Systems" })).toBeVisible();

  await page.getByText("Manage Library Tags").click();
  await page.getByRole("textbox", { name: "New Library Tag" }).fill("Priority");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Tag name: Priority" })).toBeVisible();

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

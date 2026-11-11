import { expect, test, type Page } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} appearance`, () => {
    test.use({ colorScheme, viewport: colorScheme === "dark" ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
    test("sign-in fits the viewport and follows the system theme", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Sign in to DocType" })).toBeVisible();
      await expect(page.locator("body")).toHaveCSS("background-color",
        colorScheme === "dark" ? "rgb(16, 19, 42)" : "rgb(245, 246, 252)");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  });
}

const owner = process.env.TEST_OWNER_EMAIL;
const recipient = process.env.TEST_RECIPIENT_EMAIL;
const ownerPassword = process.env.TEST_OWNER_PASSWORD;
const recipientPassword = process.env.TEST_RECIPIENT_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
}

test("share a document and merge live edits from two accounts", async ({ page, browser }) => {
  test.skip(!owner || !recipient || !ownerPassword || !recipientPassword, "Set both demo logins to run this test.");
  const secondSession = await browser.newContext();
  try {
    const secondPage = await secondSession.newPage();
    await signIn(page, owner!, ownerPassword!);
    await signIn(secondPage, recipient!, recipientPassword!);
    await page.getByRole("button", { name: "New document" }).click();
    await page.getByRole("menuitem", { name: /Word document/ }).click();
    const title = `Review notes ${Date.now()}`;
    await page.getByRole("textbox", { name: "Document title" }).fill(title);
    await page.getByRole("textbox", { name: "Document content" }).fill("A first draft");
    await page.getByLabel("Paragraph style").selectOption("2");
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "A first draft" })).toBeVisible();
    await secondPage.goto(page.url());
    await expect(secondPage.getByRole("alert")).toHaveText("This document is unavailable.");

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByLabel("Recipient email").fill(recipient!);
    await page.getByRole("button", { name: "Grant edit access" }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("can now edit");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await secondPage.goto("/");
    await secondPage.getByRole("link", { name: new RegExp(title) }).click();
    await expect(secondPage.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    const firstEditor = page.getByRole("textbox", { name: "Document content" });
    const secondEditor = secondPage.getByRole("textbox", { name: "Document content" });
    const recipientName = recipient!.split("@")[0];
    await expect(page.getByRole("img", { name: `${recipientName} is viewing` })).toBeVisible();
    await Promise.all([firstEditor.press("Home"), secondEditor.press("End")]);
    await expect(firstEditor.locator(".ProseMirror-yjs-cursor")).toContainText(recipientName);
    await Promise.all([page.keyboard.insertText("Owner: "), secondPage.keyboard.insertText(" and collaborator")]);
    await expect(page.getByRole("img", { name: `${recipientName} is typing` })).toBeVisible();
    for (const editor of [firstEditor, secondEditor]) {
      await expect(editor).toHaveText("Owner: A first draft and collaborator");
    }
    await page.reload();
    await expect(firstEditor).toHaveText("Owner: A first draft and collaborator");
    await secondSession.close();
    await expect(page.getByRole("img", { name: `${recipientName} is viewing` })).toHaveCount(0);
  } finally {
    await secondSession.close();
  }
});

test("import text, Markdown, and Word as editable documents", async ({ page }) => {
  test.skip(!owner || !ownerPassword, "Set the owner demo login to run this test.");
  await signIn(page, owner!, ownerPassword!);
  for (const file of [
    { name: "plain.txt", mimeType: "text/plain", buffer: Buffer.from("Plain document") },
    { name: "markdown.md", mimeType: "text/markdown", buffer: Buffer.from("# Markdown heading\n\n**Bold text**") },
    "tests/fixtures/example.docx",
  ]) {
    await page.getByLabel("Choose a document to import").setInputFiles(file);
    const editor = page.getByRole("textbox", { name: "Document content" });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    if (typeof file === "string") await expect(editor).toContainText("Word document");
    else if (file.name.endsWith(".md")) await expect(editor.locator("strong")).toHaveText("Bold text");
    else await expect(editor).toContainText("Plain document");
    await page.getByRole("button", { name: "Back to documents" }).click();
  }
});

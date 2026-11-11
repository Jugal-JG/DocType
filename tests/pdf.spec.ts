import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("printing puts text after a manual break on a new PDF page", async ({ page }) => {
  await page.setContent(`
    <header class="topbar">DocType</header>
    <main class="writing-area"><div class="paper"><div class="tiptap">
      <p>First page<span data-page-break></span>Second page</p>
    </div></div></main>
  `);
  const css = await readFile("app/globals.css", "utf8");
  await page.addStyleTag({ content: css.replace('@import "tailwindcss";', "") });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".topbar")).toBeHidden();
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
});

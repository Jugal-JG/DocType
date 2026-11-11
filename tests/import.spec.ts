import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { expect, test } from "@playwright/test";
import { fromBufferPromise } from "yauzl";
import { importDocument } from "../lib/import-document";
import { exportWord } from "../lib/export-word";
import { paperSizes } from "../lib/document-formats";

test("preserves plain text, keeps supported formatting, and removes unsafe markup", async () => {
  await expect(importDocument(Buffer.from("Hello\n<world>"), "txt")).resolves.toEqual({
    text: "Hello\n<world>",
  });
  const markdown = await importDocument(Buffer.from("# Heading\n\n**Bold** <script>alert(1)</script>"), "md");
  expect(markdown.html).toContain("<h1>Heading</h1>");
  expect(markdown.html).toContain("<strong>Bold</strong>");
  expect(markdown.html).not.toContain("alert(1)");

  const word = await importDocument(await readFile("tests/fixtures/example.docx"), "docx");
  expect(word.html).toContain("<strong>Word document</strong>");
  await expect(importDocument(Buffer.from("not a Word file"), "docx")).rejects.toThrow();
});

test("Word export uses the chosen paper size and round-trips manual page breaks", async () => {
  const file = await exportWord({ type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "First page" }] },
    { type: "paragraph", content: [{ type: "pageBreak" }, { type: "text", text: "Second page" }] },
  ] }, "Letter");
  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = await fromBufferPromise(buffer);
  let xml = "";
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName === "word/document.xml") {
        xml = await text(await zip.openReadStreamPromise(entry));
      }
    }
  } finally {
    zip.close();
  }
  expect(xml).toContain(`w:w="${paperSizes.Letter.width}"`);
  expect(xml).toContain(`w:h="${paperSizes.Letter.height}"`);
  expect(xml).toContain('<w:br w:type="page"/>');

  const imported = await importDocument(buffer, "docx");
  expect(imported.html).toContain("data-page-break");
  expect(imported.html).toContain("Second page");
});

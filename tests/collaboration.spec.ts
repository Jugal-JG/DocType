import { expect, test } from "@playwright/test";
import { Doc, XmlElement, XmlText } from "yjs";
import { documentContent, documentField, encodeDocument, mergeDocument, seedDocument } from "../lib/collaboration";

test("existing formatted content survives concurrent edits and reopening", () => {
  const original = seedDocument({ type: "doc", content: [{
    type: "heading", attrs: { level: 2 },
    content: [{ type: "text", text: "Review", marks: [{ type: "bold" }] }],
  }] });
  const alice = new Doc();
  const bob = new Doc();
  for (const replica of [alice, bob]) mergeDocument(replica, encodeDocument(original));
  const text = (doc: Doc) => (doc.getXmlFragment(documentField).get(0) as XmlElement).get(0) as XmlText;
  text(alice).insert(0, "Alice: ");
  text(bob).insert(6, " by Bob");
  mergeDocument(alice, encodeDocument(bob));
  mergeDocument(bob, encodeDocument(alice));

  const reopened = new Doc();
  mergeDocument(reopened, encodeDocument(bob));
  expect(text(reopened).toString()).toContain("Alice: ");
  expect(text(reopened).toString()).toContain(" by Bob");
  expect(documentContent(reopened)).toEqual(documentContent(alice));
  expect(documentContent(reopened).content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
  expect(JSON.stringify(documentContent(reopened))).toContain('"type":"bold"');
  for (const document of [original, alice, bob, reopened]) document.destroy();
});

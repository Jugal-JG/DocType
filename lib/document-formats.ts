export const formats = { docx: "Word document", md: "Markdown", txt: "Plain text" };
export type FileFormat = keyof typeof formats;
export const fileFormats = Object.keys(formats) as FileFormat[];

export const paperSizes = {
  A3: { width: 16838, height: 23811 },
  A4: { width: 11906, height: 16838 },
  A5: { width: 8391, height: 11906 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
};
export type PaperSize = keyof typeof paperSizes;
export const defaultPaperSize: PaperSize = "A4";

export function downloadName(title: string, format: FileFormat) {
  const stem = title.trim().replace(/\.(docx|md|txt)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "");
  return `${stem || "Untitled document"}.${format}`;
}

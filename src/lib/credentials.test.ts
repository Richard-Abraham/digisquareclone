import { describe, it, expect } from "vitest";
import { checkFile, safeFileName, storagePath, MAX_FILE_BYTES } from "./credentials";

describe("checkFile", () => {
  it("accepts application/pdf at 1 KB", () => {
    expect(checkFile({ mimeType: "application/pdf", sizeBytes: 1024, fileName: "a.pdf" }).okFile).toBe(true);
  });

  it("accepts the .docx mime type", () => {
    expect(checkFile({
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 1024,
      fileName: "a.docx",
    }).okFile).toBe(true);
  });

  it("rejects text/plain", () => {
    const res = checkFile({ mimeType: "text/plain", sizeBytes: 1024, fileName: "a.txt" });
    expect(res.okFile).toBe(false);
    expect(res.reason).toMatch(/PDF|Word/);
  });

  it("rejects image/png", () => {
    const res = checkFile({ mimeType: "image/png", sizeBytes: 1024, fileName: "a.png" });
    expect(res.okFile).toBe(false);
  });

  it("rejects a 0-byte file", () => {
    const res = checkFile({ mimeType: "application/pdf", sizeBytes: 0, fileName: "a.pdf" });
    expect(res.okFile).toBe(false);
    expect(res.reason).toBe("File is empty");
  });

  it("rejects a file of MAX_FILE_BYTES + 1", () => {
    const res = checkFile({ mimeType: "application/pdf", sizeBytes: MAX_FILE_BYTES + 1, fileName: "a.pdf" });
    expect(res.okFile).toBe(false);
    expect(res.reason).toMatch(/MB/);
  });

  it("accepts a file of exactly MAX_FILE_BYTES (boundary)", () => {
    expect(checkFile({ mimeType: "application/pdf", sizeBytes: MAX_FILE_BYTES, fileName: "a.pdf" }).okFile).toBe(true);
  });

  it("rejects an empty filename", () => {
    const res = checkFile({ mimeType: "application/pdf", sizeBytes: 1024, fileName: "   " });
    expect(res.okFile).toBe(false);
  });
});

describe("safeFileName", () => {
  it('safeFileName("../../etc/passwd") strips separators and leading dots', () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
  });

  it('safeFileName("C:\\\\Users\\\\me\\\\creds.pdf") strips separators', () => {
    expect(safeFileName("C:\\Users\\me\\creds.pdf")).toBe("creds.pdf");
  });

  it('safeFileName("my creds (final).pdf") strips parens but keeps the extension', () => {
    const result = safeFileName("my creds (final).pdf");
    expect(result).not.toContain("(");
    expect(result).not.toContain(")");
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it('safeFileName("...") never returns empty', () => {
    expect(safeFileName("...")).toBe("file");
  });

  it("truncates a 300-character name to 120 characters", () => {
    const longName = "a".repeat(300) + ".pdf";
    expect(safeFileName(longName).length).toBe(120);
  });
});

describe("storagePath", () => {
  it('storagePath("ws1", "cred1", "a.pdf") builds the expected path', () => {
    expect(storagePath("ws1", "cred1", "a.pdf")).toBe("ws1/cred1/a.pdf");
  });

  it("keeps a traversal attempt inside the credential's prefix", () => {
    expect(storagePath("ws1", "cred1", "../escape.pdf")).toBe("ws1/cred1/escape.pdf");
  });
});

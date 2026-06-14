import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  getSupportedMimeType,
  stripBase64DataUrl,
  validateExtractionFile,
  validateExtractionFiles,
} from "../src/ui/fileUpload.js";

describe("validateExtractionFile", () => {
  it("接受 PDF 與圖片 MIME type", () => {
    expect(
      validateExtractionFile({ name: "lesson.pdf", type: "application/pdf", size: 1024 }),
    ).toMatchObject({ ok: true, mimeType: "application/pdf" });
    expect(
      validateExtractionFile({ name: "photo.jpg", type: "image/jpeg", size: 1024 }),
    ).toMatchObject({ ok: true, mimeType: "image/jpeg" });
  });

  it("可由副檔名補推 MIME type", () => {
    expect(getSupportedMimeType({ name: "scan.png", type: "" })).toBe("image/png");
    expect(getSupportedMimeType({ name: "scan.webp", type: "" })).toBe("image/webp");
  });

  it("拒絕超過大小上限的檔案", () => {
    const result = validateExtractionFile(
      { name: "huge.pdf", type: "application/pdf", size: 20 },
      10,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("檔案過大");
  });

  it("拒絕不支援格式並提示另存 PDF", () => {
    const result = validateExtractionFile({
      name: "lesson.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("不支援");
    expect(result.error).toContain("另存成 PDF");
  });
});

describe("validateExtractionFiles", () => {
  it("接受多個支援格式並加總大小", () => {
    const result = validateExtractionFiles([
      { name: "lesson.pdf", type: "application/pdf", size: 1024 },
      { name: "scan.png", type: "image/png", size: 2048 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.totalBytes).toBe(3072);
  });

  it("總大小超過上限時回可讀錯誤", () => {
    const result = validateExtractionFiles(
      [
        { name: "a.pdf", type: "application/pdf", size: 8 },
        { name: "b.pdf", type: "application/pdf", size: 8 },
      ],
      10,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("檔案總和過大");
  });

  it("多檔中有不支援格式時回錯誤", () => {
    const result = validateExtractionFiles([
      { name: "lesson.pdf", type: "application/pdf", size: 1024 },
      { name: "notes.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1024 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("不支援");
  });
});

describe("stripBase64DataUrl", () => {
  it("剝除 data URL 前綴", () => {
    expect(stripBase64DataUrl("data:image/png;base64,QUJDRA==")).toEqual({
      mimeType: "image/png",
      data: "QUJDRA==",
    });
  });

  it("純 base64 原樣清理空白", () => {
    expect(stripBase64DataUrl(" QUJD\nRA== ")).toEqual({
      mimeType: "",
      data: "QUJDRA==",
    });
  });
});

describe("formatFileSize", () => {
  it("格式化 KB 與 MB", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

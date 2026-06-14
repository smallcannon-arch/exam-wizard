import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  getSupportedMimeType,
  stripBase64DataUrl,
  validateExtractionFile,
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

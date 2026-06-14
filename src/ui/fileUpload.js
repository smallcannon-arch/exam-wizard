export const MAX_EXTRACTION_FILE_BYTES = 18 * 1024 * 1024;

export const SUPPORTED_EXTRACTION_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const EXTENSION_TO_MIME_TYPE = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getExtension(name = "") {
  const value = String(name).toLowerCase();
  const dotIndex = value.lastIndexOf(".");

  return dotIndex >= 0 ? value.slice(dotIndex) : "";
}

export function getSupportedMimeType(file = {}) {
  const explicitType = String(file.type || file.mimeType || "").trim().toLowerCase();

  if (SUPPORTED_EXTRACTION_MIME_TYPES.includes(explicitType)) {
    return explicitType;
  }

  return EXTENSION_TO_MIME_TYPE[getExtension(file.name)] ?? "";
}

export function formatFileSize(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return "0 MB";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateExtractionFile(file, maxBytes = MAX_EXTRACTION_FILE_BYTES) {
  if (!file) {
    return {
      ok: false,
      error: "請先選擇要上傳的 PDF 或圖片檔。",
    };
  }

  const mimeType = getSupportedMimeType(file);

  if (!mimeType) {
    return {
      ok: false,
      error: "不支援的檔案格式，請改傳 PDF、JPG、PNG 或 WebP；若是 Word 檔，請先另存成 PDF。",
    };
  }

  if (Number(file.size) > maxBytes) {
    return {
      ok: false,
      error:
        "檔案過大（上限約 18MB），請改傳單一課次/單元的 PDF 或截圖，或改用貼上文字。",
    };
  }

  return {
    ok: true,
    mimeType,
  };
}

export function stripBase64DataUrl(data) {
  const value = String(data ?? "").trim();
  const match = value.match(/^data:([^;,]+);base64,(.*)$/is);

  if (!match) {
    return {
      mimeType: "",
      data: value.replace(/\s+/g, ""),
    };
  }

  return {
    mimeType: match[1].toLowerCase(),
    data: match[2].replace(/\s+/g, ""),
  };
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

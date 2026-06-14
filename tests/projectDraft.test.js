import { describe, expect, it } from "vitest";
import {
  VERSION_OPTIONS,
  createDefaultProjectDraft,
  normalizeProjectDraftData,
  validateProjectDraftData,
} from "../src/ui/projectDraft.js";

describe("projectDraft", () => {
  it("版本選單預設為空值，畫面可顯示請選擇", () => {
    const draft = createDefaultProjectDraft();

    expect(draft.version).toBe("");
    expect(VERSION_OPTIONS).toEqual(["翰林", "康軒", "南一", "自編教材", "其他"]);
  });

  it("未選版本時不可前進並提示請選擇版本", () => {
    const errors = validateProjectDraftData({
      ...createDefaultProjectDraft(),
      grade: "5",
      subject: "自然",
      scope: "第一單元",
      version: "",
    });

    expect(errors.version).toBe("請選擇版本。");
  });

  it("其他版本維持自填必填邏輯", () => {
    const errors = validateProjectDraftData({
      ...createDefaultProjectDraft(),
      grade: "5",
      subject: "自然",
      scope: "第一單元",
      version: "其他",
      versionOther: "",
    });

    expect(errors.version).toBeUndefined();
    expect(errors.versionOther).toBe("請輸入版本名稱。");
  });

  it("正常版本可正規化成 project.version 與 publisher", () => {
    const project = normalizeProjectDraftData({
      ...createDefaultProjectDraft(),
      grade: "5",
      subject: "自然",
      scope: "第一單元",
      version: "翰林",
    });

    expect(project.version).toBe("翰林");
    expect(project.publisher).toBe("翰林");
    expect(project.versionChoice).toBe("翰林");
  });
});

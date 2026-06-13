import { describe, expect, it } from "vitest";
import {
  OBJECTIVE_EXTRACTION_OUTPUT_FORMAT,
  OBJECTIVE_EXTRACTION_RULES,
  buildObjectiveExtractionPrompt,
} from "../src/core/buildExtractionPrompt.js";

const project = {
  grade: 5,
  subject: "自然",
  publisher: "翰林",
  scope: "第一單元到第三單元",
};
const newNumberingRule =
  "目標編號一律依『小單元編號-流水號』格式編成：取小單元名稱開頭的編號（如『4-2 動物的生存之道』取 4-2），同一小單元內的目標依出現順序編為 4-2-1、4-2-2。小單元名稱無編號時，以單元順序自編（第一單元第一課為 1-1）。**不得**使用教案中的連續流水號（如 17、18、19）作為目標編號；教案若有原始編號，請於回覆末以『註：』列出新舊編號對照。";

describe("buildObjectiveExtractionPrompt", () => {
  it("正確嵌入年級與領域並產生角色任務", () => {
    const result = buildObjectiveExtractionPrompt({ project });

    expect(result.ok).toBe(true);
    expect(result.prompt).toContain(
      "你是國小5年級自然教材分析助手。請閱讀我上傳的教案或課本檔案，擷取本次考試範圍內的學習目標。",
    );
    expect(result.prompt).toContain("教材版本：翰林");
    expect(result.prompt).toContain("本次考試範圍：第一單元到第三單元");
  });

  it("依序包含七句擷取規則", () => {
    const result = buildObjectiveExtractionPrompt({ project });
    const indexes = OBJECTIVE_EXTRACTION_RULES.map((rule) => {
      expect(result.prompt).toContain(rule);
      return result.prompt.indexOf(rule);
    });

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("明確要求鎖定學習目標層級並排除核心素養與學習重點代碼", () => {
    const result = buildObjectiveExtractionPrompt({ project });

    expect(result.prompt).toContain("請擷取標題為『學習目標』之段落內容");
    expect(result.prompt).toContain("依序改用『教學目標』『單元目標』段落");
    expect(result.prompt).toContain("**不得**將『核心素養』『學習表現』『學習內容』『議題融入』");
    expect(result.prompt).toContain("pc-III-2、INc-III-14、自-E-A1");
  });

  it("包含欄位說明與 TSV 輸出格式限制", () => {
    const result = buildObjectiveExtractionPrompt({ project });

    expect(result.prompt).toContain("目標編號、大單元名稱、小單元（課）名稱、學習目標文字、授課節數");
    expect(result.prompt).toContain(OBJECTIVE_EXTRACTION_OUTPUT_FORMAT);
    expect(result.prompt).toContain(
      "授課節數欄只填數字（如 1 或 0.5），不要加『節』等單位文字，也不要使用中文數字。",
    );
  });

  it("要求註明來源段落與頁次，方便教師回查", () => {
    const result = buildObjectiveExtractionPrompt({ project });

    expect(result.prompt).toContain(
      "回覆末的『註：』需說明：學習目標擷取自檔案的哪個段落（段落標題與頁次），以利教師回查原文核對。",
    );
  });

  it("目標編號規則改為小單元層級編號且不再沿用原始流水號", () => {
    const result = buildObjectiveExtractionPrompt({ project });

    expect(result.prompt).toContain(newNumberingRule);
    expect(result.prompt).not.toContain("優先沿用教案原有編號");
  });

  it("缺年級時回傳可讀錯誤", () => {
    const result = buildObjectiveExtractionPrompt({
      project: { subject: "自然" },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("project.grade（年級）為必填。");
  });

  it("缺領域時回傳可讀錯誤", () => {
    const result = buildObjectiveExtractionPrompt({
      project: { grade: 5 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("project.subject（領域）為必填。");
  });
});

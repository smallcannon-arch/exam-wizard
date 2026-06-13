import { describe, expect, it } from "vitest";
import { auditQuality } from "../src/core/auditQuality.js";

function createItem(overrides = {}) {
  return {
    itemId: "A-01",
    questionType: "選擇題",
    options: ["甲", "乙", "丙", "丁"],
    answer: "1",
    explanation: "解析文字",
    discriminationPrediction: 0.35,
    ...overrides,
  };
}

describe("auditQuality", () => {
  it("全數通過時回傳 pass", () => {
    const result = auditQuality({
      items: [createItem({ itemId: "A-01" }), createItem({ itemId: "A-02" })],
    });

    expect(result.severity).toBe("pass");
    expect(result.itemResults).toEqual([
      { itemId: "A-01", status: "pass", issues: [] },
      { itemId: "A-02", status: "pass", issues: [] },
    ]);
    expect(result.messages).toEqual(["所有題目的品質欄位檢核通過。"]);
  });

  it("鑑別度 0.1 低於門檻時該題 error", () => {
    const result = auditQuality({
      items: [createItem({ discriminationPrediction: 0.1 })],
    });

    expect(result.severity).toBe("error");
    expect(result.itemResults[0].status).toBe("error");
    expect(result.itemResults[0].issues).toContain(
      "預估鑑別度 0.1 低於 0.2，請調整題目品質或替換題目。",
    );
  });

  it("鑑別度缺漏時該題 warning", () => {
    const { discriminationPrediction, ...itemWithoutPrediction } = createItem();
    const result = auditQuality({ items: [itemWithoutPrediction] });

    expect(result.severity).toBe("warning");
    expect(result.itemResults[0]).toEqual({
      itemId: "A-01",
      status: "warning",
      issues: ["未填預估鑑別度，請命題教師補估。"],
    });
  });

  it("answer 缺漏時該題 error", () => {
    const result = auditQuality({
      items: [createItem({ answer: "" })],
    });

    expect(result.severity).toBe("error");
    expect(result.itemResults[0].issues).toContain(
      "answer 欄位不可空白，請補上標準答案。",
    );
  });

  it("選擇題僅 2 個選項時該題 error", () => {
    const result = auditQuality({
      items: [createItem({ options: ["甲", "乙"] })],
    });

    expect(result.severity).toBe("error");
    expect(result.itemResults[0].issues).toContain(
      "選擇題 options 至少需要 3 個選項。",
    );
  });

  it("多題混合時整體 severity 取最嚴重者，且順序與輸入一致", () => {
    const { discriminationPrediction, ...warningItem } = createItem({
      itemId: "A-02",
    });
    const result = auditQuality({
      items: [
        createItem({ itemId: "A-01" }),
        warningItem,
        createItem({ itemId: "A-03", answer: "" }),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.itemResults.map((item) => item.itemId)).toEqual([
      "A-01",
      "A-02",
      "A-03",
    ]);
    expect(result.itemResults.map((item) => item.status)).toEqual([
      "pass",
      "warning",
      "error",
    ]);
    expect(result.messages).toEqual([
      "題目品質檢核發現 1 題 error、1 題 warning，請依 itemResults 逐題修正。",
    ]);
  });
});

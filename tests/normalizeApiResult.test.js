import { describe, expect, it } from "vitest";
import { normalizeApiResult } from "../src/ui/apiClient.js";

const objective = {
  objectiveId: "4-1-1",
  unitName: "四、揭祕動物的世界",
  lessonName: "4-1 動物如何生存",
  text: "能說明動物身體構造與環境的關係。",
  periodCount: 2,
};

const item = {
  itemId: "A-01",
  groupId: "",
  questionType: "選擇題",
  competencyType: "一般題",
  stimulus: "",
  question: "下列哪一項最能幫助動物適應環境？",
  options: ["保護色", "固定不動", "不需食物"],
  answer: "1",
  explanation: "保護色可降低被發現的機率。",
  objectiveIds: ["4-1-1"],
  score: 4,
  estimatedTimeSeconds: 60,
  discriminationPrediction: 0.3,
  chineseDimension: null,
  reviewFlags: [],
};

describe("normalizeApiResult", () => {
  it("擷取成功時回傳學習目標與 notices", () => {
    expect(
      normalizeApiResult(
        { ok: true, objectives: [objective], notices: ["註：需人工確認節數。"] },
        "objectives",
      ),
    ).toEqual({
      ok: true,
      objectives: [objective],
      notices: ["註：需人工確認節數。"],
    });
  });

  it("出題成功時回傳 items", () => {
    expect(normalizeApiResult({ ok: true, items: [item] }, "items")).toEqual({
      ok: true,
      items: [item],
    });
  });

  it("ok false 時回傳後端錯誤訊息", () => {
    expect(
      normalizeApiResult({ ok: false, error: "AI 服務暫時無法使用。" }, "items"),
    ).toEqual({
      ok: false,
      error: "AI 服務暫時無法使用。",
    });
  });

  it("UPSTREAM_TIMEOUT 轉成分批生成失敗提示", () => {
    expect(
      normalizeApiResult({ ok: false, code: "UPSTREAM_TIMEOUT" }, "items"),
    ).toEqual({
      ok: false,
      error: "AI 生成超時或服務忙碌，已分批仍失敗，可改用手動出題指令。",
    });
  });

  it("缺 objectives 欄位時回傳可讀錯誤", () => {
    const result = normalizeApiResult({ ok: true }, "objectives");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("objectives 不是陣列時回傳可讀錯誤", () => {
    const result = normalizeApiResult(
      { ok: true, objectives: { objectiveId: "4-1-1" } },
      "objectives",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("items 缺 options 時回傳第幾題錯誤", () => {
    const { options, ...invalidItem } = item;
    const result = normalizeApiResult({ ok: true, items: [invalidItem] }, "items");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("第 1 題");
  });
});

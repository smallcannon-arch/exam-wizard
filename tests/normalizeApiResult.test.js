import { describe, expect, it } from "vitest";
import { normalizeApiResult } from "../src/ui/apiClient.js";

const objective = {
  objectiveId: "4-1-1",
  unitName: "四、揭祕動物的世界",
  lessonName: "4-1 動物如何求生",
  text: "學生能說明動物取得食物與避敵的方式。",
  periodCount: 2,
};

const item = {
  itemId: "A-01",
  groupId: "",
  questionType: "選擇題",
  competencyType: "一般題",
  stimulus: "",
  question: "哪一項符合觀察紀錄？",
  options: ["甲", "乙", "丙"],
  answer: "1",
  explanation: "依情境判斷。",
  objectiveIds: ["4-1-1"],
  score: 4,
  estimatedTimeSeconds: 60,
  discriminationPrediction: 0.3,
  chineseDimension: null,
  reviewFlags: [],
};

describe("normalizeApiResult", () => {
  it("正規化學習目標擷取成功回應", () => {
    expect(
      normalizeApiResult(
        { ok: true, objectives: [objective], notices: ["需人工核對節數"] },
        "objectives",
      ),
    ).toEqual({
      ok: true,
      objectives: [objective],
      notices: ["需人工核對節數"],
    });
  });

  it("正規化題庫生成成功回應", () => {
    expect(normalizeApiResult({ ok: true, items: [item] }, "items")).toEqual({
      ok: true,
      items: [item],
    });
  });

  it("後端回 ok false 時保留可讀錯誤", () => {
    expect(
      normalizeApiResult({ ok: false, error: "AI 服務暫時無法使用。" }, "items"),
    ).toEqual({
      ok: false,
      error: "AI 服務暫時無法使用。",
    });
  });

  it("缺少 objectives 欄位時回可讀錯誤", () => {
    const result = normalizeApiResult({ ok: true }, "objectives");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("objectives 非陣列時回可讀錯誤", () => {
    const result = normalizeApiResult(
      { ok: true, objectives: { objectiveId: "4-1-1" } },
      "objectives",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("items 缺 options 時回可讀錯誤", () => {
    const { options, ...invalidItem } = item;
    const result = normalizeApiResult({ ok: true, items: [invalidItem] }, "items");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("第 1 題");
  });
});

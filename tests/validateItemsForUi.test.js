import { describe, expect, it } from "vitest";
import {
  normalizeItemsForAudit,
  validateItemForUi,
} from "../src/ui/validateItemsForUi.js";

function item(overrides = {}) {
  return {
    itemId: "A-01",
    groupId: "",
    questionType: "選擇題",
    competencyType: "一般題",
    stimulus: "",
    question: "原創題幹",
    options: ["甲", "乙", "丙"],
    answer: "1",
    explanation: "原創解析",
    objectiveIds: ["1-1-1"],
    score: 5,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    chineseDimension: null,
    reviewFlags: [],
    ...overrides,
  };
}

describe("validateItemForUi", () => {
  it("一般選擇題少於 3 個選項會被擋下", () => {
    const result = validateItemForUi(item({ options: ["甲", "乙"] }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("選擇題的選項至少需 3 個。");
  });

  it("題組簡答小題不要求選項數", () => {
    const result = validateItemForUi(
      item({
        groupId: "G-01",
        questionType: "簡答題",
        options: [],
      }),
    );

    expect(result.valid).toBe(true);
  });

  it("題組填充小題不要求選項數", () => {
    const result = validateItemForUi(
      item({
        groupId: "G-01",
        questionType: "填充題",
        options: [],
      }),
    );

    expect(result.valid).toBe(true);
  });

  it("題組小題若被 AI 標為選擇題但無選項，送審檢核前會轉成簡答題", () => {
    const [normalized] = normalizeItemsForAudit([
      item({
        groupId: "G-01",
        questionType: "選擇題",
        options: [],
      }),
    ]);

    expect(normalized.questionType).toBe("簡答題");
  });
});

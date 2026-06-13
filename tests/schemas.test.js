import { describe, expect, it } from "vitest";
import { validateItem, validateObjective } from "../src/core/schemas.js";

const validObjective = {
  objectiveId: "1-2-3",
  unitName: "一、探索星空的奧祕",
  lessonName: "1-1 星空大解密",
  text: "學會操作星座盤，能以方位和高度角描述星星的位置。",
  periodCount: 5,
};

const validItem = {
  itemId: "A-03",
  groupId: "G-01",
  questionType: "選擇題",
  competencyType: "素養題組",
  stimulus: "題組引文或情境描述。",
  question: "題幹文字",
  options: ["選項一", "選項二", "選項三", "選項四"],
  answer: "2",
  explanation: "解析文字",
  objectiveIds: ["1-2-3"],
  score: 4,
  estimatedTimeSeconds: 90,
  discriminationPrediction: 0.35,
  chineseDimension: null,
  reviewFlags: [],
};

describe("validateObjective", () => {
  it("接受完整且合法的學習目標", () => {
    expect(validateObjective(validObjective)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("接受 periodCount 為正數的學習目標", () => {
    const result = validateObjective({
      ...validObjective,
      objectiveId: "2-1-1",
      periodCount: 1,
    });

    expect(result.valid).toBe(true);
  });

  it("拒絕缺少 objectiveId 的學習目標", () => {
    const result = validateObjective({
      ...validObjective,
      objectiveId: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("objectiveId 欄位必須是非空白字串。");
  });

  it("拒絕 periodCount 不大於 0 的學習目標", () => {
    const result = validateObjective({
      ...validObjective,
      periodCount: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("periodCount 欄位必須是大於 0 的數字。");
  });
});

describe("validateItem", () => {
  it("接受完整且合法的非國語科試題", () => {
    expect(validateItem(validItem, { isChinese: false })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("接受完整且合法的國語科試題", () => {
    const result = validateItem(
      {
        ...validItem,
        chineseDimension: "reading_writing",
      },
      { isChinese: true },
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("接受未填 discriminationPrediction 的試題", () => {
    const { discriminationPrediction, ...itemWithoutPrediction } = validItem;

    expect(
      validateItem(itemWithoutPrediction, { isChinese: false }).valid,
    ).toBe(true);
  });

  it("拒絕沒有 objectiveIds 的試題", () => {
    const result = validateItem(
      {
        ...validItem,
        objectiveIds: [],
      },
      { isChinese: false },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("objectiveIds 欄位至少需要 1 筆資料。");
  });

  it("拒絕 score 不大於 0 的試題", () => {
    const result = validateItem(
      {
        ...validItem,
        score: -1,
      },
      { isChinese: false },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("score 欄位必須是大於 0 的數字。");
  });

  it("拒絕超出範圍的 discriminationPrediction", () => {
    const result = validateItem(
      {
        ...validItem,
        discriminationPrediction: 1.2,
      },
      { isChinese: false },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "discriminationPrediction 欄位必須介於 0 與 1 之間。",
    );
  });

  it("拒絕國語科未填 chineseDimension 的試題", () => {
    const result = validateItem(validItem, { isChinese: true });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "chineseDimension 欄位為國語科必填，且只能是 word_phrase、sentence_grammar 或 reading_writing。",
    );
  });
});

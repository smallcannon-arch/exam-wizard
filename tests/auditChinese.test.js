import { describe, expect, it } from "vitest";
import { auditChinese } from "../src/core/auditChinese.js";
import { CHINESE_DIMENSIONS } from "../src/core/config/chineseDimensions.js";

function createItem(itemId, chineseDimension, score) {
  return {
    itemId,
    groupId: "",
    questionType: "選擇題",
    competencyType: "國語文理解",
    stimulus: "",
    question: `${itemId} 原創題幹`,
    options: ["甲", "乙", "丙", "丁"],
    answer: "1",
    explanation: "原創解析",
    objectiveIds: ["O-1"],
    score,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    chineseDimension,
    reviewFlags: [],
  };
}

describe("auditChinese", () => {
  it("高年級 20/30/50 完全吻合時回傳 pass", () => {
    const result = auditChinese({
      grade: 5,
      items: [
        createItem("A-01", "word_phrase", 20),
        createItem("A-02", "sentence_grammar", 30),
        createItem("A-03", "reading_writing", 50),
      ],
    });

    expect(result.severity).toBe("pass");
    expect(result.band).toBe("high");
    expect(result.dimensionResults).toEqual([
      {
        dimension: "word_phrase",
        label: "字詞短語",
        expectedRatio: 0.2,
        actualScore: 20,
        actualRatio: 0.2,
        diffPercentagePoints: 0,
        status: "pass",
      },
      {
        dimension: "sentence_grammar",
        label: "句式語法",
        expectedRatio: 0.3,
        actualScore: 30,
        actualRatio: 0.3,
        diffPercentagePoints: 0,
        status: "pass",
      },
      {
        dimension: "reading_writing",
        label: "段篇讀寫",
        expectedRatio: 0.5,
        actualScore: 50,
        actualRatio: 0.5,
        diffPercentagePoints: 0,
        status: "pass",
      },
    ]);
  });

  it("高年級段篇讀寫僅 40% 時回傳 warning", () => {
    const result = auditChinese({
      grade: 6,
      items: [
        createItem("A-01", "word_phrase", 25),
        createItem("A-02", "sentence_grammar", 35),
        createItem("A-03", "reading_writing", 40),
      ],
    });

    expect(result.severity).toBe("warning");
    expect(result.dimensionResults[2]).toMatchObject({
      dimension: "reading_writing",
      actualScore: 40,
      actualRatio: 0.4,
      diffPercentagePoints: -10,
      status: "warning",
    });
  });

  it("低年級比例吻合時回傳 pass", () => {
    const result = auditChinese({
      grade: 2,
      items: [
        createItem("A-01", "word_phrase", 50),
        createItem("A-02", "sentence_grammar", 30),
        createItem("A-03", "reading_writing", 20),
      ],
    });

    expect(result.severity).toBe("pass");
    expect(result.band).toBe("low");
  });

  it("中年級比例吻合時回傳 pass", () => {
    const result = auditChinese({
      grade: 4,
      items: [
        createItem("A-01", "word_phrase", 30),
        createItem("A-02", "sentence_grammar", 50),
        createItem("A-03", "reading_writing", 20),
      ],
    });

    expect(result.severity).toBe("pass");
    expect(result.band).toBe("mid");
  });

  it("某向度完全沒題時回傳 error", () => {
    const result = auditChinese({
      grade: 5,
      items: [
        createItem("A-01", "word_phrase", 50),
        createItem("A-02", "sentence_grammar", 50),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.dimensionResults[2]).toMatchObject({
      dimension: "reading_writing",
      actualScore: 0,
      actualRatio: 0,
      status: "error",
    });
    expect(result.messages).toContain("「段篇讀寫」向度未配置任何題目分數。");
  });

  it("一題缺 chineseDimension 時回傳 warning 並指出 itemId", () => {
    const { chineseDimension, ...missingDimensionItem } = createItem(
      "B-02",
      "word_phrase",
      5,
    );
    const result = auditChinese({
      grade: 5,
      items: [
        createItem("A-01", "word_phrase", 20),
        createItem("A-02", "sentence_grammar", 30),
        createItem("A-03", "reading_writing", 45),
        missingDimensionItem,
      ],
    });

    expect(result.severity).toBe("warning");
    expect(result.missingDimensionItemIds).toEqual(["B-02"]);
    expect(result.messages).toContain(
      "試題 B-02 缺少 chineseDimension，或其值不在 word_phrase、sentence_grammar、reading_writing 範圍內。",
    );
  });

  it("grade 為 7 時回傳 error", () => {
    const result = auditChinese({
      grade: 7,
      items: [createItem("A-01", "word_phrase", 100)],
    });

    expect(result.severity).toBe("error");
    expect(result.band).toBeNull();
    expect(result.dimensionResults).toEqual([]);
    expect(result.messages).toContain("grade 欄位必須是 1～6 的年級。");
  });

  it("自訂容差 0 時，差 1 個百分點即 warning", () => {
    const result = auditChinese({
      grade: 5,
      items: [
        createItem("A-01", "word_phrase", 21),
        createItem("A-02", "sentence_grammar", 29),
        createItem("A-03", "reading_writing", 50),
      ],
      options: { tolerancePercentagePoints: 0 },
    });

    expect(result.severity).toBe("warning");
    expect(result.dimensionResults[0]).toMatchObject({
      dimension: "word_phrase",
      actualRatio: 0.21,
      diffPercentagePoints: 1,
      status: "warning",
    });
  });

  it("設定檔標示三大向度與年段比例", () => {
    expect(Object.keys(CHINESE_DIMENSIONS.labels)).toEqual([
      "word_phrase",
      "sentence_grammar",
      "reading_writing",
    ]);
    expect(CHINESE_DIMENSIONS.gradeToBand[1]).toBe("low");
    expect(CHINESE_DIMENSIONS.gradeToBand[4]).toBe("mid");
    expect(CHINESE_DIMENSIONS.gradeToBand[6]).toBe("high");
  });
});

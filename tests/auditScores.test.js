import { describe, expect, it } from "vitest";
import { auditScores } from "../src/core/auditScores.js";

function createObjectives(unitScores) {
  return unitScores.map((unit, index) => ({
    objectiveId: `O-${index + 1}`,
    unitName: unit.name,
    lessonName: `${unit.name}課程`,
    text: `${unit.name}學習目標`,
    periodCount: 1,
  }));
}

function createAllocations(unitScores) {
  return unitScores.map((unit, index) => ({
    id: `U${index + 1}`,
    name: unit.name,
    periodCount: 1,
    suggestedScore: unit.score,
  }));
}

function createItem(itemId, objectiveIds, score) {
  return {
    itemId,
    groupId: "",
    questionType: "選擇題",
    competencyType: "概念理解",
    stimulus: "",
    question: `${itemId} 原創題幹`,
    options: ["甲", "乙", "丙", "丁"],
    answer: "1",
    explanation: "原創解析",
    objectiveIds,
    score,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    chineseDimension: null,
    reviewFlags: [],
  };
}

const baseUnits = [
  { name: "一、探索星空的奧祕", score: 40 },
  { name: "二、觀察天氣的變化", score: 35 },
  { name: "三、認識水溶液", score: 25 },
];
const baseAllocations = createAllocations(baseUnits);
const baseObjectives = createObjectives(baseUnits);

describe("auditScores", () => {
  it("各單元配分完全一致、總分 100、無跨單元題時回傳 pass", () => {
    const result = auditScores({
      allocations: baseAllocations,
      objectives: baseObjectives,
      items: [
        createItem("A-01", ["O-1"], 40),
        createItem("B-01", ["O-2"], 35),
        createItem("C-01", ["O-3"], 25),
      ],
    });

    expect(result.severity).toBe("pass");
    expect(result.totalScoreActual).toBe(100);
    expect(result.unitResults.map((unit) => unit.status)).toEqual([
      "pass",
      "pass",
      "pass",
    ]);
    expect(result.crossUnitItemIds).toEqual([]);
  });

  it("某單元 diff 為 1 時，該單元與整體皆為 error", () => {
    const result = auditScores({
      allocations: baseAllocations,
      objectives: baseObjectives,
      items: [
        createItem("A-01", ["O-1"], 41),
        createItem("B-01", ["O-2"], 34),
        createItem("C-01", ["O-3"], 25),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.unitResults[0]).toMatchObject({
      unitName: "一、探索星空的奧祕",
      actualScore: 41,
      suggestedScore: 40,
      diff: 1,
      status: "error",
    });
  });

  it("某單元 actualScore 為 0 時回傳 error", () => {
    const result = auditScores({
      allocations: baseAllocations,
      objectives: baseObjectives,
      items: [
        createItem("A-01", ["O-1"], 40),
        createItem("B-01", ["O-2"], 60),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.unitResults[2]).toMatchObject({
      unitName: "三、認識水溶液",
      actualScore: 0,
      suggestedScore: 25,
      status: "error",
    });
  });

  it("全卷總分 98 時回傳 error，messages 指出差 2 分", () => {
    const result = auditScores({
      allocations: baseAllocations,
      objectives: baseObjectives,
      items: [
        createItem("A-01", ["O-1"], 40),
        createItem("B-01", ["O-2"], 35),
        createItem("C-01", ["O-3"], 23),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.totalScoreActual).toBe(98);
    expect(result.messages).toContain("全卷總分為 98 分，應為 100 分，差 2 分。");
  });

  it("跨單元題平均分攤後完全一致時，回傳 warning 並列出 itemId", () => {
    const allocations = createAllocations([
      { name: "一、探索星空的奧祕", score: 47.5 },
      { name: "二、觀察天氣的變化", score: 52.5 },
    ]);
    const objectives = createObjectives([
      { name: "一、探索星空的奧祕", score: 47.5 },
      { name: "二、觀察天氣的變化", score: 52.5 },
    ]);
    const result = auditScores({
      allocations,
      objectives,
      items: [
        createItem("A-01", ["O-1"], 45),
        createItem("X-05", ["O-1", "O-2"], 5),
        createItem("B-01", ["O-2"], 50),
      ],
    });

    expect(result.severity).toBe("warning");
    expect(result.crossUnitItemIds).toEqual(["X-05"]);
    expect(result.unitResults).toEqual([
      {
        unitName: "一、探索星空的奧祕",
        suggestedScore: 47.5,
        actualScore: 47.5,
        diff: 0,
        status: "pass",
      },
      {
        unitName: "二、觀察天氣的變化",
        suggestedScore: 52.5,
        actualScore: 52.5,
        diff: 0,
        status: "pass",
      },
    ]);
  });

  it("浮點安全比較不會將 0.1 與 0.2 組合的等值結果誤判為 error", () => {
    const allocations = createAllocations([
      { name: "一、探索星空的奧祕", score: 0.3 },
      { name: "二、觀察天氣的變化", score: 0.7 },
    ]);
    const objectives = createObjectives([
      { name: "一、探索星空的奧祕", score: 0.3 },
      { name: "二、觀察天氣的變化", score: 0.7 },
    ]);
    const result = auditScores({
      allocations,
      objectives,
      items: [
        createItem("A-01", ["O-1"], 0.1),
        createItem("A-02", ["O-1"], 0.2),
        createItem("B-01", ["O-2"], 0.3),
        createItem("B-02", ["O-2"], 0.4),
      ],
      options: { totalScore: 1 },
    });

    expect(result.severity).toBe("pass");
    expect(result.unitResults[0]).toMatchObject({
      actualScore: 0.30000000000000004,
      diff: 0,
      status: "pass",
    });
  });

  it("item 引用無法對應單元的目標編號時回傳 error 並指出 itemId", () => {
    const result = auditScores({
      allocations: baseAllocations,
      objectives: baseObjectives,
      items: [
        createItem("A-01", ["O-1"], 40),
        createItem("Z-99", ["O-404"], 60),
      ],
    });

    expect(result.severity).toBe("error");
    expect(result.messages).toContain(
      "第 2 筆試題 Z-99 的 objectiveIds 引用了無法對應到任何單元的目標編號：O-404。",
    );
  });

  it("非陣列或空陣列輸入時回傳 error 與可讀訊息", () => {
    const result = auditScores({
      allocations: [],
      objectives: baseObjectives,
      items: "不是陣列",
    });

    expect(result.severity).toBe("error");
    expect(result.messages).toContain("allocations 欄位不可為空陣列。");
    expect(result.messages).toContain("items 欄位必須是陣列。");
  });
});

import { describe, expect, it } from "vitest";
import { summarizeBlueprint } from "../src/ui/summarizeBlueprint.js";

const allocations = [
  { id: "U1", name: "一、探索星空的奧祕", periodCount: 6, suggestedScore: 60 },
  { id: "U2", name: "二、水溶液的變化", periodCount: 4, suggestedScore: 40 },
];

const matchedBlueprint = [
  {
    objectiveId: "1-1-1",
    unitName: "一、探索星空的奧祕",
    questionTypes: ["選擇題"],
    plannedScore: 30,
    groupHint: "",
  },
  {
    objectiveId: "1-1-2",
    unitName: "一、探索星空的奧祕",
    questionTypes: ["應用題"],
    plannedScore: 30,
    groupHint: "可併入觀星情境題組",
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、水溶液的變化",
    questionTypes: ["填充題"],
    plannedScore: 40,
    groupHint: "",
  },
];

describe("summarizeBlueprint", () => {
  it("全數吻合時 allMatched 為 true", () => {
    const result = summarizeBlueprint(allocations, matchedBlueprint);

    expect(result.allMatched).toBe(true);
    expect(result.unitSummaries).toEqual([
      {
        unitName: "一、探索星空的奧祕",
        actualScore: 60,
        expectedScore: 60,
        diff: 0,
        status: "pass",
      },
      {
        unitName: "二、水溶液的變化",
        actualScore: 40,
        expectedScore: 40,
        diff: 0,
        status: "pass",
      },
    ]);
  });

  it("單一單元差 1 分時指出 diff", () => {
    const result = summarizeBlueprint(allocations, [
      { ...matchedBlueprint[0], plannedScore: 31 },
      matchedBlueprint[1],
      matchedBlueprint[2],
    ]);

    expect(result.allMatched).toBe(false);
    expect(result.unitSummaries[0]).toMatchObject({
      actualScore: 61,
      expectedScore: 60,
      diff: 1,
      status: "error",
    });
  });

  it("目標缺題型時 allMatched 為 false 並回傳錯誤", () => {
    const result = summarizeBlueprint(allocations, [
      { ...matchedBlueprint[0], questionTypes: [] },
      matchedBlueprint[1],
      matchedBlueprint[2],
    ]);

    expect(result.allMatched).toBe(false);
    expect(result.invalidEntries[0].issues).toContain(
      "第 1 筆 questionTypes 欄位至少需勾選一種題型。",
    );
  });

  it("配分 0 時 allMatched 為 false 並回傳錯誤", () => {
    const result = summarizeBlueprint(allocations, [
      { ...matchedBlueprint[0], plannedScore: 0 },
      matchedBlueprint[1],
      matchedBlueprint[2],
    ]);

    expect(result.allMatched).toBe(false);
    expect(result.invalidEntries[0].issues).toContain(
      "第 1 筆 plannedScore 欄位必須是大於或等於 1 的正整數。",
    );
  });

  it("空藍圖時 allMatched 為 false 並回傳可讀錯誤", () => {
    const result = summarizeBlueprint(allocations, []);

    expect(result.allMatched).toBe(false);
    expect(result.errors).toContain("blueprint 欄位不可為空陣列。");
  });
});

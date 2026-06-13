import { describe, expect, it } from "vitest";
import { groupObjectivesToUnits } from "../src/ui/groupObjectivesToUnits.js";

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、探索星空的奧祕",
    lessonName: "1-1 星星的位置",
    text: "能描述星星在天空中的方位。",
    periodCount: 3,
  },
  {
    objectiveId: "1-1-2",
    unitName: "一、探索星空的奧祕",
    lessonName: "1-2 星座盤",
    text: "能依觀察時間調整星座盤。",
    periodCount: 2,
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、水溶液的變化",
    lessonName: "2-1 溶解現象",
    text: "能比較不同物質在水中的溶解情形。",
    periodCount: 4,
  },
];

describe("groupObjectivesToUnits", () => {
  it("多目標同單元時會加總授課節數", () => {
    const result = groupObjectivesToUnits(objectives);

    expect(result.ok).toBe(true);
    expect(result.units[0]).toEqual({
      id: "U1",
      name: "一、探索星空的奧祕",
      periodCount: 5,
    });
  });

  it("單元順序依學習目標首次出現順序保持", () => {
    const result = groupObjectivesToUnits(objectives);

    expect(result.units.map((unit) => unit.name)).toEqual([
      "一、探索星空的奧祕",
      "二、水溶液的變化",
    ]);
  });

  it("空陣列回傳可讀錯誤", () => {
    const result = groupObjectivesToUnits([]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("objectives 欄位不可為空陣列。");
  });
});

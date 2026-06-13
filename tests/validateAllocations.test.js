import { describe, expect, it } from "vitest";
import {
  buildDefaultObjectiveAllocations,
  calculateSuggestedObjectiveScores,
  validateAllocations,
} from "../src/ui/validateAllocations.js";

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、星空",
    lessonName: "1-1 星星位置",
    text: "能描述星星位置。",
    periodCount: 1,
  },
  {
    objectiveId: "1-1-2",
    unitName: "一、星空",
    lessonName: "1-1 星星位置",
    text: "能比較觀察紀錄。",
    periodCount: 1,
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、動物",
    lessonName: "2-1 生存方式",
    text: "能說明生物適應。",
    periodCount: 2,
  },
];

describe("validateAllocations", () => {
  it("計算每目標節數比例建議配分", () => {
    const rows = calculateSuggestedObjectiveScores({ objectives, totalScore: 100 });

    expect(rows.map((row) => row.suggestedScore)).toEqual([25, 25, 50]);
  });

  it("預設目標配分以最大餘數法加總為 100", () => {
    const rows = buildDefaultObjectiveAllocations({ objectives, totalScore: 100 });

    expect(rows.reduce((sum, row) => sum + row.actualScore, 0)).toBe(100);
    expect(rows.map((row) => row.actualScore)).toEqual([25, 25, 50]);
  });

  it("實際配分合計 100 且可整除題數時通過", () => {
    const result = validateAllocations({
      objectives,
      allocations: [
        { objectiveId: "1-1-1", actualScore: 20, plannedCount: 4 },
        { objectiveId: "1-1-2", actualScore: 30, plannedCount: 5 },
        { objectiveId: "2-1-1", actualScore: 50, plannedCount: 5 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.perItemScore)).toEqual([5, 6, 10]);
  });

  it("實際配分合計不是 100 時擋下", () => {
    const result = validateAllocations({
      objectives,
      allocations: [
        { objectiveId: "1-1-1", actualScore: 20 },
        { objectiveId: "1-1-2", actualScore: 20 },
        { objectiveId: "2-1-1", actualScore: 50 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("全卷實際配分合計需為 100 分");
  });

  it("目標配分無法被規劃題數整除時擋下", () => {
    const result = validateAllocations({
      objectives,
      allocations: [
        { objectiveId: "1-1-1", actualScore: 25, plannedCount: 4 },
        { objectiveId: "1-1-2", actualScore: 25, plannedCount: 5 },
        { objectiveId: "2-1-1", actualScore: 50, plannedCount: 5 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "1-1-1 共 25 分，規劃 4 題無法平分為正整數每題分。",
    );
  });

  it("偏離建議超過門檻時只列為 warning 不阻擋", () => {
    const result = validateAllocations({
      objectives,
      allocations: [
        { objectiveId: "1-1-1", actualScore: 10 },
        { objectiveId: "1-1-2", actualScore: 40 },
        { objectiveId: "2-1-1", actualScore: 50 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBe(2);
    expect(result.rows[0].status).toBe("warning");
  });
});

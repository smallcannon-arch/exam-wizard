import { describe, expect, it } from "vitest";
import { allocateScores } from "../src/core/allocateScores.js";

function sumSuggestedScore(result) {
  return result.allocations.reduce(
    (sum, allocation) => sum + allocation.suggestedScore,
    0,
  );
}

function createUnits(periodCounts) {
  return periodCounts.map((periodCount, index) => ({
    id: `U${index + 1}`,
    name: `單元 ${index + 1}`,
    periodCount,
  }));
}

function createSeededRandom(seed) {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("allocateScores", () => {
  it("三個單元節數相同時，以輸入順序補回最大餘數分數", () => {
    const result = allocateScores({
      totalScore: 100,
      units: createUnits([1, 1, 1]),
    });

    expect(result.ok).toBe(true);
    expect(result.allocations.map((unit) => unit.suggestedScore)).toEqual([
      34, 33, 33,
    ]);
    expect(sumSuggestedScore(result)).toBe(100);
  });

  it("節數 6、7、7、4、4 時，總和為 100 且比例誤差不超過 1 分", () => {
    const periodCounts = [6, 7, 7, 4, 4];
    const totalScore = 100;
    const totalPeriods = periodCounts.reduce((sum, count) => sum + count, 0);
    const result = allocateScores({
      totalScore,
      units: createUnits(periodCounts),
    });

    expect(result.ok).toBe(true);
    expect(sumSuggestedScore(result)).toBe(totalScore);
    result.allocations.forEach((allocation) => {
      const rawScore =
        totalScore * (allocation.periodCount / totalPeriods);

      expect(Math.abs(allocation.suggestedScore - rawScore)).toBeLessThanOrEqual(
        1,
      );
    });
  });

  it("節數 2、6、2 時，依比例分配為 20、60、20", () => {
    const result = allocateScores({
      totalScore: 100,
      units: createUnits([2, 6, 2]),
    });

    expect(result.ok).toBe(true);
    expect(result.allocations.map((unit) => unit.suggestedScore)).toEqual([
      20, 60, 20,
    ]);
    expect(sumSuggestedScore(result)).toBe(100);
  });

  it("periodCount 為 0 時，回傳指出筆數與欄位的錯誤", () => {
    const result = allocateScores({
      totalScore: 100,
      units: createUnits([4, 0, 6]),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("第 2 筆單元 periodCount 欄位必須是正數。");
  });

  it("units 為空陣列時，回傳可讀錯誤", () => {
    const result = allocateScores({
      totalScore: 100,
      units: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("units 欄位必須是非空陣列。");
  });

  it("totalScore 為 0 或小數時，回傳可讀錯誤", () => {
    const zeroScoreResult = allocateScores({
      totalScore: 0,
      units: createUnits([1, 1, 1]),
    });
    const decimalScoreResult = allocateScores({
      totalScore: 99.5,
      units: createUnits([1, 1, 1]),
    });

    expect(zeroScoreResult.ok).toBe(false);
    expect(zeroScoreResult.errors).toContain("totalScore 欄位必須是正整數。");
    expect(decimalScoreResult.ok).toBe(false);
    expect(decimalScoreResult.errors).toContain("totalScore 欄位必須是正整數。");
  });

  it("缺少 id 或 periodCount 時，回傳指出筆數與欄位的錯誤", () => {
    const result = allocateScores({
      totalScore: 100,
      units: [
        { id: "U1", name: "單元 1", periodCount: 4 },
        { name: "單元 2", periodCount: 3 },
        { id: "U3", name: "單元 3" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("第 2 筆單元 id 欄位必填。");
    expect(result.errors).toContain("第 3 筆單元 periodCount 欄位必填。");
  });

  it("單元數多於總分時，回傳無法每單元至少 1 分的錯誤", () => {
    const result = allocateScores({
      totalScore: 100,
      units: createUnits(Array.from({ length: 101 }, () => 1)),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "單元數量 101 筆多於 totalScore 100，無法讓每個單元至少分配 1 分。",
    );
  });

  it("隨機 50 組合法輸入時，suggestedScore 總和恆等於 totalScore", () => {
    const random = createSeededRandom(20260613);

    for (let round = 0; round < 50; round += 1) {
      const unitCount = 3 + Math.floor(random() * 8);
      const periodCounts = Array.from(
        { length: unitCount },
        () => 1 + Math.floor(random() * 10),
      );
      const result = allocateScores({
        totalScore: 100,
        units: createUnits(periodCounts),
      });

      expect(result.ok).toBe(true);
      expect(sumSuggestedScore(result)).toBe(100);
      result.allocations.forEach((allocation) => {
        expect(allocation.suggestedScore).toBeGreaterThanOrEqual(1);
      });
    }
  });
});

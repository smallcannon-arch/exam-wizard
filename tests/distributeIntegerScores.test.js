import { describe, expect, it } from "vitest";
import { distributeIntegerScores } from "../src/ui/distributeIntegerScores.js";

describe("distributeIntegerScores", () => {
  it("將總分湊整分配且加總守恆", () => {
    expect(distributeIntegerScores(33, 2)).toEqual([17, 16]);
    expect(distributeIntegerScores(33, 4)).toEqual([9, 8, 8, 8]);
    expect(distributeIntegerScores(100, 3)).toEqual([34, 33, 33]);
    expect(distributeIntegerScores(20, 4)).toEqual([5, 5, 5, 5]);
    expect(distributeIntegerScores(5, 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("每筆皆為正整數且總和等於原總分", () => {
    const scores = distributeIntegerScores(37, 6);

    expect(scores.every((score) => Number.isInteger(score) && score > 0)).toBe(true);
    expect(scores.reduce((sum, score) => sum + score, 0)).toBe(37);
  });

  it("無法分成正整數時回傳空陣列", () => {
    expect(distributeIntegerScores(2, 3)).toEqual([]);
    expect(distributeIntegerScores(0, 2)).toEqual([]);
    expect(distributeIntegerScores(10.5, 2)).toEqual([]);
  });
});

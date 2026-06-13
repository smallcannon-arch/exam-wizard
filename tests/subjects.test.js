import { describe, expect, it } from "vitest";
import {
  getCanonicalSubjectLabel,
  isChineseSubject,
  normalizeSubject,
} from "../src/ui/subjects.js";

describe("subjects", () => {
  it("自然科各種寫法會正規化為 science", () => {
    expect(["自然", "自然科", "自然科學", "自然領域"].map(normalizeSubject)).toEqual([
      "science",
      "science",
      "science",
      "science",
    ]);
  });

  it("國語與國文會正規化為 chinese", () => {
    expect(normalizeSubject("國語")).toBe("chinese");
    expect(normalizeSubject("國文")).toBe("chinese");
    expect(isChineseSubject("國文")).toBe(true);
  });

  it("數學社會英語常見寫法會正規化", () => {
    expect(normalizeSubject("數學科")).toBe("math");
    expect(normalizeSubject("社會領域")).toBe("social");
    expect(normalizeSubject("英文")).toBe("english");
  });

  it("可取得核心檢核使用的標準科目名稱", () => {
    expect(getCanonicalSubjectLabel("國文")).toBe("國語");
    expect(getCanonicalSubjectLabel("自然科學")).toBe("自然");
    expect(getCanonicalSubjectLabel("未知科目")).toBe("未知科目");
  });
});

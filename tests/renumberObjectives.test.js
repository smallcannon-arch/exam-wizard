import { describe, expect, it } from "vitest";
import { renumberObjectives } from "../src/ui/renumberObjectives.js";

function objective(objectiveId, unitName, lessonName, text = "學習目標") {
  return {
    objectiveId,
    unitName,
    lessonName,
    text,
    periodCount: 1,
  };
}

describe("renumberObjectives", () => {
  it("依小單元開頭編號重編標準格式", () => {
    const result = renumberObjectives([
      objective("17", "四、揭祕動物的世界", "4-2 動物的生存之道"),
      objective("18", "四、揭祕動物的世界", "4-2 動物的生存之道"),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.objectives.map((item) => item.objectiveId)).toEqual([
      "4-2-1",
      "4-2-2",
    ]);
    expect(result.mapping).toEqual({
      17: "4-2-1",
      18: "4-2-2",
    });
  });

  it("lessonName 無編號時退用 unitName 開頭編號", () => {
    const result = renumberObjectives([
      objective("A", "4-3 動物與環境", "動物如何適應環境"),
    ]);

    expect(result.objectives[0].objectiveId).toBe("4-3-1");
    expect(result.notices).toEqual([]);
  });

  it("lessonName 與 unitName 皆無編號時採 U 後備編號並提示", () => {
    const result = renumberObjectives([
      objective("A", "揭祕動物的世界", "動物如何適應環境"),
      objective("B", "揭祕動物的世界", "動物如何適應環境"),
    ]);

    expect(result.objectives.map((item) => item.objectiveId)).toEqual([
      "U1-1",
      "U1-2",
    ]);
    expect(result.notices[0]).toContain("後備編號 U1");
  });

  it("不同小單元解析出相同前綴時後者加 b", () => {
    const result = renumberObjectives([
      objective("A", "四、揭祕動物的世界", "4-2 動物的生存之道"),
      objective("B", "四、揭祕動物的世界", "4-2 動物行為觀察"),
    ]);

    expect(result.objectives.map((item) => item.objectiveId)).toEqual([
      "4-2-1",
      "4-2b-1",
    ]);
    expect(result.notices[0]).toContain("4-2b");
  });

  it("同一小單元內依原輸入順序流水編號", () => {
    const result = renumberObjectives([
      objective("first", "四、揭祕動物的世界", "4-2 動物的生存之道", "第一條"),
      objective("second", "四、揭祕動物的世界", "4-3 動物與環境", "第二條"),
      objective("third", "四、揭祕動物的世界", "4-2 動物的生存之道", "第三條"),
    ]);

    expect(result.objectives.map((item) => [item.text, item.objectiveId])).toEqual([
      ["第一條", "4-2-1"],
      ["第二條", "4-3-1"],
      ["第三條", "4-2-2"],
    ]);
  });

  it("mapping 完整記錄每筆舊編號到新編號", () => {
    const result = renumberObjectives([
      objective("9", "4-1 動物的身體構造", "動物構造"),
      objective("10", "4-1 動物的身體構造", "動物構造"),
      objective("11", "四、揭祕動物的世界", "4-2 動物的生存之道"),
    ]);

    expect(result.mapping).toEqual({
      9: "4-1-1",
      10: "4-1-2",
      11: "4-2-1",
    });
  });

  it("空陣列回傳可讀錯誤", () => {
    const result = renumberObjectives([]);

    expect(result.objectives).toEqual([]);
    expect(result.mapping).toEqual({});
    expect(result.errors).toContain("objectives 至少需要一筆資料。");
  });
});

import { describe, expect, it } from "vitest";
import {
  mergeItemBatches,
  planItemBatches,
} from "../src/ui/generateItemsBatched.js";

function objective(id, unitName = "一、星空", lessonName = "1-1 星空") {
  return {
    objectiveId: id,
    unitName,
    lessonName,
    text: `目標 ${id}`,
    periodCount: 1,
  };
}

function blueprint(objectiveId, unitName = "一、星空", questionTypes = ["選擇題"]) {
  return {
    objectiveId,
    unitName,
    questionTypes,
    plannedScore: 4,
    groupHint: "",
  };
}

function item(itemId, questionType, objectiveIds, extra = {}) {
  return {
    itemId,
    groupId: "",
    questionType,
    competencyType: "一般題",
    stimulus: "",
    question: `題目 ${itemId}`,
    options: ["A", "B", "C"],
    answer: "1",
    explanation: "解析",
    objectiveIds,
    score: 4,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    chineseDimension: null,
    reviewFlags: [],
    ...extra,
  };
}

describe("planItemBatches", () => {
  it("多單元依單元切批並保持單元順序", () => {
    const result = planItemBatches({
      objectives: [
        objective("1-1-1", "一、星空"),
        objective("2-1-1", "二、動物"),
      ],
      blueprint: [
        blueprint("1-1-1", "一、星空"),
        blueprint("2-1-1", "二、動物"),
      ],
      perObjective: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.batches.map((batch) => batch.unitName)).toEqual([
      "一、星空",
      "二、動物",
    ]);
    expect(result.batches.map((batch) => batch.requestedItemCount)).toEqual([1, 1]);
  });

  it("單一單元題數過多時再依目標細切", () => {
    const objectives = Array.from({ length: 5 }, (_, index) =>
      objective(`1-1-${index + 1}`),
    );
    const blueprintRows = objectives.map((entry) =>
      blueprint(entry.objectiveId, "一、星空", ["選擇題", "填充題", "應用題"]),
    );
    const result = planItemBatches({
      objectives,
      blueprint: blueprintRows,
      perObjective: 1,
      maxItemsPerBatch: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.batches.length).toBeGreaterThan(1);
    expect(result.batches.every((batch) => batch.requestedItemCount <= 4)).toBe(true);
  });

  it("perObjective 會帶入每批並影響 requestedItemCount", () => {
    const result = planItemBatches({
      objectives: [objective("1-1-1")],
      blueprint: [blueprint("1-1-1", "一、星空", ["選擇題", "填充題"])],
      perObjective: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.batches[0].perObjective).toBe(2);
    expect(result.batches[0].requestedItemCount).toBe(4);
  });

  it("candidatesPerObjective 為 3 時會依總生成量切批", () => {
    const result = planItemBatches({
      objectives: [objective("1-1-1"), objective("1-1-2")],
      blueprint: [
        blueprint("1-1-1", "一、探索星空", ["選擇題", "應用題"]),
        blueprint("1-1-2", "一、探索星空", ["選擇題", "填充題"]),
      ],
      perObjective: 3,
      maxItemsPerBatch: 6,
    });

    expect(result.ok).toBe(true);
    expect(result.batches.map((batch) => batch.perObjective)).toEqual([3, 3]);
    expect(result.batches.map((batch) => batch.requestedItemCount)).toEqual([6, 6]);
  });

  it("單一目標題型過多時會切成多批", () => {
    const result = planItemBatches({
      objectives: [objective("1-1-1")],
      blueprint: [
        blueprint("1-1-1", "一、星空", [
          "選擇題",
          "填充題",
          "勾選題",
          "應用題",
          "畫圖題",
        ]),
      ],
      perObjective: 1,
      maxItemsPerBatch: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.batches).toHaveLength(3);
    expect(result.batches.map((batch) => batch.requestedItemCount)).toEqual([2, 2, 1]);
  });

  it("空 objectives 回傳錯誤", () => {
    const result = planItemBatches({
      objectives: [],
      blueprint: [blueprint("1-1-1")],
      perObjective: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("學習目標");
  });

  it("目標缺少題型規劃時回傳錯誤", () => {
    const result = planItemBatches({
      objectives: [objective("1-1-1")],
      blueprint: [blueprint("9-9-9")],
      perObjective: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("1-1-1");
  });
});

describe("mergeItemBatches", () => {
  it("跨批 itemId 會重編且不重複", () => {
    const result = mergeItemBatches([
      { items: [item("X-01", "應用題", ["1-1-1"])] },
      { items: [item("X-01", "選擇題", ["2-1-1"])] },
    ]);

    expect(result.ok).toBe(true);
    expect(result.items.map((entry) => entry.itemId)).toEqual(["A-01", "A-02"]);
    expect(new Set(result.items.map((entry) => entry.itemId)).size).toBe(2);
  });

  it("合併後依題型排序", () => {
    const result = mergeItemBatches([
      {
        items: [
          item("B-01", "應用題", ["1-1-1"]),
          item("B-02", "選擇題", ["1-1-2"]),
          item("B-03", "填充題", ["1-1-3"]),
        ],
      },
    ]);

    expect(result.items.map((entry) => entry.questionType)).toEqual([
      "選擇題",
      "填充題",
      "應用題",
    ]);
  });

  it("保留 groupId 與 objectiveIds", () => {
    const result = mergeItemBatches([
      {
        items: [
          item("G-01", "選擇題", ["1-1-1"], { groupId: "G-01" }),
          item("G-02", "選擇題", ["1-1-2"], { groupId: "G-01" }),
        ],
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.items.map((entry) => entry.groupId)).toEqual(["G-01", "G-01"]);
    expect(result.items.map((entry) => entry.objectiveIds)).toEqual([
      ["1-1-1"],
      ["1-1-2"],
    ]);
  });

  it("空批次回傳錯誤", () => {
    const result = mergeItemBatches([]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("備選題");
  });
});

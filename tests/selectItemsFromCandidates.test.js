import { describe, expect, it } from "vitest";
import {
  buildSelectedItemsFromCandidates,
  summarizeCandidateSelection,
} from "../src/ui/selectItemsFromCandidates.js";

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、星空觀察",
    lessonName: "1-1 星星位置",
    text: "能描述星星位置。",
  },
  {
    objectiveId: "1-1-2",
    unitName: "一、星空觀察",
    lessonName: "1-1 星星位置",
    text: "能比較觀察紀錄。",
  },
];

const blueprint = [
  { objectiveId: "1-1-1", plannedScore: 20 },
  { objectiveId: "1-1-2", plannedScore: 10 },
];

function candidate(itemId, objectiveIds, score, selected = false) {
  return {
    itemId,
    groupId: "",
    questionType: "選擇題",
    competencyType: "一般題",
    stimulus: "",
    question: `題目 ${itemId}`,
    options: ["甲", "乙", "丙"],
    answer: "1",
    explanation: "解析",
    objectiveIds,
    score,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    chineseDimension: null,
    reviewFlags: [],
    selected,
  };
}

describe("summarizeCandidateSelection", () => {
  it("剛好選滿時 allMatched 為 true 並產出正式題目", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        candidate("C-01", ["1-1-1"], 20, true),
        candidate("C-02", ["1-1-2"], 10, true),
      ],
    });

    expect(result.allMatched).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.selectedItems.map((item) => item.itemId)).toEqual(["A-01", "A-02"]);
    expect(result.totalSelectedScore).toBe(30);
  });

  it("未選滿時回傳差額提示", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [candidate("C-01", ["1-1-1"], 10, true)],
    });

    expect(result.allMatched).toBe(false);
    expect(result.objectiveSummaries[0]).toMatchObject({
      objectiveId: "1-1-1",
      selectedScore: 10,
      expectedScore: 20,
      status: "under",
    });
    expect(result.errors[0]).toContain("還差 10 分");
  });

  it("超選時回傳超選提示", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        candidate("C-01", ["1-1-1"], 20, true),
        candidate("C-02", ["1-1-1"], 5, true),
        candidate("C-03", ["1-1-2"], 10, true),
      ],
    });

    expect(result.allMatched).toBe(false);
    expect(result.objectiveSummaries[0]).toMatchObject({
      selectedScore: 25,
      diff: 5,
      status: "over",
    });
    expect(result.errors[0]).toContain("超選 5 分");
  });

  it("跨目標題平均分攤配分", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        candidate("C-01", ["1-1-1"], 15, true),
        candidate("C-02", ["1-1-1", "1-1-2"], 10, true),
        candidate("C-03", ["1-1-2"], 5, true),
      ],
    });

    expect(result.allMatched).toBe(true);
    expect(result.objectiveSummaries.map((summary) => summary.selectedScore)).toEqual([
      20,
      10,
    ]);
  });

  it("空備選池時回傳未完成", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [],
    });

    expect(result.allMatched).toBe(false);
    expect(result.selectedItems).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("可用 selectedItemIds 指定選入題目並保留備選池原資料", () => {
    const pool = [
      candidate("C-01", ["1-1-1"], 20),
      candidate("C-02", ["1-1-2"], 10),
    ];
    const result = buildSelectedItemsFromCandidates(pool, ["C-02"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemId: "A-01", question: "題目 C-02" });
    expect(pool[1].itemId).toBe("C-02");
  });
});

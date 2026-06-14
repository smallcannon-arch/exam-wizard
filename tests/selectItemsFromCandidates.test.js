import { describe, expect, it } from "vitest";
import {
  applyCandidateSelection,
  buildSelectedItemsFromCandidates,
  computeGroupSubScores,
  computeSelectionScores,
  summarizeCandidateSelection,
  validateGroupScores,
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

const groupSections = [
  {
    sectionId: "S-G",
    kind: "group",
    objectiveIds: ["1-1-1", "1-1-2"],
    subCount: 3,
  },
];

const groupBlueprint = [
  { sectionId: "S-G", objectiveId: "1-1-1", questionTypes: ["題組"], plannedScore: 33 },
  { sectionId: "S-G", objectiveId: "1-1-2", questionTypes: ["題組"], plannedScore: 67 },
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

function candidates(prefix, objectiveIds, count, selected = true) {
  return Array.from({ length: count }, (_, index) =>
    candidate(`${prefix}-${String(index + 1).padStart(2, "0")}`, objectiveIds, 1, selected),
  );
}

describe("summarizeCandidateSelection", () => {
  it("computeGroupSubScores 可整除均分", () => {
    expect(computeGroupSubScores({ objectiveScore: 20, subItemCount: 4 })).toEqual({
      ok: true,
      scores: [5, 5, 5, 5],
      errors: [],
    });
  });

  it("computeGroupSubScores 會把餘數分配到前幾題", () => {
    expect(computeGroupSubScores({ objectiveScore: 33, subItemCount: 2 }).scores).toEqual([
      17,
      16,
    ]);
    expect(computeGroupSubScores({ objectiveScore: 100, subItemCount: 3 }).scores).toEqual([
      34,
      33,
      33,
    ]);
    expect(computeGroupSubScores({ objectiveScore: 33, subItemCount: 4 }).scores).toEqual([
      9,
      8,
      8,
      8,
    ]);
  });

  it("computeGroupSubScores 無法分成正整數時回傳錯誤", () => {
    expect(computeGroupSubScores({ objectiveScore: 2, subItemCount: 3 })).toMatchObject({
      ok: false,
      scores: [],
    });
  });

  it("validateGroupScores 可驗證多目標題組小題加總", () => {
    const result = validateGroupScores({
      groupSubItems: [
        candidate("G-01-1", ["1-1-1"], 17),
        candidate("G-01-2", ["1-1-1"], 16),
        candidate("G-01-3", ["1-1-2"], 67),
      ],
      objectiveScores: new Map([
        ["1-1-1", 33],
        ["1-1-2", 67],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.objectiveResults.map((entry) => entry.actualScore)).toEqual([33, 67]);
  });

  it("validateGroupScores 可抓出手動改分後加總不符", () => {
    const result = validateGroupScores({
      groupSubItems: [
        candidate("G-01-1", ["1-1-1"], 18),
        candidate("G-01-2", ["1-1-1"], 16),
      ],
      objectiveScores: { "1-1-1": 33 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("34/33");
  });

  it("computeSelectionScores 可判斷整除與除不盡", () => {
    expect(computeSelectionScores({ objectiveScore: 20, selectedCount: 10 })).toMatchObject({
      ok: true,
      perItemScore: 2,
      selectedTotal: 20,
    });
    expect(computeSelectionScores({ objectiveScore: 20, selectedCount: 3 })).toMatchObject({
      ok: false,
      perItemScore: null,
    });
  });

  it("一般題每題配分超過 3 分時會擋下", () => {
    const result = computeSelectionScores({ objectiveScore: 20, selectedCount: 4 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("超過每題最多 3 分");
  });

  it("剛好選滿時 allMatched 為 true 並產出正式題目", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        ...candidates("C-A", ["1-1-1"], 10),
        ...candidates("C-B", ["1-1-2"], 5),
      ],
    });

    expect(result.allMatched).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.selectedItems.map((item) => item.itemId).slice(0, 2)).toEqual(["A-01", "A-02"]);
    expect(result.totalSelectedScore).toBe(30);
  });

  it("未選題時回傳未完成提示", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [candidate("C-01", ["1-1-1"], 10, false)],
    });

    expect(result.allMatched).toBe(false);
    expect(result.objectiveSummaries[0]).toMatchObject({
      objectiveId: "1-1-1",
      selectedCount: 0,
      selectedScore: 0,
      expectedScore: 20,
      status: "unselected",
    });
    expect(result.errors[0]).toContain("尚未選題");
  });

  it("選題數無法整除目標配分時回傳提示", () => {
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        candidate("C-01", ["1-1-1"], 20, true),
        candidate("C-02", ["1-1-1"], 5, true),
        candidate("C-04", ["1-1-1"], 5, true),
        candidate("C-03", ["1-1-2"], 10, true),
      ],
    });

    expect(result.allMatched).toBe(false);
    expect(result.objectiveSummaries[0]).toMatchObject({
      selectedCount: 3,
      selectedScore: 0,
      status: "not_divisible",
    });
    expect(result.errors[0]).toContain("無法平分");
  });

  it("跨目標題依各目標每題分合併正式題分", () => {
    const crossItem = candidate("C-X", ["1-1-1", "1-1-2"], 1, true);
    const result = summarizeCandidateSelection({
      objectives,
      blueprint,
      candidatePool: [
        crossItem,
        ...candidates("C-A", ["1-1-1"], 9),
        ...candidates("C-B", ["1-1-2"], 4),
      ],
    });

    expect(result.allMatched).toBe(true);
    expect(result.objectiveSummaries.map((summary) => summary.selectedScore)).toEqual([
      20,
      10,
    ]);
    expect(result.selectedItems.find((item) => item.question === "題目 C-X").score).toBe(4);
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

  it("題組候選題會整組選入並納入各目標配分", () => {
    const pool = [
      candidate("G-01-1", ["1-1-1"], 16.5, false),
      candidate("G-01-2", ["1-1-1"], 16.5, false),
      candidate("G-01-3", ["1-1-2"], 67, false),
      candidate("C-03", ["1-1-1"], 5, false),
    ].map((item, index) =>
      index < 3
        ? {
            ...item,
            sectionId: "S-G",
            groupId: "G-01",
            cognitiveLevel: index === 0 ? "提取" : "整合",
          }
        : item,
    );
    const selectedPool = applyCandidateSelection(pool, "G-01-1", true);
    const result = summarizeCandidateSelection({
      objectives,
      blueprint: groupBlueprint,
      candidatePool: selectedPool,
      sections: groupSections,
    });

    expect(selectedPool[0].selected).toBe(true);
    expect(selectedPool[1].selected).toBe(true);
    expect(selectedPool[2].selected).toBe(true);
    expect(selectedPool[3].selected).toBe(false);
    expect(result.allMatched).toBe(true);
    expect(result.selectedItems.map((item) => item.score)).toEqual([17, 16, 67]);
    expect(result.groupObjectiveResults.find((entry) => entry.objectiveId === "1-1-1")).toMatchObject({
      actualScore: 33,
      expectedScore: 33,
      status: "pass",
    });
  });

  it("題組手動配分不等於目標配分時會擋下", () => {
    const pool = [
      {
        ...candidate("G-01-1", ["1-1-1"], 18, true),
        sectionId: "S-G",
        groupId: "G-01",
        scoreManual: true,
      },
      {
        ...candidate("G-01-2", ["1-1-1"], 16, true),
        sectionId: "S-G",
        groupId: "G-01",
        scoreManual: true,
      },
      {
        ...candidate("G-01-3", ["1-1-2"], 67, true),
        sectionId: "S-G",
        groupId: "G-01",
        scoreManual: true,
      },
    ];
    const result = summarizeCandidateSelection({
      objectives,
      blueprint: groupBlueprint,
      candidatePool: pool,
      sections: groupSections,
    });

    expect(result.allMatched).toBe(false);
    expect(result.errors[0]).toContain("34/33");
  });

  it("題組候選題會整組取消選入", () => {
    const pool = [
      { ...candidate("G-01-1", ["1-1-1"], 20, true), groupId: "G-01" },
      { ...candidate("G-01-2", ["1-1-2"], 10, true), groupId: "G-01" },
    ];
    const result = applyCandidateSelection(pool, "G-01-2", false);

    expect(result.map((item) => item.selected)).toEqual([false, false]);
    expect(pool.map((item) => item.selected)).toEqual([true, true]);
  });
});

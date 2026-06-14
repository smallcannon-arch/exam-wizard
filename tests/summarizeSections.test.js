import { describe, expect, it } from "vitest";
import {
  buildBlueprintFromSections,
  summarizeSections,
} from "../src/ui/summarizeSections.js";

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、探索星空",
    lessonName: "1-1 星空位置",
    text: "能描述星星的位置。",
    periodCount: 2,
  },
  {
    objectiveId: "1-1-2",
    unitName: "一、探索星空",
    lessonName: "1-1 星空位置",
    text: "能比較觀察紀錄。",
    periodCount: 3,
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、動物世界",
    lessonName: "2-1 動物適應",
    text: "能說明構造與環境的關係。",
    periodCount: 5,
  },
];

const allocations = [
  { id: "U1", name: "一、探索星空", suggestedScore: 50, periodCount: 5 },
  { id: "U2", name: "二、動物世界", suggestedScore: 50, periodCount: 5 },
];

function section(sectionId, objectiveIds, extra = {}) {
  return {
    sectionId,
    order: Number(sectionId.replace("S", "")),
    title: `${sectionId} 選擇題`,
    kind: "normal",
    questionType: "選擇題",
    objectiveIds,
    plannedCount: 10,
    ...extra,
  };
}

describe("summarizeSections", () => {
  it("大題配分自目標節數比例自動加總為 100", () => {
    const result = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2"]),
        section("S2", ["2-1-1"], { questionType: "應用題", plannedCount: 25 }),
      ],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(true);
    expect(result.totalSectionScore).toBe(100);
    expect(result.sectionSummaries.map((entry) => entry.score)).toEqual([50, 50]);
    expect(result.coverageRate).toBe(1);
  });

  it("一個目標跨多大題時配分平均分攤且總計仍為 100", () => {
    const result = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2"], { plannedCount: 25 }),
        section("S2", ["1-1-1", "2-1-1"], { questionType: "應用題", plannedCount: 25 }),
      ],
      objectives,
      allocations,
      objectiveAllocations: [
        { objectiveId: "1-1-1", actualScore: 50 },
        { objectiveId: "1-1-2", actualScore: 25 },
        { objectiveId: "2-1-1", actualScore: 25 },
      ],
    });

    expect(result.allMatched).toBe(true);
    expect(result.sectionSummaries.map((entry) => entry.score)).toEqual([50, 50]);
    expect(result.objectiveSummaries.find((entry) => entry.objectiveId === "1-1-1").coverageCount).toBe(2);
  });

  it("有目標未涵蓋時列出 missingObjectiveIds 並阻擋", () => {
    const result = summarizeSections({
      sections: [section("S1", ["1-1-1"])],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(false);
    expect(result.missingObjectiveIds).toEqual(["1-1-2", "2-1-1"]);
    expect(result.errors[0]).toContain("未歸入任何大題");
  });

  it("大題沒有目標時回傳 invalidSectionIds", () => {
    const result = summarizeSections({
      sections: [section("S1", [])],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(false);
    expect(result.invalidSectionIds).toEqual(["S1"]);
    expect(result.sectionSummaries[0].issues[0]).toContain("至少需涵蓋");
  });

  it("題數小於 1 時回傳錯誤", () => {
    const result = summarizeSections({
      sections: [section("S1", ["1-1-1", "1-1-2", "2-1-1"], { plannedCount: 0 })],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(false);
    expect(result.sectionSummaries[0].issues[0]).toContain("預計題數");
  });

  it("有實際目標配分時會檢查目標配分是否能被規劃題數整除", () => {
    const result = summarizeSections({
      sections: [section("S1", ["1-1-1", "1-1-2", "2-1-1"], { plannedCount: 3 })],
      objectives,
      allocations,
      objectiveAllocations: [
        { objectiveId: "1-1-1", actualScore: 20 },
        { objectiveId: "1-1-2", actualScore: 30 },
        { objectiveId: "2-1-1", actualScore: 50 },
      ],
    });

    expect(result.allMatched).toBe(false);
    expect(result.errors.some((error) => error.includes("無法平分"))).toBe(true);
  });

  it("一般大題每題配分超過 3 分時在該大題列出錯誤", () => {
    const result = summarizeSections({
      sections: [section("S1", ["1-1-1"], { plannedCount: 4 })],
      objectives,
      allocations,
      objectiveAllocations: [
        { objectiveId: "1-1-1", actualScore: 20 },
        { objectiveId: "1-1-2", actualScore: 30 },
        { objectiveId: "2-1-1", actualScore: 50 },
      ],
    });

    expect(result.allMatched).toBe(false);
    expect(result.sectionSummaries[0].issues[0]).toContain("超過每題最多 3 分");
  });

  it("題組大題納入配分加總與目標覆蓋計算", () => {
    const result = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2"], {
          kind: "group",
          questionType: "題組",
          textMode: "ai",
          subCount: 3,
          plannedCount: 3,
        }),
        section("S2", ["2-1-1"], { questionType: "應用題", plannedCount: 25 }),
      ],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(true);
    expect(result.sectionSummaries[0]).toMatchObject({
      kind: "group",
      questionType: "題組",
      score: 50,
      subCount: 3,
      status: "pass",
    });
    expect(result.objectiveSummaries.map((entry) => entry.covered)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("自行提供文本的題組缺文本時阻擋前進", () => {
    const result = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2", "2-1-1"], {
          kind: "group",
          questionType: "題組",
          textMode: "provided",
          providedText: "",
          subCount: 4,
          plannedCount: 4,
        }),
      ],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(false);
    expect(result.invalidSectionIds).toEqual(["S1"]);
    expect(result.sectionSummaries[0].issues[0]).toContain("自行提供文本");
  });

  it("題組小題數需介於 1 到 8", () => {
    const result = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2", "2-1-1"], {
          kind: "group",
          questionType: "題組",
          textMode: "ai",
          subCount: 9,
          plannedCount: 9,
        }),
      ],
      objectives,
      allocations,
    });

    expect(result.allMatched).toBe(false);
    expect(result.sectionSummaries[0].issues).toContain("題組小題數需介於 1～8。");
  });

  it("空大題陣列回傳錯誤", () => {
    const result = summarizeSections({ sections: [], objectives, allocations });

    expect(result.allMatched).toBe(false);
    expect(result.errors).toContain("請至少新增一個大題。");
  });

  it("buildBlueprintFromSections 產生帶 sectionId 的分批藍圖", () => {
    const summary = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2"]),
        section("S2", ["2-1-1"], { questionType: "應用題", plannedCount: 25 }),
      ],
      objectives,
      allocations,
    });
    const blueprint = buildBlueprintFromSections(summary);

    expect(blueprint).toMatchObject([
      { sectionId: "S1", objectiveId: "1-1-1", questionTypes: ["選擇題"] },
      { sectionId: "S1", objectiveId: "1-1-2", questionTypes: ["選擇題"] },
      { sectionId: "S2", objectiveId: "2-1-1", questionTypes: ["應用題"] },
    ]);
    expect(blueprint.reduce((sum, entry) => sum + entry.plannedScore, 0)).toBe(100);
  });

  it("buildBlueprintFromSections 對題組大題產生題組題型與小題數", () => {
    const summary = summarizeSections({
      sections: [
        section("S1", ["1-1-1", "1-1-2", "2-1-1"], {
          kind: "group",
          questionType: "題組",
          subCount: 4,
          plannedCount: 4,
        }),
      ],
      objectives,
      allocations,
    });
    const blueprint = buildBlueprintFromSections(summary);

    expect(blueprint).toHaveLength(3);
    expect(blueprint.every((entry) => entry.questionTypes[0] === "題組")).toBe(true);
    expect(blueprint.every((entry) => entry.plannedCount === 4)).toBe(true);
    expect(blueprint.reduce((sum, entry) => sum + entry.plannedScore, 0)).toBe(100);
  });
});

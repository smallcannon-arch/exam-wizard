import { describe, expect, it } from "vitest";
import {
  buildSectionPlanRequest,
  convertPlanSectionsToStateSections,
} from "../src/ui/planSections.js";
import { summarizeSections } from "../src/ui/summarizeSections.js";

const objectives = [
  {
    objectiveId: "4-1-1",
    unitName: "四、揭祕動物的世界",
    lessonName: "4-1 動物如何生存",
    text: "能說明動物適應環境的方式。",
    periodCount: 2,
  },
  {
    objectiveId: "4-2-1",
    unitName: "四、揭祕動物的世界",
    lessonName: "4-2 動物的行為",
    text: "能依觀察資料推論動物行為。",
    periodCount: 2,
  },
];

const allocations = [
  { id: "U1", name: "四、揭祕動物的世界", suggestedScore: 100, periodCount: 4 },
];

describe("buildSectionPlanRequest", () => {
  it("偏好全空時保留必要欄位並帶入目標配分", () => {
    expect(
      buildSectionPlanRequest({
        project: { subject: "自然", grade: 5 },
        objectives,
        objectiveAllocations: [
          { objectiveId: "4-1-1", actualScore: 40 },
          { objectiveId: "4-2-1", actualScore: 60 },
        ],
        preferences: {},
      }),
    ).toEqual({
      project: { subject: "自然", grade: 5 },
      objectives: [
        {
          objectiveId: "4-1-1",
          text: "能說明動物適應環境的方式。",
          periodCount: 2,
          score: 40,
        },
        {
          objectiveId: "4-2-1",
          text: "能依觀察資料推論動物行為。",
          periodCount: 2,
          score: 60,
        },
      ],
      preferences: {
        sectionCountHint: null,
        includeGroup: false,
        groupCountHint: null,
        preferredTypes: [],
        note: "",
      },
    });
  });

  it("有偏好時正規化題型、數字與補充說明", () => {
    const request = buildSectionPlanRequest({
      project: { subject: "自然", grade: 5 },
      objectives,
      preferences: {
        sectionCountHint: "4",
        includeGroup: true,
        groupCountHint: "1",
        preferredTypes: ["選擇題", "不存在", "應用題", "選擇題"],
        note: "  題組以觀察紀錄為主  ",
      },
    });

    expect(request.preferences).toEqual({
      sectionCountHint: 4,
      includeGroup: true,
      groupCountHint: 1,
      preferredTypes: ["選擇題", "應用題"],
      note: "題組以觀察紀錄為主",
    });
  });
});

describe("convertPlanSectionsToStateSections", () => {
  it("把一般大題與題組草案轉成 state.sections", () => {
    const sections = convertPlanSectionsToStateSections({
      objectives,
      planSections: [
        {
          title: "一、選擇題",
          kind: "normal",
          questionType: "選擇題",
          objectiveIds: ["4-1-1", "UNKNOWN"],
          plannedCount: 6,
          groupPlan: null,
          rationale: "先檢核基礎概念。",
          plannedScore: 999,
        },
        {
          title: "二、題組",
          kind: "group",
          questionType: "題組",
          objectiveIds: ["4-2-1"],
          plannedCount: 4,
          groupPlan: {
            subCount: 9,
            topicHint: "動物夜間觀察紀錄",
            coveredObjectiveIds: ["4-2-1"],
          },
          rationale: "以共同情境檢核資料推論。",
        },
      ],
    });

    expect(sections).toMatchObject([
      {
        sectionId: "S-01",
        order: 1,
        kind: "normal",
        questionType: "選擇題",
        objectiveIds: ["4-1-1"],
        plannedCount: 6,
        rationale: "先檢核基礎概念。",
      },
      {
        sectionId: "S-02",
        order: 2,
        kind: "group",
        questionType: "題組",
        objectiveIds: ["4-2-1"],
        plannedCount: 8,
        subCount: 8,
        topicHint: "動物夜間觀察紀錄",
        rationale: "以共同情境檢核資料推論。",
      },
    ]);
    expect(sections[0].plannedScore).toBeUndefined();
  });

  it("轉換後沿用 summarizeSections 由目標配分自動加總", () => {
    const sections = convertPlanSectionsToStateSections({
      objectives,
      planSections: [
        {
          title: "一、選擇題",
          kind: "normal",
          questionType: "選擇題",
          objectiveIds: ["4-1-1"],
          plannedCount: 6,
          groupPlan: null,
          rationale: "概念題。",
        },
        {
          title: "二、應用題",
          kind: "normal",
          questionType: "應用題",
          objectiveIds: ["4-2-1"],
          plannedCount: 3,
          groupPlan: null,
          rationale: "資料推論題。",
        },
      ],
    });
    const summary = summarizeSections({ sections, objectives, allocations });

    expect(summary.allMatched).toBe(true);
    expect(summary.totalSectionScore).toBe(100);
    expect(summary.sectionSummaries.map((section) => section.score)).toEqual([50, 50]);
  });
});

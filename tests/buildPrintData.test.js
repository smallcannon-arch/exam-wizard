import { describe, expect, it } from "vitest";
import { buildPrintData } from "../src/ui/buildPrintData.js";

const project = {
  schoolYear: 114,
  semester: 1,
  examNumber: 2,
  grade: 5,
  subject: "自然",
  publisher: "康軒",
  scope: "第一單元到第二單元",
  teacher: "測試教師",
  totalScore: 100,
};

const allocations = [
  { id: "U1", name: "一、探索星空的奧祕", periodCount: 6, suggestedScore: 60 },
  { id: "U2", name: "二、水溶液的變化", periodCount: 4, suggestedScore: 40 },
];

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、探索星空的奧祕",
    lessonName: "1-1 星星的位置",
    text: "能以方位與高度描述觀察到的星星位置。",
    periodCount: 6,
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、水溶液的變化",
    lessonName: "2-1 溶解現象",
    text: "能比較不同物質在水中的溶解情形。",
    periodCount: 4,
  },
];

const auditReport = {
  checklistSuggestions: [
    {
      key: "objective_alignment",
      label: "扣緊教學目標與合於節數比例之配分",
      suggested: true,
      reason: "系統檢核通過。",
    },
    {
      key: "discrimination",
      label: "預估試題鑑別度指數在 20 以上",
      suggested: false,
      reason: "有題目未通過鑑別度檢核。",
    },
    {
      key: "self_authored",
      label: "教師自行命題",
      suggested: null,
      reason: "需人工確認。",
    },
  ],
};

const items = [
  {
    itemId: "B-01",
    groupId: "",
    questionType: "應用題",
    stimulus: "",
    question: "請說明觀察紀錄如何整理。",
    options: [],
    answer: "略",
    explanation: "依紀錄說明即可。",
    objectiveIds: ["2-1-1"],
    score: 20,
  },
  {
    itemId: "A-01",
    groupId: "",
    questionType: "選擇題",
    stimulus: "",
    question: "哪一項可描述星星位置？",
    options: ["方位", "顏色", "座號"],
    answer: "1",
    explanation: "方位可描述位置。",
    objectiveIds: ["1-1-1"],
    score: 20,
  },
  {
    itemId: "G-01-1",
    groupId: "G-01",
    questionType: "選擇題",
    stimulus: "閱讀觀察紀錄後回答。",
    question: "小題一",
    options: ["甲", "乙", "丙"],
    answer: "1",
    explanation: "解析一",
    objectiveIds: ["1-1-1"],
    score: 20,
  },
  {
    itemId: "G-01-2",
    groupId: "G-01",
    questionType: "應用題",
    stimulus: "閱讀觀察紀錄後回答。",
    question: "小題二",
    options: [],
    answer: "略",
    explanation: "解析二",
    objectiveIds: ["2-1-1"],
    score: 20,
  },
  {
    itemId: "C-01",
    groupId: "",
    questionType: "填充題",
    stimulus: "",
    question: "填充題",
    options: [],
    answer: "星座盤",
    explanation: "解析",
    objectiveIds: ["1-1-1"],
    score: 20,
  },
];

describe("buildPrintData", () => {
  it("題號重編：混合題型輸入時大題順序與題內編號正確", () => {
    const data = buildPrintData({ project, allocations, objectives, items, auditReport });

    expect(data.studentPaper.sections.map((section) => section.questionType)).toEqual([
      "選擇題",
      "填充題",
      "應用題",
      "題組",
    ]);
    expect(data.studentPaper.sections[0].items[0]).toMatchObject({
      displayNumber: 1,
      displayLabel: "一、選擇題第 1 題",
    });
    expect(data.studentPaper.sections[2].items[0]).toMatchObject({
      displayNumber: 1,
      displayLabel: "三、應用題第 1 題",
    });
  });

  it("itemId 到卷面題號對應表正確", () => {
    const data = buildPrintData({ project, allocations, objectives, items, auditReport });

    expect(data.teacherPaper.itemIdToDisplayNumber).toMatchObject({
      "A-01": "一、選擇題第 1 題",
      "C-01": "二、填充題第 1 題",
      "B-01": "三、應用題第 1 題",
      "G-01-1": "四、題組第 1-1 題",
      "G-01-2": "四、題組第 1-2 題",
    });
  });

  it("reviewSheet.unitRows 的目標標號與佔分正確", () => {
    const data = buildPrintData({ project, allocations, objectives, items, auditReport });

    expect(data.reviewSheet.unitRows).toEqual([
      {
        unitName: "一、探索星空的奧祕",
        periodCount: 6,
        score: 60,
        objectiveIds: ["1-1-1"],
      },
      {
        unitName: "二、水溶液的變化",
        periodCount: 4,
        score: 40,
        objectiveIds: ["2-1-1"],
      },
    ]);
  });

  it("checklist 將 suggested true false null 轉換為三態", () => {
    const data = buildPrintData({ project, allocations, objectives, items, auditReport });

    expect(data.reviewSheet.checklist.map((entry) => ({
      key: entry.key,
      mark: entry.mark,
      needsHumanReview: entry.needsHumanReview,
    }))).toEqual([
      { key: "objective_alignment", mark: "☑", needsHumanReview: false },
      { key: "discrimination", mark: "☐", needsHumanReview: false },
      { key: "self_authored", mark: "☐", needsHumanReview: true },
    ]);
  });

  it("題組 stimulus 只出現一次，小題依序且不依題型拆散", () => {
    const data = buildPrintData({ project, allocations, objectives, items, auditReport });
    const groupSection = data.studentPaper.sections.find((section) => section.questionType === "題組");

    expect(groupSection.groups).toHaveLength(1);
    expect(groupSection.groups[0].stimulus).toBe("閱讀觀察紀錄後回答。");
    expect(groupSection.groups[0].items.map((entry) => entry.item.itemId)).toEqual([
      "G-01-1",
      "G-01-2",
    ]);
    expect(data.studentPaper.sections[0].items.map((entry) => entry.item.itemId)).toEqual(["A-01"]);
    expect(data.studentPaper.sections[2].items.map((entry) => entry.item.itemId)).toEqual(["B-01"]);
  });
});

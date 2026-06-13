import { describe, expect, it } from "vitest";
import { buildPrintData } from "../src/ui/buildPrintData.js";

const baseProject = {
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
  { id: "U1", name: "一、探索星空", periodCount: 6, suggestedScore: 60 },
  { id: "U2", name: "二、動物世界", periodCount: 4, suggestedScore: 40 },
];

const objectives = [
  {
    objectiveId: "1-1-1",
    unitName: "一、探索星空",
    lessonName: "1-1 星空位置",
    text: "能以方位和高度角描述星星位置。",
    periodCount: 3,
  },
  {
    objectiveId: "1-2-1",
    unitName: "一、探索星空",
    lessonName: "1-2 星座觀察",
    text: "能依觀察資料判斷星座位置變化。",
    periodCount: 3,
  },
  {
    objectiveId: "2-1-1",
    unitName: "二、動物世界",
    lessonName: "2-1 動物適應",
    text: "能說明動物構造與環境適應的關係。",
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
      reason: "有題目未達標準。",
    },
    {
      key: "self_authored",
      label: "教師自行命題",
      suggested: null,
      reason: "需人工確認。",
    },
  ],
};

const scienceItems = [
  {
    itemId: "A-01",
    groupId: "",
    questionType: "選擇題",
    stimulus: "",
    question: "星星位置可用哪兩項資料描述？",
    options: ["方位和高度角", "亮度和顏色", "距離和重量"],
    answer: "1",
    explanation: "方位和高度角可描述星星在天空中的位置。",
    objectiveIds: ["1-1-1"],
    score: 20,
  },
  {
    itemId: "A-02",
    groupId: "",
    questionType: "選擇題",
    stimulus: "",
    question: "觀察紀錄同時可支持哪兩個學習目標？",
    options: ["星星位置與星座變化", "岩石與天氣", "植物與水溫"],
    answer: "1",
    explanation: "此題同時對應兩個星空學習目標。",
    objectiveIds: ["1-1-1", "1-2-1"],
    score: 20,
  },
  {
    itemId: "B-01",
    groupId: "",
    questionType: "應用題",
    stimulus: "",
    question: "依觀察表說明星座位置變化。",
    options: [],
    answer: "能指出位置隨時間改變。",
    explanation: "需依資料推論。",
    objectiveIds: ["1-2-1"],
    score: 30,
  },
  {
    itemId: "C-01",
    groupId: "",
    questionType: "填充題",
    stimulus: "",
    question: "動物保護色有助於______。",
    options: [],
    answer: "躲避天敵",
    explanation: "保護色可降低被發現的機率。",
    objectiveIds: ["2-1-1"],
    score: 30,
  },
];

const groupItems = [
  {
    itemId: "G-01-1",
    groupId: "G-01",
    questionType: "選擇題",
    stimulus: "小組在夜間記錄星星的位置。",
    question: "小題一",
    options: ["甲", "乙", "丙"],
    answer: "1",
    explanation: "解析一",
    objectiveIds: ["1-1-1"],
    score: 10,
  },
  {
    itemId: "G-01-2",
    groupId: "G-01",
    questionType: "應用題",
    stimulus: "小組在夜間記錄星星的位置。",
    question: "小題二",
    options: [],
    answer: "能比較資料",
    explanation: "解析二",
    objectiveIds: ["1-2-1"],
    score: 10,
  },
];

describe("buildPrintData", () => {
  it("題號重編：混合題型輸入時大題順序與題內編號正確", () => {
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    expect(data.studentPaper.sections.map((section) => section.questionType)).toEqual([
      "選擇題",
      "填充題",
      "應用題",
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
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    expect(data.teacherPaper.itemIdToDisplayNumber).toMatchObject({
      "A-01": "一、選擇題第 1 題",
      "A-02": "一、選擇題第 2 題",
      "C-01": "二、填充題第 1 題",
      "B-01": "三、應用題第 1 題",
    });
    expect(data.teacherPaper.itemIdToReviewNumber).toMatchObject({
      "A-01": "選擇1",
      "A-02": "選擇2",
      "C-01": "填充1",
      "B-01": "應用1",
    });
  });

  it("reviewSheet.unitRows 的目標標號與佔分正確", () => {
    const data = buildPrintData({
      project: { ...baseProject, subject: "數學" },
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    expect(data.reviewSheet.format).toBe("non_chinese");
    expect(data.reviewSheet.unitRows).toEqual([
      {
        unitName: "一、探索星空",
        periodCount: 6,
        score: 60,
        objectiveIds: ["1-1-1", "1-2-1"],
      },
      {
        unitName: "二、動物世界",
        periodCount: 4,
        score: 40,
        objectiveIds: ["2-1-1"],
      },
    ]);
  });

  it("checklist 將 suggested true false null 轉換為三態", () => {
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

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

  it("題組 stimulus 一次，小題依序，跨大題不拆散", () => {
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: [...scienceItems, ...groupItems],
      auditReport,
    });
    const groupSection = data.studentPaper.sections.find(
      (section) => section.questionType === "題組",
    );

    expect(groupSection.groups).toHaveLength(1);
    expect(groupSection.groups[0].stimulus).toBe("小組在夜間記錄星星的位置。");
    expect(groupSection.groups[0].items.map((entry) => entry.item.itemId)).toEqual([
      "G-01-1",
      "G-01-2",
    ]);
  });

  it("自然格式 scienceRows 逐目標列出題型、題號、配分與合計", () => {
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    expect(data.reviewSheet.format).toBe("science");
    expect(data.reviewSheet.scienceQuestionTypes).toEqual([
      "選擇題",
      "填充題",
      "應用題",
    ]);
    expect(data.reviewSheet.scienceRows).toHaveLength(3);
    expect(data.reviewSheet.scienceRows[0]).toMatchObject({
      objectiveId: "1-1-1",
      objectiveText: "能以方位和高度角描述星星位置。",
      rowTotal: 30,
    });
    expect(data.reviewSheet.scienceRows[0].byType["選擇題"]).toEqual({
      itemNumbers: ["選擇1", "選擇2"],
      score: 30,
    });
    expect(data.reviewSheet.scienceRows[1].byType["應用題"]).toEqual({
      itemNumbers: ["應用1"],
      score: 30,
    });
    expect(data.reviewSheet.scienceRows[2].byType["填充題"]).toEqual({
      itemNumbers: ["填充1"],
      score: 30,
    });
    expect(data.reviewSheet.scienceTypeTotals).toEqual({
      選擇題: 40,
      填充題: 30,
      應用題: 30,
    });
    expect(data.reviewSheet.scienceGrandTotal).toBe(100);
  });

  it("自然格式一題掛兩目標時題號出現在兩列、配分平均分攤並產生 notice", () => {
    const data = buildPrintData({
      project: baseProject,
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    const firstRow = data.reviewSheet.scienceRows.find(
      (row) => row.objectiveId === "1-1-1",
    );
    const secondRow = data.reviewSheet.scienceRows.find(
      (row) => row.objectiveId === "1-2-1",
    );

    expect(firstRow.byType["選擇題"].itemNumbers).toContain("選擇2");
    expect(secondRow.byType["選擇題"].itemNumbers).toContain("選擇2");
    expect(firstRow.byType["選擇題"].score).toBe(30);
    expect(secondRow.byType["選擇題"].score).toBe(10);
    expect(data.reviewSheet.notices[0]).toContain("對應多個學習目標");
  });

  it("國語格式為 chinese_fallback 並仍提供非國語 unitRows", () => {
    const data = buildPrintData({
      project: { ...baseProject, subject: "國語" },
      allocations,
      objectives,
      items: scienceItems,
      auditReport,
    });

    expect(data.reviewSheet.format).toBe("chinese_fallback");
    expect(data.reviewSheet.chineseFallbackNotice).toContain("國語向度審核表");
    expect(data.reviewSheet.unitRows).toHaveLength(2);
  });

  it("format 依 subject 正確判定", () => {
    const cases = [
      ["自然", "science"],
      ["自然科", "science"],
      ["自然科學", "science"],
      ["自然領域", "science"],
      ["數學", "non_chinese"],
      ["數學科", "non_chinese"],
      ["社會", "non_chinese"],
      ["社會領域", "non_chinese"],
      ["英語", "non_chinese"],
      ["英文", "non_chinese"],
      ["國語", "chinese_fallback"],
      ["國文", "chinese_fallback"],
    ];

    cases.forEach(([subject, expectedFormat]) => {
      expect(
        buildPrintData({
          project: { ...baseProject, subject },
          allocations,
          objectives,
          items: scienceItems,
          auditReport,
        }).reviewSheet.format,
      ).toBe(expectedFormat);
    });
  });
});

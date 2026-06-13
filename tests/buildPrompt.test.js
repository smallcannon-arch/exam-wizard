import { describe, expect, it } from "vitest";
import {
  buildItemGenerationPrompt,
  parseItemsJson,
} from "../src/core/buildPrompt.js";

const requiredRules = [
  "不得直接照抄課本、習作或教科書廠商提供之試題，需重新設計情境。",
  "每一題（含題組中的每個小題）都必須在 objectiveIds 標明對應的學習目標編號。",
  "素養題組請提供 stimulus 情境文本，小題可對應不同學習目標。",
  "每題需提供 answer 與 explanation。",
  "每題需提供 estimatedTimeSeconds 與 discriminationPrediction，預估鑑別度需大於或等於 0.20。",
  "題目內容需符合5年級學生能力與真實情境，避免爭議性話題，符合性別平等原則，不得違背法規。",
];

const promptInput = {
  project: {
    subject: "自然",
    grade: 5,
    totalScore: 100,
  },
  allocations: [
    {
      id: "U1",
      name: "探索星空的奧祕",
      periodCount: 6,
      suggestedScore: 40,
    },
  ],
  objectives: [
    {
      objectiveId: "1-1-1",
      unitName: "探索星空的奧祕",
      lessonName: "星空觀察入門",
      text: "能以方向與仰角描述夜空中亮點的大略位置。",
      periodCount: 2,
    },
  ],
  blueprint: [
    {
      objectiveId: "1-1-1",
      questionTypes: ["選擇題", "應用題"],
      plannedScore: 4,
      groupHint: "可併入觀星情境題組",
    },
  ],
  materialText: "學生已練習用方位與仰角記錄夜空中的亮點。",
};

function createValidItem(overrides = {}) {
  return {
    itemId: "A-01",
    groupId: "",
    questionType: "選擇題",
    competencyType: "生活情境判讀",
    stimulus: "",
    question: "題幹文字",
    options: ["甲", "乙", "丙", "丁"],
    answer: "1",
    explanation: "解析文字",
    objectiveIds: ["1-1-1"],
    score: 4,
    estimatedTimeSeconds: 90,
    discriminationPrediction: 0.35,
    chineseDimension: null,
    reviewFlags: [],
    ...overrides,
  };
}

describe("buildItemGenerationPrompt", () => {
  it("完整輸入時 prompt 包含命題規則六句文字", () => {
    const result = buildItemGenerationPrompt(promptInput);

    expect(result.ok).toBe(true);
    requiredRules.forEach((rule) => {
      expect(result.prompt).toContain(rule);
    });
  });

  it("國語科 prompt 含 chineseDimension 要求，非國語科不含", () => {
    const chineseResult = buildItemGenerationPrompt({
      ...promptInput,
      project: {
        ...promptInput.project,
        subject: "國語",
      },
    });
    const scienceResult = buildItemGenerationPrompt(promptInput);

    expect(chineseResult.ok).toBe(true);
    expect(chineseResult.prompt).toContain("chineseDimension");
    expect(scienceResult.ok).toBe(true);
    expect(scienceResult.prompt).not.toContain("chineseDimension");
  });

  it("objectives 為空時回傳 ok false 與可讀錯誤", () => {
    const result = buildItemGenerationPrompt({
      ...promptInput,
      objectives: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("objectives 欄位不可為空陣列。");
  });
});

describe("parseItemsJson", () => {
  it("可解析乾淨 JSON", () => {
    const item = createValidItem();
    const result = parseItemsJson(JSON.stringify([item]));

    expect(result.ok).toBe(true);
    expect(result.items).toEqual([item]);
    expect(result.errors).toEqual([]);
  });

  it("可解析含 json 圍欄的輸入", () => {
    const item = createValidItem({ itemId: "A-02" });
    const result = parseItemsJson(`\`\`\`json\n${JSON.stringify([item])}\n\`\`\``);

    expect(result.ok).toBe(true);
    expect(result.items).toEqual([item]);
  });

  it("可解析前後有說明文字的輸入", () => {
    const item = createValidItem({ itemId: "A-03" });
    const result = parseItemsJson(`以下是題庫草稿：\n${JSON.stringify([item])}\n請參考。`);

    expect(result.ok).toBe(true);
    expect(result.items).toEqual([item]);
  });

  it("其中一題 score 為 0 時，errors 指出該題與欄位", () => {
    const result = parseItemsJson(
      JSON.stringify([createValidItem({ score: 0 })]),
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("第 1 題 score 欄位必須是大於 0 的數字。");
  });

  it("完全非 JSON 的文字回傳可讀錯誤", () => {
    const result = parseItemsJson("這不是 JSON 題庫。");

    expect(result.ok).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.errors).toContain("找不到 JSON 陣列，請確認已複製完整輸出。");
  });
});

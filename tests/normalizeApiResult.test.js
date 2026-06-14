import { describe, expect, it } from "vitest";
import { normalizeApiResult } from "../src/ui/apiClient.js";

const objective = {
  objectiveId: "4-1-1",
  unitName: "四、揭祕動物的世界",
  lessonName: "4-1 動物如何生存",
  text: "能說明動物身體構造與環境的關係。",
  periodCount: 2,
};

const item = {
  itemId: "A-01",
  groupId: "",
  questionType: "選擇題",
  competencyType: "一般題",
  stimulus: "",
  question: "下列哪一項最能幫助動物適應環境？",
  options: ["保護色", "固定不動", "不需食物"],
  answer: "1",
  explanation: "保護色可降低被發現的機率。",
  objectiveIds: ["4-1-1"],
  score: 4,
  estimatedTimeSeconds: 60,
  discriminationPrediction: 0.3,
  chineseDimension: null,
  reviewFlags: [],
};

describe("normalizeApiResult", () => {
  it("擷取成功時回傳學習目標與 notices", () => {
    expect(
      normalizeApiResult(
        { ok: true, objectives: [objective], notices: ["註：需人工確認節數。"] },
        "objectives",
      ),
    ).toEqual({
      ok: true,
      objectives: [objective],
      notices: ["註：需人工確認節數。"],
    });
  });

  it("出題成功時回傳 items", () => {
    expect(normalizeApiResult({ ok: true, items: [item] }, "items")).toEqual({
      ok: true,
      items: [item],
    });
  });

  it("ok false 時回傳後端錯誤訊息", () => {
    expect(
      normalizeApiResult({ ok: false, error: "AI 服務暫時無法使用。" }, "items"),
    ).toEqual({
      ok: false,
      error: "AI 服務暫時無法使用。",
    });
  });

  it("UPSTREAM_TIMEOUT 轉成分批生成失敗提示", () => {
    expect(
      normalizeApiResult({ ok: false, code: "UPSTREAM_TIMEOUT" }, "items"),
    ).toEqual({
      ok: false,
      error: "AI 生成超時或服務忙碌，已分批仍失敗，可改用手動出題指令。",
    });
  });

  it("FILE_TOO_LARGE 保留後端檔案過大訊息", () => {
    const result = normalizeApiResult(
      {
        ok: false,
        code: "FILE_TOO_LARGE",
        error: "檔案過大（上限約 18MB），請改傳單一課次/單元的 PDF 或截圖，或改用貼上文字。",
      },
      "objectives",
    );

    expect(result).toEqual({
      ok: false,
      error:
        "檔案過大（上限約 18MB），請改傳單一課次/單元的 PDF 或截圖，或改用貼上文字。",
    });
  });

  it("UNSUPPORTED_FILE_TYPE 保留不支援格式訊息", () => {
    const result = normalizeApiResult(
      {
        ok: false,
        code: "UNSUPPORTED_FILE_TYPE",
        error: "不支援的檔案格式，請改傳 PDF、JPG、PNG 或 WebP。",
      },
      "objectives",
    );

    expect(result).toEqual({
      ok: false,
      error: "不支援的檔案格式，請改傳 PDF、JPG、PNG 或 WebP。",
    });
  });

  it("缺 objectives 欄位時回傳可讀錯誤", () => {
    const result = normalizeApiResult({ ok: true }, "objectives");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("objectives 不是陣列時回傳可讀錯誤", () => {
    const result = normalizeApiResult(
      { ok: true, objectives: { objectiveId: "4-1-1" } },
      "objectives",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("學習目標");
  });

  it("items 缺 options 時回傳第幾題錯誤", () => {
    const { options, ...invalidItem } = item;
    const result = normalizeApiResult({ ok: true, items: [invalidItem] }, "items");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("第 1 題");
  });
});

describe("normalizeApiResult 題型建議", () => {
  const typeSuggestion = {
    objectiveId: "4-1-1",
    recommendedTypes: ["選擇題", "應用題"],
    reason: "此目標需要理解與應用，適合以選擇題搭配應用題檢核。",
  };

  it("typeSuggestions 成功時回傳 suggestions", () => {
    expect(
      normalizeApiResult(
        { ok: true, suggestions: [typeSuggestion] },
        "typeSuggestions",
      ),
    ).toEqual({
      ok: true,
      suggestions: [typeSuggestion],
    });
  });

  it("typeSuggestions 缺 suggestions 時回傳可讀錯誤", () => {
    const result = normalizeApiResult({ ok: true }, "typeSuggestions");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("題型建議");
  });

  it("typeSuggestions recommendedTypes 型別錯誤時回傳可讀錯誤", () => {
    const result = normalizeApiResult(
      {
        ok: true,
        suggestions: [{ ...typeSuggestion, recommendedTypes: "選擇題" }],
      },
      "typeSuggestions",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("第 1 筆題型建議");
  });
});

describe("normalizeApiResult 題組生成", () => {
  const group = {
    stimulus: "一段觀察紀錄文本。",
    stimulusTitle: "閱讀下文，回答第 1～2 題。",
    subItems: [
      {
        question: "第一小題",
        options: ["甲", "乙", "丙"],
        answer: "1",
        explanation: "解析一",
        objectiveId: "4-1-1",
        cognitiveLevel: "提取",
        questionType: "選擇題",
      },
      {
        question: "第二小題",
        options: [],
        answer: "可依資料推論",
        explanation: "解析二",
        objectiveId: "4-1-1",
        cognitiveLevel: "整合",
        questionType: "應用題",
      },
    ],
  };

  it("group 成功時回傳題組資料", () => {
    expect(normalizeApiResult({ ok: true, group }, "group")).toEqual({
      ok: true,
      group,
    });
  });

  it("group 缺小題時回傳可讀錯誤", () => {
    const result = normalizeApiResult(
      { ok: true, group: { ...group, subItems: [] } },
      "group",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("題組格式");
  });

  it("group cognitiveLevel 型別或值錯誤時回傳可讀錯誤", () => {
    const result = normalizeApiResult(
      {
        ok: true,
        group: {
          ...group,
          subItems: [{ ...group.subItems[0], cognitiveLevel: "記憶" }],
        },
      },
      "group",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("題組格式");
  });
});

describe("normalizeApiResult 整卷規劃", () => {
  const section = {
    title: "一、選擇題",
    kind: "normal",
    questionType: "選擇題",
    objectiveIds: ["4-1-1"],
    plannedCount: 6,
    groupPlan: null,
    rationale: "先檢核基本概念。",
  };

  it("sectionPlan 成功回傳 sections", () => {
    expect(
      normalizeApiResult(
        {
          ok: true,
          plan: {
            sections: [section],
          },
        },
        "sectionPlan",
      ),
    ).toEqual({
      ok: true,
      plan: {
        sections: [section],
      },
    });
  });

  it("sectionPlan 缺 sections 時給可讀錯誤", () => {
    const result = normalizeApiResult({ ok: true, plan: {} }, "sectionPlan");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("大題規劃草案");
  });

  it("sectionPlan 大題欄位不完整時指出第幾個大題", () => {
    const result = normalizeApiResult(
      {
        ok: true,
        plan: {
          sections: [{ ...section, objectiveIds: "4-1-1" }],
        },
      },
      "sectionPlan",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("第 1 個大題");
  });
});

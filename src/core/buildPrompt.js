import { validateItem } from "./schemas.js";

const REQUIRED_RULES = [
  "不得直接照抄課本、習作或教科書廠商提供之試題，需重新設計情境。",
  "每一題（含題組中的每個小題）都必須在 objectiveIds 標明對應的學習目標編號。",
  "素養題組請提供 stimulus 情境文本，小題可對應不同學習目標。",
  "每題需提供 answer 與 explanation。",
  "每題需提供 estimatedTimeSeconds 與 discriminationPrediction，預估鑑別度需大於或等於 0.20。",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(value, fallback = "未提供") {
  return hasText(value) ? value.trim() : fallback;
}

function validateRequiredArray(value, fieldName, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} 欄位必須是陣列。`);
    return false;
  }

  if (value.length === 0) {
    errors.push(`${fieldName} 欄位不可為空陣列。`);
    return false;
  }

  return true;
}

function getAllocationByUnitName(allocations) {
  const allocationByUnitName = new Map();

  if (!Array.isArray(allocations)) {
    return allocationByUnitName;
  }

  allocations.forEach((allocation) => {
    if (isPlainObject(allocation) && hasText(allocation.name)) {
      allocationByUnitName.set(allocation.name, allocation);
    }
  });

  return allocationByUnitName;
}

function formatProject(project) {
  const subject = normalizeText(project.subject, "未指定科目");
  const grade =
    typeof project.grade === "number" || typeof project.grade === "string"
      ? `${project.grade}年級`
      : "未指定年級";
  const totalScore =
    typeof project.totalScore === "number"
      ? `${project.totalScore}分`
      : "未指定總分";

  return { subject, grade, totalScore };
}

function buildObjectiveLines(objectives, allocations) {
  const allocationByUnitName = getAllocationByUnitName(allocations);

  return objectives.map((objective, index) => {
    const allocation = allocationByUnitName.get(objective.unitName);
    const suggestedScore =
      allocation && typeof allocation.suggestedScore === "number"
        ? `${allocation.suggestedScore}分`
        : "未提供";

    return `${index + 1}. ${objective.objectiveId}｜${objective.text}｜單元：${objective.unitName}｜建議配分：${suggestedScore}`;
  });
}

function buildBlueprintLines(blueprint) {
  return blueprint.map((entry, index) => {
    const questionTypes = Array.isArray(entry.questionTypes)
      ? entry.questionTypes.join("、")
      : "未指定";
    const plannedScore =
      typeof entry.plannedScore === "number"
        ? `${entry.plannedScore}分`
        : "未指定";
    const groupHint = hasText(entry.groupHint)
      ? `｜題組提示：${entry.groupHint}`
      : "";

    return `${index + 1}. ${entry.objectiveId}｜題型：${questionTypes}｜規劃配分：${plannedScore}${groupHint}`;
  });
}

function buildOutputFields(isChinese) {
  const fields = [
    "itemId：題號，例如 A-01。",
    "groupId：題組編號；非題組請填空字串。",
    "questionType：題型，例如 選擇題、應用題、簡答題。",
    "competencyType：能力或素養類型。",
    "stimulus：題組引文或情境描述，無則為空字串。",
    "question：題幹文字。",
    "options：選項陣列；非選擇題可為空陣列。",
    "answer：標準答案。",
    "explanation：解析文字。",
    "objectiveIds：對應學習目標編號陣列，至少一筆。",
    "score：題目配分，需大於 0。",
    "estimatedTimeSeconds：預估作答秒數。",
    "discriminationPrediction：預估鑑別度，需介於 0 與 1，且建議大於或等於 0.20。",
    "reviewFlags：審題旗標陣列，無則為空陣列。",
  ];

  if (isChinese) {
    fields.splice(
      fields.length - 1,
      0,
      "chineseDimension：國語科每題必填，只能是 word_phrase、sentence_grammar 或 reading_writing。",
    );
  }

  return fields;
}

function buildGenericExample(isChinese) {
  const example = {
    itemId: "A-01",
    groupId: "",
    questionType: "選擇題",
    competencyType: "生活情境判讀",
    stimulus: "學校園遊會後，班級整理攤位收支紀錄。",
    question: "下列哪一項做法最能幫助班級確認紀錄是否完整？",
    options: ["核對收入與支出項目", "只看攤位布置顏色", "刪除所有備註", "忽略零用金紀錄"],
    answer: "1",
    explanation: "核對收入與支出項目能協助確認紀錄完整性。",
    objectiveIds: ["範例-1"],
    score: 2,
    estimatedTimeSeconds: 60,
    discriminationPrediction: 0.3,
    reviewFlags: [],
  };

  if (isChinese) {
    example.chineseDimension = "reading_writing";
  }

  return JSON.stringify(example, null, 2);
}

export function buildItemGenerationPrompt(input) {
  const source = isPlainObject(input) ? input : {};
  const {
    project = {},
    allocations = [],
    objectives,
    blueprint,
    materialText = "",
  } = source;
  const errors = [];
  const hasObjectives = validateRequiredArray(objectives, "objectives", errors);
  const hasBlueprint = validateRequiredArray(blueprint, "blueprint", errors);

  if (!isPlainObject(project)) {
    errors.push("project 欄位必須是物件。");
  }

  if (errors.length > 0 || !hasObjectives || !hasBlueprint) {
    return { ok: false, errors };
  }

  const { subject, grade, totalScore } = formatProject(project);
  const isChinese = project.subject === "國語";
  const abilityRule = `題目內容需符合${grade}學生能力與真實情境，避免爭議性話題，符合性別平等原則，不得違背法規。`;
  const rules = [...REQUIRED_RULES, abilityRule];
  const outputFields = buildOutputFields(isChinese);
  const chineseRequirement = isChinese
    ? "\n國語科額外要求：每題必須標明 chineseDimension，且只能使用 word_phrase、sentence_grammar、reading_writing。"
    : "";

  const prompt = [
    "# 角色與任務",
    `你是國小${grade}${subject}命題協助者，依下列學習目標與命題藍圖生成試題草稿，供教師修改定稿。`,
    "",
    "# 考試範圍與教材摘要",
    `科目：${subject}`,
    `年級：${grade}`,
    `總分：${totalScore}`,
    `教材摘要：${normalizeText(materialText, "教師未提供教材摘要；請僅依學習目標與命題藍圖設計，不得自行假造教材細節。")}`,
    "",
    "# 學習目標清單",
    ...buildObjectiveLines(objectives, allocations),
    "",
    "# 命題藍圖",
    ...buildBlueprintLines(blueprint),
    "",
    "# 命題規則",
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "# 輸出格式",
    "請僅輸出一個 JSON 陣列，不得包含任何說明文字或 Markdown 標記。",
    "每一筆 item 必須包含以下欄位：",
    ...outputFields.map((field) => `- ${field}`),
    chineseRequirement.trim(),
    "以下是一筆與本次科目無關的通用範例，只用來示範欄位格式，請勿仿寫其內容：",
    buildGenericExample(isChinese),
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    ok: true,
    prompt,
  };
}

function extractJsonArrayText(rawText) {
  if (typeof rawText !== "string") {
    return {
      ok: false,
      error: "輸入內容必須是字串。",
    };
  }

  const withoutFence = rawText
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const startIndex = withoutFence.indexOf("[");
  const endIndex = withoutFence.lastIndexOf("]");

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      ok: false,
      error: "找不到 JSON 陣列，請確認已複製完整輸出。",
    };
  }

  return {
    ok: true,
    jsonText: withoutFence.slice(startIndex, endIndex + 1),
  };
}

export function parseItemsJson(rawText) {
  const extracted = extractJsonArrayText(rawText);

  if (!extracted.ok) {
    return {
      ok: false,
      items: [],
      errors: [extracted.error],
    };
  }

  let items;

  try {
    items = JSON.parse(extracted.jsonText);
  } catch {
    return {
      ok: false,
      items: [],
      errors: ["JSON 解析失敗，請確認輸出為合法 JSON 陣列。"],
    };
  }

  if (!Array.isArray(items)) {
    return {
      ok: false,
      items: [],
      errors: ["解析結果不是 JSON 陣列，請確認已複製完整輸出。"],
    };
  }

  const errors = [];

  items.forEach((item, index) => {
    const result = validateItem(item);

    result.errors.forEach((error) => {
      errors.push(`第 ${index + 1} 題 ${error}`);
    });
  });

  return {
    ok: errors.length === 0,
    items,
    errors,
  };
}

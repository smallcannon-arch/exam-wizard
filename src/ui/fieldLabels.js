const FIELD_LABELS = {
  objectiveId: "目標編號",
  unitName: "大單元名稱",
  lessonName: "小單元（課）名稱",
  text: "學習目標",
  periodCount: "授課節數",
  itemId: "題號",
  groupId: "題組編號",
  questionType: "題型",
  competencyType: "素養類型",
  stimulus: "題組情境",
  question: "題幹",
  options: "選項",
  answer: "答案",
  explanation: "解析",
  score: "配分",
  objectiveIds: "對應目標編號",
  estimatedTimeSeconds: "預估作答秒數",
  discriminationPrediction: "預估鑑別度",
  chineseDimension: "評量向度",
  reviewFlags: "審題標記",
};

const FIELD_NAMES = Object.keys(FIELD_LABELS).sort((a, b) => b.length - a.length);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toFieldLabel(name) {
  return FIELD_LABELS[name] ?? name;
}

export function replaceFieldLabels(message) {
  return FIELD_NAMES.reduce((currentMessage, fieldName) => {
    const pattern = new RegExp(`\\b${escapeRegExp(fieldName)}\\b`, "g");
    return currentMessage.replace(pattern, FIELD_LABELS[fieldName]);
  }, String(message ?? ""));
}

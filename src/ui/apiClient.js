import { API_BASE } from "./apiConfig.js";

const DEFAULT_TIMEOUT_MS = 60000;
const TIMEOUT_ERROR =
  "AI 服務回應逾時，請稍後再試，或改用下方手動貼回。";
const GENERIC_ERROR = "AI 服務暫時無法使用，請稍後再試，或改用手動貼回。";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createError(message = GENERIC_ERROR) {
  return {
    ok: false,
    error: hasText(message) ? message : GENERIC_ERROR,
  };
}

function isValidObjective(objective) {
  return (
    isPlainObject(objective) &&
    hasText(objective.objectiveId) &&
    typeof objective.unitName === "string" &&
    typeof objective.lessonName === "string" &&
    hasText(objective.text) &&
    typeof objective.periodCount === "number" &&
    Number.isFinite(objective.periodCount) &&
    objective.periodCount > 0
  );
}

function isValidItem(item) {
  return (
    isPlainObject(item) &&
    hasText(item.itemId) &&
    typeof item.groupId === "string" &&
    typeof item.questionType === "string" &&
    typeof item.competencyType === "string" &&
    typeof item.stimulus === "string" &&
    hasText(item.question) &&
    Array.isArray(item.options) &&
    item.options.every((option) => typeof option === "string") &&
    typeof item.answer === "string" &&
    typeof item.explanation === "string" &&
    Array.isArray(item.objectiveIds) &&
    item.objectiveIds.every((objectiveId) => typeof objectiveId === "string") &&
    typeof item.score === "number" &&
    Number.isFinite(item.score) &&
    typeof item.estimatedTimeSeconds === "number" &&
    Number.isFinite(item.estimatedTimeSeconds) &&
    typeof item.discriminationPrediction === "number" &&
    Number.isFinite(item.discriminationPrediction) &&
    (item.chineseDimension === null || typeof item.chineseDimension === "string") &&
    Array.isArray(item.reviewFlags) &&
    item.reviewFlags.every((flag) => typeof flag === "string")
  );
}

export function normalizeApiResult(raw, kind) {
  if (!isPlainObject(raw)) {
    return createError("AI 回覆格式不完整，請改用手動貼回。");
  }

  if (raw.ok !== true) {
    return createError(raw.error);
  }

  if (kind === "objectives") {
    if (!Array.isArray(raw.objectives)) {
      return createError("AI 回覆缺少學習目標清單，請改用手動貼回。");
    }

    const invalidIndex = raw.objectives.findIndex(
      (objective) => !isValidObjective(objective),
    );

    if (invalidIndex >= 0) {
      return createError(
        `AI 回覆第 ${invalidIndex + 1} 筆學習目標格式不完整，請改用手動貼回。`,
      );
    }

    return {
      ok: true,
      objectives: raw.objectives,
      notices: Array.isArray(raw.notices)
        ? raw.notices.filter((notice) => typeof notice === "string")
        : [],
    };
  }

  if (kind === "items") {
    if (!Array.isArray(raw.items)) {
      return createError("AI 回覆缺少題庫清單，請改用手動貼回。");
    }

    const invalidIndex = raw.items.findIndex((item) => !isValidItem(item));

    if (invalidIndex >= 0) {
      return createError(
        `AI 回覆第 ${invalidIndex + 1} 題格式不完整，請改用手動貼回。`,
      );
    }

    return {
      ok: true,
      items: raw.items,
    };
  }

  return createError("AI 回覆類型無法辨識，請改用手動貼回。");
}

async function postApi(path, body, kind, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let raw;

    try {
      raw = await response.json();
    } catch {
      raw = null;
    }

    if (!response.ok) {
      return createError(raw?.error);
    }

    return normalizeApiResult(raw, kind);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return createError(TIMEOUT_ERROR);
    }

    return createError(GENERIC_ERROR);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractObjectivesViaApi({ project, materialText }) {
  return postApi(
    "/extract-objectives",
    {
      project,
      materialText,
    },
    "objectives",
  );
}

export function generateItemsViaApi({
  project,
  objectives,
  blueprint,
  materialText,
}) {
  return postApi(
    "/generate-items",
    {
      project,
      objectives,
      blueprint,
      materialText,
    },
    "items",
  );
}

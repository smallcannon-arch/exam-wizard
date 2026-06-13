import { API_BASE } from "./apiConfig.js";

const DEFAULT_TIMEOUT_MS = 60000;
const TIMEOUT_ERROR =
  "AI 服務回應逾時，請稍後再試，或改用下方手動貼回。";
const GENERIC_ERROR =
  "AI 服務暫時無法使用，請稍後再試，或改用下方手動貼回。";
const GENERATION_BUSY_ERROR =
  "AI 生成超時或服務忙碌，已分批仍失敗，可改用手動出題指令。";

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

function isUpstreamTimeout(raw) {
  return isPlainObject(raw) && raw.code === "UPSTREAM_TIMEOUT";
}

function getHttpError(raw, kind, status) {
  if (kind === "items" && (status === 502 || isUpstreamTimeout(raw))) {
    return GENERATION_BUSY_ERROR;
  }

  return isPlainObject(raw) && hasText(raw.error) ? raw.error : GENERIC_ERROR;
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

function isValidTypeSuggestion(suggestion) {
  return (
    isPlainObject(suggestion) &&
    hasText(suggestion.objectiveId) &&
    Array.isArray(suggestion.recommendedTypes) &&
    suggestion.recommendedTypes.length > 0 &&
    suggestion.recommendedTypes.every((questionType) => typeof questionType === "string") &&
    typeof suggestion.reason === "string"
  );
}

export function normalizeApiResult(raw, kind) {
  if (!isPlainObject(raw)) {
    return createError("AI 回覆格式不正確，請改用手動貼回。");
  }

  if (raw.ok !== true) {
    if (kind === "items" && isUpstreamTimeout(raw)) {
      return createError(GENERATION_BUSY_ERROR);
    }

    return createError(raw.error);
  }

  if (kind === "typeSuggestions") {
    return normalizeTypeSuggestionsResult(raw);
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
      return createError("AI 回覆缺少題目清單，請改用手動貼回。");
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

  return createError("AI 回覆類型不正確，請改用手動貼回。");
}

function normalizeTypeSuggestionsResult(raw) {
  if (!Array.isArray(raw.suggestions)) {
    return createError("AI 沒有回傳題型建議清單，請改用自行指定題型。");
  }

  const invalidIndex = raw.suggestions.findIndex(
    (suggestion) => !isValidTypeSuggestion(suggestion),
  );

  if (invalidIndex >= 0) {
    return createError(
      `AI 回覆的第 ${invalidIndex + 1} 筆題型建議格式不完整，請改用自行指定題型。`,
    );
  }

  return {
    ok: true,
    suggestions: raw.suggestions,
  };
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
      return createError(getHttpError(raw, kind, response.status));
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
  perObjective = 1,
  requestedItemCount = null,
}) {
  return postApi(
    "/generate-items",
    {
      project,
      objectives,
      blueprint,
      materialText,
      perObjective,
      requestedItemCount,
    },
    "items",
  );
}

export function suggestTypesViaApi({ project, objectives }) {
  return postApi(
    "/suggest-types",
    {
      project,
      objectives,
    },
    "typeSuggestions",
  );
}

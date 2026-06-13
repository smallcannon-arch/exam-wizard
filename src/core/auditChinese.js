import { CHINESE_DIMENSIONS } from "./config/chineseDimensions.js";

const DIMENSION_ORDER = [
  "word_phrase",
  "sentence_grammar",
  "reading_writing",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getItemId(item, index) {
  if (isPlainObject(item) && hasText(item.itemId)) {
    return item.itemId;
  }

  return `第 ${index + 1} 筆試題`;
}

function raiseSeverity(currentSeverity, nextSeverity) {
  const order = { pass: 0, warning: 1, error: 2 };
  return order[nextSeverity] > order[currentSeverity]
    ? nextSeverity
    : currentSeverity;
}

function createEmptyDimensionScores() {
  return new Map(DIMENSION_ORDER.map((dimension) => [dimension, 0]));
}

function createDimensionResults({
  band,
  dimensionScores,
  totalScore,
  tolerancePercentagePoints,
}) {
  const ratios = CHINESE_DIMENSIONS.ratiosByBand[band];

  return DIMENSION_ORDER.map((dimension) => {
    const expectedRatio = ratios[dimension];
    const actualScore = dimensionScores.get(dimension);
    const actualRatio =
      totalScore > 0 ? roundTo(actualScore / totalScore, 4) : 0;
    const diffPercentagePoints = roundTo(
      (actualRatio - expectedRatio) * 100,
      2,
    );
    let status = "pass";

    if (actualScore === 0) {
      status = "error";
    } else if (Math.abs(diffPercentagePoints) > tolerancePercentagePoints) {
      status = "warning";
    }

    return {
      dimension,
      label: CHINESE_DIMENSIONS.labels[dimension],
      expectedRatio,
      actualScore,
      actualRatio,
      diffPercentagePoints,
      status,
    };
  });
}

export function auditChinese(input) {
  const source = isPlainObject(input) ? input : {};
  const { grade, items } = source;
  const options = isPlainObject(source.options) ? source.options : {};
  const tolerancePercentagePoints = isFiniteNumber(
    options.tolerancePercentagePoints,
  )
    ? options.tolerancePercentagePoints
    : CHINESE_DIMENSIONS.tolerancePercentagePoints;
  const band = CHINESE_DIMENSIONS.gradeToBand[grade] ?? null;
  const messages = [];

  if (!band) {
    messages.push("grade 欄位必須是 1～6 的年級。");
  }

  if (!Array.isArray(items)) {
    messages.push("items 欄位必須是陣列。");
  } else if (items.length === 0) {
    messages.push("items 欄位不可為空陣列，無法檢核國語科評量向度比例。");
  }

  if (!band || !Array.isArray(items) || items.length === 0) {
    return {
      severity: "error",
      band,
      dimensionResults: [],
      missingDimensionItemIds: [],
      messages,
    };
  }

  const validDimensions = new Set(DIMENSION_ORDER);
  const dimensionScores = createEmptyDimensionScores();
  const missingDimensionItemIds = [];
  let totalScore = 0;
  let severity = "pass";

  items.forEach((item, index) => {
    const itemId = getItemId(item, index);

    if (!isPlainObject(item)) {
      messages.push(`第 ${index + 1} 筆試題必須是物件。`);
      severity = raiseSeverity(severity, "error");
      return;
    }

    if (!isFiniteNumber(item.score) || item.score <= 0) {
      messages.push(`第 ${index + 1} 筆試題 ${itemId} 的 score 欄位必須是正數。`);
      severity = raiseSeverity(severity, "error");
      return;
    }

    totalScore += item.score;

    if (!validDimensions.has(item.chineseDimension)) {
      missingDimensionItemIds.push(itemId);
      messages.push(
        `試題 ${itemId} 缺少 chineseDimension，或其值不在 word_phrase、sentence_grammar、reading_writing 範圍內。`,
      );
      severity = raiseSeverity(severity, "warning");
      return;
    }

    dimensionScores.set(
      item.chineseDimension,
      dimensionScores.get(item.chineseDimension) + item.score,
    );
  });

  if (totalScore <= 0) {
    messages.push("全卷總分必須大於 0，無法計算國語科評量向度比例。");
    return {
      severity: "error",
      band,
      dimensionResults: [],
      missingDimensionItemIds,
      messages,
    };
  }

  const dimensionResults = createDimensionResults({
    band,
    dimensionScores,
    totalScore,
    tolerancePercentagePoints,
  });

  dimensionResults.forEach((result) => {
    if (result.status === "error") {
      severity = raiseSeverity(severity, "error");
      messages.push(`「${result.label}」向度未配置任何題目分數。`);
      return;
    }

    if (result.status === "warning") {
      severity = raiseSeverity(severity, "warning");
      messages.push(
        `「${result.label}」向度實際比例 ${roundTo(result.actualRatio * 100, 2)}%，與預期比例 ${roundTo(result.expectedRatio * 100, 2)}% 相差 ${result.diffPercentagePoints} 個百分點，超過 ${tolerancePercentagePoints} 個百分點容差。`,
      );
    }
  });

  if (messages.length === 0) {
    messages.push("國語科三大評量向度配分比例符合暫定年段比例。");
  }

  return {
    severity,
    band,
    dimensionResults,
    missingDimensionItemIds,
    messages,
  };
}

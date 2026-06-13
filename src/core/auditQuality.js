function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getItemId(item, index) {
  if (isPlainObject(item) && hasText(item.itemId)) {
    return item.itemId;
  }

  return `第 ${index + 1} 筆試題`;
}

function getStatus(issues) {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error";
  }

  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }

  return "pass";
}

function raiseSeverity(currentSeverity, nextSeverity) {
  const order = { pass: 0, warning: 1, error: 2 };
  return order[nextSeverity] > order[currentSeverity]
    ? nextSeverity
    : currentSeverity;
}

function checkItemQuality(item, index, minDiscrimination) {
  const itemId = getItemId(item, index);
  const issues = [];

  if (!isPlainObject(item)) {
    return {
      itemId,
      status: "error",
      issues: ["試題資料必須是物件。"],
    };
  }

  if (
    item.discriminationPrediction === undefined ||
    item.discriminationPrediction === null
  ) {
    issues.push({
      severity: "warning",
      message: "未填預估鑑別度，請命題教師補估。",
    });
  } else if (!isFiniteNumber(item.discriminationPrediction)) {
    issues.push({
      severity: "error",
      message: "預估鑑別度必須是數字。",
    });
  } else if (item.discriminationPrediction < minDiscrimination) {
    issues.push({
      severity: "error",
      message: `預估鑑別度 ${item.discriminationPrediction} 低於 ${minDiscrimination}，請調整題目品質或替換題目。`,
    });
  }

  if (!hasText(item.answer)) {
    issues.push({
      severity: "error",
      message: "answer 欄位不可空白，請補上標準答案。",
    });
  }

  if (!hasText(item.explanation)) {
    issues.push({
      severity: "warning",
      message: "explanation 欄位缺漏，請補上解析供審題使用。",
    });
  }

  if (
    item.questionType === "選擇題" &&
    (!Array.isArray(item.options) || item.options.length < 3)
  ) {
    issues.push({
      severity: "error",
      message: "選擇題 options 至少需要 3 個選項。",
    });
  }

  return {
    itemId,
    status: getStatus(issues),
    issues: issues.map((issue) => issue.message),
  };
}

export function auditQuality(input) {
  const source = isPlainObject(input) ? input : {};
  const { items } = source;
  const options = isPlainObject(source.options) ? source.options : {};
  const minDiscrimination =
    isFiniteNumber(options.minDiscrimination) && options.minDiscrimination >= 0
      ? options.minDiscrimination
      : 0.2;

  if (!Array.isArray(items)) {
    return {
      severity: "error",
      itemResults: [],
      messages: ["items 欄位必須是陣列。"],
    };
  }

  if (items.length === 0) {
    return {
      severity: "error",
      itemResults: [],
      messages: ["items 欄位不可為空陣列，無法檢核題目品質。"],
    };
  }

  const itemResults = items.map((item, index) =>
    checkItemQuality(item, index, minDiscrimination),
  );
  const severity = itemResults.reduce(
    (currentSeverity, result) => raiseSeverity(currentSeverity, result.status),
    "pass",
  );
  const errorCount = itemResults.filter(
    (result) => result.status === "error",
  ).length;
  const warningCount = itemResults.filter(
    (result) => result.status === "warning",
  ).length;
  const messages =
    severity === "pass"
      ? ["所有題目的品質欄位檢核通過。"]
      : [
          `題目品質檢核發現 ${errorCount} 題 error、${warningCount} 題 warning，請依 itemResults 逐題修正。`,
        ];

  return {
    severity,
    itemResults,
    messages,
  };
}

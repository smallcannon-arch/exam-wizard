function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidSeconds(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function createOutOfRangeMessage(estimatedMinutes, minMinutes, maxMinutes) {
  if (estimatedMinutes < minMinutes) {
    const difference = minMinutes - estimatedMinutes;

    return {
      severity: difference <= 5 ? "warning" : "error",
      message: `預估應試時間 ${estimatedMinutes} 分鐘，低於 ${minMinutes}～${maxMinutes} 分鐘規定。`,
      suggestedAdjustment: `建議增加約 ${difference} 分鐘的題量，使全卷應試時間接近規定範圍。`,
    };
  }

  const difference = estimatedMinutes - maxMinutes;

  return {
    severity: difference <= 5 ? "warning" : "error",
    message: `預估應試時間 ${estimatedMinutes} 分鐘，高於 ${minMinutes}～${maxMinutes} 分鐘規定。`,
    suggestedAdjustment: `建議刪減約 ${difference} 分鐘的題量，使全卷應試時間接近規定範圍。`,
  };
}

export function auditTime(input) {
  const source = isPlainObject(input) ? input : {};
  const { items } = source;
  const options = isPlainObject(source.options) ? source.options : {};
  const minMinutes =
    typeof options.minMinutes === "number" && Number.isFinite(options.minMinutes)
      ? options.minMinutes
      : 40;
  const maxMinutes =
    typeof options.maxMinutes === "number" && Number.isFinite(options.maxMinutes)
      ? options.maxMinutes
      : 60;

  if (!Array.isArray(items)) {
    return {
      severity: "error",
      totalSeconds: 0,
      estimatedMinutes: 0,
      missingItemIds: [],
      message: "items 欄位必須是陣列。",
      suggestedAdjustment: null,
    };
  }

  if (items.length === 0) {
    return {
      severity: "error",
      totalSeconds: 0,
      estimatedMinutes: 0,
      missingItemIds: [],
      message: "items 欄位不可為空陣列，無法檢核預估應試時間。",
      suggestedAdjustment: null,
    };
  }

  const missingItemIds = [];
  const totalSeconds = items.reduce((sum, item, index) => {
    if (!isPlainObject(item) || !isValidSeconds(item.estimatedTimeSeconds)) {
      missingItemIds.push(getItemId(item, index));
      return sum;
    }

    return sum + item.estimatedTimeSeconds;
  }, 0);
  const estimatedMinutes = Math.round(totalSeconds / 60);
  let severity = "pass";
  let message = `預估應試時間 ${estimatedMinutes} 分鐘，符合 ${minMinutes}～${maxMinutes} 分鐘規定。`;
  let suggestedAdjustment = null;

  if (estimatedMinutes < minMinutes || estimatedMinutes > maxMinutes) {
    const rangeResult = createOutOfRangeMessage(
      estimatedMinutes,
      minMinutes,
      maxMinutes,
    );

    severity = rangeResult.severity;
    message = rangeResult.message;
    suggestedAdjustment = rangeResult.suggestedAdjustment;
  }

  if (missingItemIds.length > 0) {
    severity = raiseSeverity(severity, "warning");
    message += ` 另有 ${missingItemIds.length} 題缺 estimatedTimeSeconds，已以 0 秒計入：${missingItemIds.join("、")}。`;
  }

  return {
    severity,
    totalSeconds,
    estimatedMinutes,
    missingItemIds,
    message,
    suggestedAdjustment,
  };
}

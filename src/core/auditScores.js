const FLOATING_POINT_EPSILON = 1e-9;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isEffectivelyZero(value) {
  return Math.abs(value) < FLOATING_POINT_EPSILON;
}

function normalizeTinyDifference(value) {
  return isEffectivelyZero(value) ? 0 : value;
}

function getItemId(item, index) {
  if (isPlainObject(item) && hasText(item.itemId)) {
    return item.itemId;
  }

  return `第 ${index + 1} 筆試題`;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function validateRequiredArray(value, fieldName, messages) {
  if (!Array.isArray(value)) {
    messages.push(`${fieldName} 欄位必須是陣列。`);
    return false;
  }

  if (value.length === 0) {
    messages.push(`${fieldName} 欄位不可為空陣列。`);
    return false;
  }

  return true;
}

function createObjectiveUnitMap(objectives, allocationNames, messages) {
  const objectiveUnitMap = new Map();

  objectives.forEach((objective, index) => {
    if (!isPlainObject(objective)) {
      messages.push(`第 ${index + 1} 筆學習目標必須是物件。`);
      return;
    }

    if (!hasText(objective.objectiveId)) {
      messages.push(
        `第 ${index + 1} 筆學習目標 objectiveId 欄位必須是非空白字串。`,
      );
      return;
    }

    if (!hasText(objective.unitName)) {
      messages.push(
        `第 ${index + 1} 筆學習目標 unitName 欄位必須是非空白字串。`,
      );
      return;
    }

    if (!allocationNames.has(objective.unitName)) {
      messages.push(
        `第 ${index + 1} 筆學習目標 ${objective.objectiveId} 的 unitName「${objective.unitName}」無法對應到 allocations。`,
      );
      return;
    }

    objectiveUnitMap.set(objective.objectiveId, objective.unitName);
  });

  return objectiveUnitMap;
}

function createUnitResults(allocations, unitActualScores) {
  return allocations.map((allocation, index) => {
    const unitName =
      isPlainObject(allocation) && hasText(allocation.name)
        ? allocation.name
        : `第 ${index + 1} 筆 allocations`;
    const suggestedScore =
      isPlainObject(allocation) && isFiniteNumber(allocation.suggestedScore)
        ? allocation.suggestedScore
        : 0;
    const actualScore = unitActualScores.get(unitName) ?? 0;
    const diff = normalizeTinyDifference(actualScore - suggestedScore);

    return {
      unitName,
      suggestedScore,
      actualScore,
      diff,
      status: isEffectivelyZero(diff) ? "pass" : "error",
    };
  });
}

export function auditScores(input) {
  const source = isPlainObject(input) ? input : {};
  const { allocations, objectives, items } = source;
  const options = isPlainObject(source.options) ? source.options : {};
  const totalScoreExpected = isFiniteNumber(options.totalScore)
    ? options.totalScore
    : 100;
  const messages = [];
  const hasValidAllocations = validateRequiredArray(
    allocations,
    "allocations",
    messages,
  );
  const hasValidObjectives = validateRequiredArray(
    objectives,
    "objectives",
    messages,
  );
  const hasValidItems = validateRequiredArray(items, "items", messages);
  const usableAllocations = hasValidAllocations ? allocations : [];
  const unitActualScores = new Map();
  const allocationNames = new Set();
  const crossUnitItemIds = [];
  let totalScoreActual = 0;

  usableAllocations.forEach((allocation, index) => {
    if (!isPlainObject(allocation)) {
      messages.push(`第 ${index + 1} 筆 allocations 必須是物件。`);
      return;
    }

    if (!hasText(allocation.name)) {
      messages.push(`第 ${index + 1} 筆 allocations name 欄位必須是非空白字串。`);
      return;
    }

    if (!isFiniteNumber(allocation.suggestedScore)) {
      messages.push(
        `第 ${index + 1} 筆 allocations suggestedScore 欄位必須是數字。`,
      );
      return;
    }

    allocationNames.add(allocation.name);
    unitActualScores.set(allocation.name, 0);
  });

  const objectiveUnitMap =
    hasValidObjectives && hasValidAllocations
      ? createObjectiveUnitMap(objectives, allocationNames, messages)
      : new Map();

  if (hasValidItems) {
    items.forEach((item, index) => {
      const itemId = getItemId(item, index);

      if (!isPlainObject(item)) {
        messages.push(`第 ${index + 1} 筆試題必須是物件。`);
        return;
      }

      if (!isFiniteNumber(item.score)) {
        messages.push(`第 ${index + 1} 筆試題 ${itemId} 的 score 欄位必須是數字。`);
        return;
      }

      totalScoreActual += item.score;

      if (!Array.isArray(item.objectiveIds) || item.objectiveIds.length === 0) {
        messages.push(
          `第 ${index + 1} 筆試題 ${itemId} 的 objectiveIds 欄位必須是至少一筆的陣列。`,
        );
        return;
      }

      const unitNames = [];
      const unknownObjectiveIds = [];

      uniqueValues(item.objectiveIds).forEach((objectiveId) => {
        if (!objectiveUnitMap.has(objectiveId)) {
          unknownObjectiveIds.push(objectiveId);
          return;
        }

        unitNames.push(objectiveUnitMap.get(objectiveId));
      });

      if (unknownObjectiveIds.length > 0) {
        messages.push(
          `第 ${index + 1} 筆試題 ${itemId} 的 objectiveIds 引用了無法對應到任何單元的目標編號：${unknownObjectiveIds.join("、")}。`,
        );
        return;
      }

      const uniqueUnitNames = uniqueValues(unitNames);

      if (uniqueUnitNames.length === 1) {
        const unitName = uniqueUnitNames[0];
        unitActualScores.set(unitName, unitActualScores.get(unitName) + item.score);
        return;
      }

      const splitScore = item.score / uniqueUnitNames.length;
      crossUnitItemIds.push(itemId);
      messages.push(
        `試題 ${itemId} 的目標橫跨多個單元，已將分數平均分攤；跨單元題在零誤差規則下極易造成配分不一致，建議調整該題目標歸屬或配分設計。`,
      );

      uniqueUnitNames.forEach((unitName) => {
        unitActualScores.set(
          unitName,
          unitActualScores.get(unitName) + splitScore,
        );
      });
    });
  }

  totalScoreActual = normalizeTinyDifference(totalScoreActual);
  const totalDiff = normalizeTinyDifference(
    totalScoreActual - totalScoreExpected,
  );
  const totalScoreHasError = !isEffectivelyZero(totalDiff);

  if (totalScoreHasError) {
    messages.push(
      `全卷總分為 ${totalScoreActual} 分，應為 ${totalScoreExpected} 分，差 ${Math.abs(totalDiff)} 分。`,
    );
  }

  const unitResults = createUnitResults(usableAllocations, unitActualScores);
  unitResults
    .filter((result) => result.status === "error")
    .forEach((result) => {
      messages.push(
        `單元「${result.unitName}」實際配分 ${result.actualScore} 分，建議配分 ${result.suggestedScore} 分，差異 ${result.diff} 分。`,
      );
    });

  const hasStructuralError = messages.some(
    (message) =>
      message.includes("必須") ||
      message.includes("不可為空") ||
      message.includes("無法對應到"),
  );
  const hasUnitError = unitResults.some((result) => result.status === "error");
  let severity = "pass";

  if (hasStructuralError || hasUnitError || totalScoreHasError) {
    severity = "error";
  } else if (crossUnitItemIds.length > 0) {
    severity = "warning";
  }

  if (messages.length === 0) {
    messages.push("各單元配分與建議配分完全一致，且全卷總分正確。");
  }

  return {
    severity,
    totalScoreActual,
    totalScoreExpected,
    unitResults,
    crossUnitItemIds,
    messages,
  };
}

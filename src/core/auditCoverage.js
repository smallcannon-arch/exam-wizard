function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function roundToTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function createEmptyResult(messages) {
  return {
    severity: "error",
    coverageRate: 0,
    coveredObjectiveIds: [],
    missingObjectiveIds: [],
    unknownObjectiveIds: [],
    objectiveItemMatrix: [],
    messages,
  };
}

function getItemLabel(item, index) {
  if (isPlainObject(item) && hasText(item.itemId)) {
    return item.itemId;
  }

  return `第 ${index + 1} 筆試題`;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

export function auditCoverage(input) {
  const { objectives, items } = isPlainObject(input) ? input : {};
  const messages = [];
  const structuralMessages = [];

  if (!Array.isArray(objectives)) {
    messages.push("objectives 欄位必須是陣列。");
  }

  if (!Array.isArray(items)) {
    messages.push("items 欄位必須是陣列。");
  }

  if (!Array.isArray(objectives) || !Array.isArray(items)) {
    return createEmptyResult(messages);
  }

  if (objectives.length === 0) {
    structuralMessages.push("objectives 欄位不可為空陣列。");
  }

  if (items.length === 0) {
    structuralMessages.push("items 欄位不可為空陣列。");
  }

  const objectiveIds = [];
  objectives.forEach((objective, index) => {
    if (!isPlainObject(objective)) {
      structuralMessages.push(`第 ${index + 1} 筆學習目標必須是物件。`);
      return;
    }

    if (!hasText(objective.objectiveId)) {
      structuralMessages.push(
        `第 ${index + 1} 筆學習目標 objectiveId 欄位必須是非空白字串。`,
      );
      return;
    }

    objectiveIds.push(objective.objectiveId);
  });

  const knownObjectiveIds = new Set(objectiveIds);
  const matrixItemSets = new Map(
    objectiveIds.map((objectiveId) => [objectiveId, new Set()]),
  );
  const unknownReferences = new Map();

  items.forEach((item, itemIndex) => {
    const itemLabel = getItemLabel(item, itemIndex);

    if (!isPlainObject(item)) {
      structuralMessages.push(`第 ${itemIndex + 1} 筆試題必須是物件。`);
      return;
    }

    if (!Array.isArray(item.objectiveIds) || item.objectiveIds.length === 0) {
      structuralMessages.push(
        `第 ${itemIndex + 1} 筆試題 objectiveIds 欄位必須是至少一筆的陣列。`,
      );
      return;
    }

    uniqueValues(item.objectiveIds).forEach((objectiveId, objectiveIndex) => {
      if (!hasText(objectiveId)) {
        structuralMessages.push(
          `第 ${itemIndex + 1} 筆試題 objectiveIds[${objectiveIndex}] 欄位必須是非空白字串。`,
        );
        return;
      }

      if (knownObjectiveIds.has(objectiveId)) {
        matrixItemSets.get(objectiveId).add(itemLabel);
        return;
      }

      if (!unknownReferences.has(objectiveId)) {
        unknownReferences.set(objectiveId, new Set());
      }

      unknownReferences.get(objectiveId).add(itemLabel);
    });
  });

  const objectiveItemMatrix = objectiveIds.map((objectiveId) => ({
    objectiveId,
    itemIds: [...matrixItemSets.get(objectiveId)],
  }));
  const coveredObjectiveIds = objectiveItemMatrix
    .filter((entry) => entry.itemIds.length > 0)
    .map((entry) => entry.objectiveId);
  const missingObjectiveIds = objectiveItemMatrix
    .filter((entry) => entry.itemIds.length === 0)
    .map((entry) => entry.objectiveId);
  const unknownObjectiveIds = [...unknownReferences.keys()];
  const coverageRate =
    objectiveIds.length === 0
      ? 0
      : roundToTwoDecimals(coveredObjectiveIds.length / objectiveIds.length);

  messages.push(...structuralMessages);

  if (missingObjectiveIds.length > 0) {
    messages.push(`以下學習目標尚未入題：${missingObjectiveIds.join("、")}。`);
  }

  unknownReferences.forEach((itemLabels, objectiveId) => {
    messages.push(
      `試題 ${[...itemLabels].join("、")} 引用了不存在於 objectives 的目標編號：${objectiveId}。`,
    );
  });

  if (messages.length === 0) {
    messages.push("所有學習目標皆已至少對應一題，且未發現未知目標編號。");
  }

  let severity = "pass";
  if (structuralMessages.length > 0 || missingObjectiveIds.length > 0) {
    severity = "error";
  } else if (unknownObjectiveIds.length > 0) {
    severity = "warning";
  }

  return {
    severity,
    coverageRate,
    coveredObjectiveIds,
    missingObjectiveIds,
    unknownObjectiveIds,
    objectiveItemMatrix,
    messages,
  };
}

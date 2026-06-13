const EPSILON = 1e-9;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isSelected(item, selectedItemIds) {
  if (selectedItemIds instanceof Set) {
    return selectedItemIds.has(item?.itemId);
  }

  if (Array.isArray(selectedItemIds)) {
    return selectedItemIds.includes(item?.itemId);
  }

  return item?.selected === true;
}

function hasGroupId(item) {
  return typeof item?.groupId === "string" && item.groupId.trim() !== "";
}

function buildTargetMap(blueprint = []) {
  const targetMap = new Map();

  blueprint.forEach((entry) => {
    const objectiveId = String(entry?.objectiveId ?? "");
    targetMap.set(
      objectiveId,
      (targetMap.get(objectiveId) ?? 0) + toNumber(entry?.plannedScore),
    );
  });

  return targetMap;
}

function cleanSelectedItem(item, index) {
  const { selected, __selectionOrder, ...cleanItem } = item;

  return {
    ...cleanItem,
    itemId: `A-${String(index + 1).padStart(2, "0")}`,
  };
}

export function buildSelectedItemsFromCandidates(candidatePool = [], selectedItemIds = null) {
  if (!Array.isArray(candidatePool)) {
    return [];
  }

  return candidatePool
    .filter((item) => isSelected(item, selectedItemIds))
    .map((item, index) => cleanSelectedItem(item, index));
}

export function applyCandidateSelection(candidatePool = [], candidateId, selected) {
  if (!Array.isArray(candidatePool)) {
    return [];
  }

  const targetItem = candidatePool.find((item) => item?.itemId === candidateId);

  if (!targetItem) {
    return candidatePool.map((item) => ({ ...item }));
  }

  if (!hasGroupId(targetItem)) {
    return candidatePool.map((item) =>
      item?.itemId === candidateId ? { ...item, selected } : { ...item },
    );
  }

  const groupId = targetItem.groupId.trim();

  return candidatePool.map((item) =>
    hasGroupId(item) && item.groupId.trim() === groupId
      ? { ...item, selected }
      : { ...item },
  );
}

export function summarizeCandidateSelection({
  objectives = [],
  blueprint = [],
  candidatePool = [],
  selectedItemIds = null,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const safeCandidatePool = Array.isArray(candidatePool) ? candidatePool : [];
  const targetMap = buildTargetMap(Array.isArray(blueprint) ? blueprint : []);
  const selectedItems = buildSelectedItemsFromCandidates(
    safeCandidatePool,
    selectedItemIds,
  );
  const selectedSourceItems = safeCandidatePool.filter((item) =>
    isSelected(item, selectedItemIds),
  );
  const objectiveIdSet = new Set(
    safeObjectives.map((objective) => String(objective?.objectiveId ?? "")),
  );
  const scoreByObjective = new Map(
    safeObjectives.map((objective) => [String(objective?.objectiveId ?? ""), 0]),
  );

  selectedSourceItems.forEach((item) => {
    const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];
    const knownObjectiveIds = objectiveIds.filter((objectiveId) =>
      objectiveIdSet.has(String(objectiveId)),
    );

    if (knownObjectiveIds.length === 0) {
      return;
    }

    const scoreShare = toNumber(item.score) / knownObjectiveIds.length;
    knownObjectiveIds.forEach((objectiveId) => {
      const key = String(objectiveId);
      scoreByObjective.set(key, (scoreByObjective.get(key) ?? 0) + scoreShare);
    });
  });

  const objectiveSummaries = safeObjectives.map((objective) => {
    const objectiveId = String(objective?.objectiveId ?? "");
    const expectedScore = targetMap.get(objectiveId) ?? 0;
    const selectedScore = scoreByObjective.get(objectiveId) ?? 0;
    const diff = selectedScore - expectedScore;
    const status =
      Math.abs(diff) < EPSILON
        ? "pass"
        : diff < 0
          ? "under"
          : "over";

    return {
      objectiveId,
      objectiveText: objective?.text ?? "",
      unitName: objective?.unitName ?? "",
      lessonName: objective?.lessonName ?? "",
      expectedScore,
      selectedScore,
      diff: Math.abs(diff) < EPSILON ? 0 : diff,
      status,
    };
  });

  const errors = objectiveSummaries
    .filter((summary) => summary.status !== "pass")
    .map((summary) =>
      summary.status === "under"
        ? `${summary.objectiveId} 尚未選滿，還差 ${Math.abs(summary.diff)} 分。`
        : `${summary.objectiveId} 已超選 ${summary.diff} 分。`,
    );

  return {
    selectedItems,
    objectiveSummaries,
    totalSelectedScore: selectedItems.reduce(
      (sum, item) => sum + toNumber(item.score),
      0,
    ),
    totalExpectedScore: [...targetMap.values()].reduce(
      (sum, score) => sum + score,
      0,
    ),
    allMatched: errors.length === 0 && objectiveSummaries.length > 0,
    errors,
  };
}

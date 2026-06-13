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

export function computeSelectionScores({ objectiveScore, selectedCount } = {}) {
  const score = toNumber(objectiveScore);
  const count = Number(selectedCount);

  if (!Number.isInteger(count) || count <= 0) {
    return {
      ok: false,
      perItemScore: null,
      selectedTotal: 0,
      message: `共 ${score} 分，尚未選題。`,
    };
  }

  if (!Number.isInteger(score) || score <= 0) {
    return {
      ok: false,
      perItemScore: null,
      selectedTotal: 0,
      message: `目標配分需為正整數，目前為 ${score} 分。`,
    };
  }

  if (score % count !== 0) {
    return {
      ok: false,
      perItemScore: null,
      selectedTotal: 0,
      message: `此目標 ${score} 分，選 ${count} 題無法平分為整數，請改選題數或回步驟 ③ 調配分。`,
    };
  }

  return {
    ok: true,
    perItemScore: score / count,
    selectedTotal: score,
    message: `共 ${score} 分，已選 ${count} 題，每題 ${score / count} 分。`,
  };
}

function cleanSelectedItem(item, index, score) {
  const { selected, __selectionOrder, ...cleanItem } = item;

  return {
    ...cleanItem,
    itemId: `A-${String(index + 1).padStart(2, "0")}`,
    score,
  };
}

export function buildSelectedItemsFromCandidates(
  candidatePool = [],
  selectedItemIds = null,
  scoreByItemId = new Map(),
) {
  if (!Array.isArray(candidatePool)) {
    return [];
  }

  return candidatePool
    .filter((item) => isSelected(item, selectedItemIds))
    .map((item, index) =>
      cleanSelectedItem(item, index, scoreByItemId.get(item.itemId) ?? toNumber(item.score)),
    );
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

export function summarizeSelection({
  objectives = [],
  blueprint = [],
  candidatePool = [],
  selectedItemIds = null,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const safeCandidatePool = Array.isArray(candidatePool) ? candidatePool : [];
  const targetMap = buildTargetMap(Array.isArray(blueprint) ? blueprint : []);
  const selectedSourceItems = safeCandidatePool.filter((item) =>
    isSelected(item, selectedItemIds),
  );
  const objectiveIdSet = new Set(
    safeObjectives.map((objective) => String(objective?.objectiveId ?? "")),
  );
  const selectedCountByObjective = new Map(
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

    knownObjectiveIds.forEach((objectiveId) => {
      const key = String(objectiveId);
      selectedCountByObjective.set(key, (selectedCountByObjective.get(key) ?? 0) + 1);
    });
  });

  const perItemScoreByObjective = new Map();
  const objectiveSummaries = safeObjectives.map((objective) => {
    const objectiveId = String(objective?.objectiveId ?? "");
    const expectedScore = targetMap.get(objectiveId) ?? 0;
    const selectedCount = selectedCountByObjective.get(objectiveId) ?? 0;
    const scoreResult = computeSelectionScores({
      objectiveScore: expectedScore,
      selectedCount,
    });
    const selectedScore = scoreResult.selectedTotal;
    const status =
      selectedCount <= 0 ? "unselected" : scoreResult.ok ? "pass" : "not_divisible";

    if (scoreResult.ok) {
      perItemScoreByObjective.set(objectiveId, scoreResult.perItemScore);
    }

    return {
      objectiveId,
      objectiveText: objective?.text ?? "",
      unitName: objective?.unitName ?? "",
      lessonName: objective?.lessonName ?? "",
      expectedScore,
      selectedCount,
      perItemScore: scoreResult.perItemScore,
      selectedScore,
      diff: selectedScore - expectedScore,
      status,
      message: scoreResult.message,
    };
  });
  const scoreByItemId = new Map();

  selectedSourceItems.forEach((item) => {
    const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];
    const knownObjectiveIds = objectiveIds.filter((objectiveId) =>
      objectiveIdSet.has(String(objectiveId)),
    );
    const score = knownObjectiveIds.reduce(
      (sum, objectiveId) =>
        sum + (perItemScoreByObjective.get(String(objectiveId)) ?? 0),
      0,
    );

    scoreByItemId.set(item.itemId, score);
  });

  const selectedItems = buildSelectedItemsFromCandidates(
    safeCandidatePool,
    selectedItemIds,
    scoreByItemId,
  );

  const errors = objectiveSummaries
    .filter((summary) => summary.status !== "pass")
    .map((summary) =>
      summary.status === "unselected"
        ? `${summary.objectiveId} 尚未選題。`
        : `${summary.objectiveId} ${summary.message}`,
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

export const summarizeCandidateSelection = summarizeSelection;

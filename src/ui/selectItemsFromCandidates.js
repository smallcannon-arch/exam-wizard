function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
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

function buildSectionKindMap(sections = []) {
  return new Map(
    (Array.isArray(sections) ? sections : []).map((section) => [
      String(section?.sectionId ?? ""),
      section?.kind === "group" ? "group" : "normal",
    ]),
  );
}

function isGroupBlueprintEntry(entry, sectionKindById) {
  const sectionId = String(entry?.sectionId ?? "");

  return (
    sectionKindById.get(sectionId) === "group" ||
    (Array.isArray(entry?.questionTypes) && entry.questionTypes.includes("題組"))
  );
}

function isGroupItem(item, sectionKindById) {
  const sectionId = String(item?.sectionId ?? "");

  return sectionKindById.get(sectionId) === "group" || hasGroupId(item);
}

function getSectionObjectiveKey(sectionId, objectiveId) {
  return `${String(sectionId ?? "")}::${String(objectiveId ?? "")}`;
}

function buildTargetMaps(blueprint = [], sectionKindById = new Map()) {
  const targetMap = new Map();
  const normalTargetMap = new Map();
  const groupTargetMap = new Map();

  (Array.isArray(blueprint) ? blueprint : []).forEach((entry) => {
    const objectiveId = String(entry?.objectiveId ?? "");
    const sectionId = String(entry?.sectionId ?? "");
    const plannedScore = toNumber(entry?.plannedScore);

    targetMap.set(objectiveId, (targetMap.get(objectiveId) ?? 0) + plannedScore);

    if (isGroupBlueprintEntry(entry, sectionKindById)) {
      groupTargetMap.set(
        getSectionObjectiveKey(sectionId, objectiveId),
        {
          sectionId,
          objectiveId,
          expectedScore:
            (groupTargetMap.get(getSectionObjectiveKey(sectionId, objectiveId))
              ?.expectedScore ?? 0) + plannedScore,
        },
      );
    } else {
      normalTargetMap.set(
        objectiveId,
        (normalTargetMap.get(objectiveId) ?? 0) + plannedScore,
      );
    }
  });

  return {
    targetMap,
    normalTargetMap,
    groupTargetMap,
  };
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

export function computeGroupSubScores({ objectiveScore, subItemCount } = {}) {
  const score = toPositiveInteger(objectiveScore);
  const count = toPositiveInteger(subItemCount);

  if (score === null || count === null || count > score) {
    return {
      ok: false,
      scores: [],
      errors: ["題組小題配分需能分成正整數。"],
    };
  }

  const baseScore = Math.floor(score / count);
  const remainder = score % count;
  const scores = Array.from({ length: count }, (_, index) =>
    baseScore + (index < remainder ? 1 : 0),
  );

  return {
    ok: scores.every((value) => value > 0),
    scores,
    errors: scores.every((value) => value > 0)
      ? []
      : ["題組小題配分需能分成正整數。"],
  };
}

function getObjectiveScores(objectiveScores = new Map()) {
  if (objectiveScores instanceof Map) {
    return objectiveScores;
  }

  if (objectiveScores && typeof objectiveScores === "object") {
    return new Map(
      Object.entries(objectiveScores).map(([objectiveId, score]) => [
        objectiveId,
        toNumber(score),
      ]),
    );
  }

  return new Map();
}

export function validateGroupScores({ groupSubItems = [], objectiveScores = new Map() } = {}) {
  const safeItems = Array.isArray(groupSubItems) ? groupSubItems : [];
  const expectedByObjective = getObjectiveScores(objectiveScores);
  const actualByObjective = new Map();
  const itemCountByObjective = new Map();
  const errors = [];

  safeItems.forEach((item) => {
    const score = toNumber(item?.score);
    const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];

    objectiveIds.forEach((objectiveId) => {
      const key = String(objectiveId);
      actualByObjective.set(key, (actualByObjective.get(key) ?? 0) + score);
      itemCountByObjective.set(key, (itemCountByObjective.get(key) ?? 0) + 1);
    });

    if (!Number.isInteger(score) || score <= 0) {
      errors.push(`${item?.itemId ?? "題組小題"} 的配分需為正整數。`);
    }
  });

  const objectiveResults = [...expectedByObjective.entries()].map(
    ([objectiveId, expectedScore]) => {
      const actualScore = actualByObjective.get(objectiveId) ?? 0;
      const subItemCount = itemCountByObjective.get(objectiveId) ?? 0;
      const status = actualScore === expectedScore && subItemCount > 0 ? "pass" : "error";
      const message =
        status === "pass"
          ? `目標 ${objectiveId}：小題合計 ${actualScore}/${expectedScore}。`
          : `目標 ${objectiveId}：小題合計 ${actualScore}/${expectedScore}，請調整題組小題配分。`;

      if (status !== "pass") {
        errors.push(message);
      }

      return {
        objectiveId,
        expectedScore,
        actualScore,
        subItemCount,
        status,
        message,
      };
    },
  );

  return {
    ok: errors.length === 0,
    objectiveResults,
    errors,
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
  sections = [],
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const safeCandidatePool = Array.isArray(candidatePool) ? candidatePool : [];
  const sectionKindById = buildSectionKindMap(sections);
  const { targetMap, normalTargetMap, groupTargetMap } = buildTargetMaps(
    blueprint,
    sectionKindById,
  );
  const selectedSourceItems = safeCandidatePool.filter((item) =>
    isSelected(item, selectedItemIds),
  );
  const objectiveIdSet = new Set(
    safeObjectives.map((objective) => String(objective?.objectiveId ?? "")),
  );
  const selectedCountByObjective = new Map(
    safeObjectives.map((objective) => [String(objective?.objectiveId ?? ""), 0]),
  );
  const selectedNormalItems = selectedSourceItems.filter(
    (item) => !isGroupItem(item, sectionKindById),
  );
  const selectedGroupItems = selectedSourceItems.filter((item) =>
    isGroupItem(item, sectionKindById),
  );

  selectedNormalItems.forEach((item) => {
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
  const normalErrorsByObjective = new Map();
  const objectiveSummaries = safeObjectives.map((objective) => {
    const objectiveId = String(objective?.objectiveId ?? "");
    const expectedScore = targetMap.get(objectiveId) ?? 0;
    const normalExpectedScore = normalTargetMap.get(objectiveId) ?? 0;
    const selectedCount = selectedCountByObjective.get(objectiveId) ?? 0;
    const scoreResult =
      normalExpectedScore > 0
        ? computeSelectionScores({
            objectiveScore: normalExpectedScore,
            selectedCount,
          })
        : {
            ok: true,
            perItemScore: null,
            selectedTotal: 0,
            message: "此目標由題組小題各自給分。",
          };
    const selectedScore = scoreResult.selectedTotal;
    const status =
      normalExpectedScore > 0 && selectedCount <= 0
        ? "unselected"
        : scoreResult.ok
          ? "pending"
          : "not_divisible";

    if (scoreResult.ok) {
      perItemScoreByObjective.set(objectiveId, scoreResult.perItemScore);
    } else {
      normalErrorsByObjective.set(objectiveId, scoreResult.message);
    }

    return {
      objectiveId,
      objectiveText: objective?.text ?? "",
      unitName: objective?.unitName ?? "",
      lessonName: objective?.lessonName ?? "",
      expectedScore,
      normalExpectedScore,
      selectedCount,
      perItemScore: scoreResult.perItemScore,
      selectedScore,
      diff: selectedScore - expectedScore,
      status,
      message: scoreResult.message,
    };
  });
  const scoreByItemId = new Map();
  const selectedScoreByObjective = new Map(
    objectiveSummaries.map((summary) => [summary.objectiveId, summary.selectedScore]),
  );

  selectedNormalItems.forEach((item) => {
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

  const groupItemsBySectionObjective = new Map();

  selectedGroupItems.forEach((item) => {
    const sectionId = String(item?.sectionId ?? "");
    const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];

    objectiveIds
      .filter((objectiveId) => objectiveIdSet.has(String(objectiveId)))
      .forEach((objectiveId) => {
        const key = getSectionObjectiveKey(sectionId, objectiveId);
        const entries = groupItemsBySectionObjective.get(key) ?? [];
        entries.push(item);
        groupItemsBySectionObjective.set(key, entries);
      });
  });

  const groupObjectiveResults = [];
  const groupErrorsByObjective = new Map();

  groupTargetMap.forEach(({ sectionId, objectiveId, expectedScore }, key) => {
    const groupItems = groupItemsBySectionObjective.get(key) ?? [];
    const hasManualScore = groupItems.some((item) => item?.scoreManual === true);
    const computedScores = computeGroupSubScores({
      objectiveScore: expectedScore,
      subItemCount: groupItems.length,
    });
    const scoredItems =
      !hasManualScore && computedScores.ok
        ? groupItems.map((item, index) => ({
            ...item,
            score: computedScores.scores[index],
          }))
        : groupItems;
    const validation = validateGroupScores({
      groupSubItems: scoredItems,
      objectiveScores: new Map([[objectiveId, expectedScore]]),
    });
    const result =
      validation.objectiveResults[0] ??
      {
        sectionId,
        objectiveId,
        expectedScore,
        actualScore: 0,
        subItemCount: 0,
        status: "error",
        message: `目標 ${objectiveId}：小題合計 0/${expectedScore}，請選入題組。`,
      };

    groupObjectiveResults.push({
      ...result,
      sectionId,
    });

    scoredItems.forEach((item) => {
      scoreByItemId.set(item.itemId, toNumber(item.score));
    });

    selectedScoreByObjective.set(
      objectiveId,
      (selectedScoreByObjective.get(objectiveId) ?? 0) + result.actualScore,
    );

    if (!validation.ok) {
      groupErrorsByObjective.set(
        objectiveId,
        [
          ...(groupErrorsByObjective.get(objectiveId) ?? []),
          ...validation.errors,
        ],
      );
    }
  });

  const completedObjectiveSummaries = objectiveSummaries.map((summary) => {
    const groupErrors = groupErrorsByObjective.get(summary.objectiveId) ?? [];
    const selectedScore = selectedScoreByObjective.get(summary.objectiveId) ?? 0;
    const normalError = normalErrorsByObjective.get(summary.objectiveId);
    const status =
      normalError || groupErrors.length > 0
        ? summary.status === "unselected"
          ? "unselected"
          : groupErrors.length > 0
            ? "group_score_mismatch"
            : "not_divisible"
        : selectedScore === summary.expectedScore
          ? "pass"
          : "score_mismatch";
    const message =
      normalError ??
      groupErrors[0] ??
      (status === "pass"
        ? "配分符合。"
        : `目標 ${summary.objectiveId} 已選合計 ${selectedScore}/${summary.expectedScore} 分。`);

    return {
      ...summary,
      selectedScore,
      diff: selectedScore - summary.expectedScore,
      status,
      message,
      groupSelectedCount: groupObjectiveResults
        .filter((result) => result.objectiveId === summary.objectiveId)
        .reduce((sum, result) => sum + result.subItemCount, 0),
    };
  });

  const selectedItems = buildSelectedItemsFromCandidates(
    safeCandidatePool,
    selectedItemIds,
    scoreByItemId,
  );

  const errors = completedObjectiveSummaries
    .filter((summary) => summary.status !== "pass")
    .map((summary) =>
      summary.status === "unselected"
        ? `${summary.objectiveId} 尚未選題。`
        : `${summary.objectiveId} ${summary.message}`,
    );

  return {
    selectedItems,
    objectiveSummaries: completedObjectiveSummaries,
    groupObjectiveResults,
    scoreByItemId,
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

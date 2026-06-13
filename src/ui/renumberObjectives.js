function cloneObjective(objective) {
  return {
    ...objective,
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getLeadingNumberPrefix(value) {
  const match = normalizeText(value).match(/^(\d+(?:-\d+)*)/);
  return match?.[1] ?? "";
}

function getDuplicateSuffix(index) {
  return String.fromCharCode("a".charCodeAt(0) + index);
}

function createGroups(objectives) {
  const groups = [];
  const groupByLesson = new Map();

  objectives.forEach((objective, index) => {
    const lessonName = normalizeText(objective.lessonName);
    const groupKey = lessonName;

    if (!groupByLesson.has(groupKey)) {
      const group = {
        key: groupKey,
        lessonName,
        unitName: normalizeText(objective.unitName),
        indexes: [],
        firstIndex: index,
      };
      groupByLesson.set(groupKey, group);
      groups.push(group);
    }

    groupByLesson.get(groupKey).indexes.push(index);
  });

  return groups;
}

function getBasePrefix(group, fallbackIndex, notices) {
  const lessonPrefix = getLeadingNumberPrefix(group.lessonName);

  if (lessonPrefix) {
    return lessonPrefix;
  }

  const unitPrefix = getLeadingNumberPrefix(group.unitName);

  if (unitPrefix) {
    return unitPrefix;
  }

  const fallbackPrefix = `U${fallbackIndex}`;
  const label = group.lessonName || group.unitName || `第 ${group.firstIndex + 1} 筆`;
  notices.push(`「${label}」找不到小單元或大單元開頭編號，已採後備編號 ${fallbackPrefix}。`);
  return fallbackPrefix;
}

function buildGroupPrefixes(groups, notices) {
  const usedPrefixes = new Map();
  let fallbackIndex = 1;

  return groups.reduce((prefixes, group) => {
    const basePrefix = getBasePrefix(group, fallbackIndex, notices);

    if (basePrefix.startsWith("U")) {
      fallbackIndex += 1;
    }

    const duplicateCount = usedPrefixes.get(basePrefix) ?? 0;
    usedPrefixes.set(basePrefix, duplicateCount + 1);

    if (duplicateCount === 0) {
      prefixes.set(group.key, basePrefix);
      return prefixes;
    }

    const adjustedPrefix = `${basePrefix}${getDuplicateSuffix(duplicateCount)}`;
    const label = group.lessonName || group.unitName || `第 ${group.firstIndex + 1} 筆`;
    notices.push(
      `「${label}」解析出的前綴 ${basePrefix} 已重複，已改用 ${adjustedPrefix} 避免目標編號重複。`,
    );
    prefixes.set(group.key, adjustedPrefix);
    return prefixes;
  }, new Map());
}

export function renumberObjectives(objectives) {
  if (!Array.isArray(objectives)) {
    return {
      objectives: [],
      mapping: {},
      notices: [],
      errors: ["objectives 必須是陣列。"],
    };
  }

  if (objectives.length === 0) {
    return {
      objectives: [],
      mapping: {},
      notices: ["沒有可重新編號的學習目標。"],
      errors: ["objectives 至少需要一筆資料。"],
    };
  }

  const sourceObjectives = objectives.map(cloneObjective);
  const notices = [];
  const groups = createGroups(sourceObjectives);
  const groupPrefixes = buildGroupPrefixes(groups, notices);
  const groupCounters = new Map();
  const mapping = {};

  const renumberedObjectives = sourceObjectives.map((objective) => {
    const groupKey = normalizeText(objective.lessonName);
    const prefix = groupPrefixes.get(groupKey);
    const nextIndex = (groupCounters.get(groupKey) ?? 0) + 1;
    const newObjectiveId = `${prefix}-${nextIndex}`;
    const oldObjectiveId = normalizeText(objective.objectiveId);

    groupCounters.set(groupKey, nextIndex);
    mapping[oldObjectiveId] = newObjectiveId;

    return {
      ...objective,
      objectiveId: newObjectiveId,
    };
  });

  return {
    objectives: renumberedObjectives,
    mapping,
    notices,
    errors: [],
  };
}

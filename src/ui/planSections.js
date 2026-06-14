const QUESTION_TYPES = ["選擇題", "填充題", "應用題", "勾選題", "畫圖題", "其他"];

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function toPositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePreferredTypes(value) {
  return Array.isArray(value)
    ? value
        .filter((questionType) => QUESTION_TYPES.includes(questionType))
        .filter((questionType, index, array) => array.indexOf(questionType) === index)
    : [];
}

function normalizeOptionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function buildSectionPlanRequest({
  project,
  objectives,
  objectiveAllocations = [],
  preferences = {},
} = {}) {
  const scoreByObjectiveId = new Map(
    (Array.isArray(objectiveAllocations) ? objectiveAllocations : []).map((allocation) => [
      String(allocation?.objectiveId ?? ""),
      Number(allocation?.actualScore),
    ]),
  );
  const requestObjectives = (Array.isArray(objectives) ? objectives : []).map(
    (objective) => {
      const objectiveId = String(objective?.objectiveId ?? "");
      const score = scoreByObjectiveId.get(objectiveId);

      return {
        objectiveId,
        text: String(objective?.text ?? ""),
        periodCount: Number(objective?.periodCount) || 0,
        score: Number.isFinite(score) ? score : undefined,
      };
    },
  );

  return {
    project: project ?? null,
    objectives: requestObjectives,
    preferences: {
      sectionCountHint: normalizeOptionalInteger(preferences.sectionCountHint),
      includeGroup: preferences.includeGroup === true,
      groupCountHint: normalizeOptionalInteger(preferences.groupCountHint),
      preferredTypes: normalizePreferredTypes(preferences.preferredTypes),
      note: hasText(preferences.note) ? preferences.note.trim() : "",
    },
  };
}

export function convertPlanSectionsToStateSections({
  planSections,
  objectives,
} = {}) {
  const objectiveIds = new Set(
    (Array.isArray(objectives) ? objectives : []).map((objective) =>
      String(objective?.objectiveId ?? ""),
    ),
  );

  return (Array.isArray(planSections) ? planSections : []).map((section, index) => {
    const kind = section?.kind === "group" ? "group" : "normal";
    const groupPlan = section?.groupPlan && typeof section.groupPlan === "object"
      ? section.groupPlan
      : null;
    const rawObjectiveIds = Array.isArray(section?.objectiveIds)
      ? section.objectiveIds
      : [];
    const groupObjectiveIds = Array.isArray(groupPlan?.coveredObjectiveIds)
      ? groupPlan.coveredObjectiveIds
      : [];
    const sectionObjectiveIds = [
      ...new Set([
        ...rawObjectiveIds,
        ...(kind === "group" ? groupObjectiveIds : []),
      ]),
    ]
      .map((objectiveId) => String(objectiveId))
      .filter((objectiveId) => objectiveIds.has(objectiveId));
    const groupSubCount = clamp(toPositiveInteger(groupPlan?.subCount, 3), 1, 8);
    const plannedCount =
      kind === "group"
        ? groupSubCount
        : toPositiveInteger(section?.plannedCount, 1);

    return {
      sectionId: `S-${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      title: hasText(section?.title) ? section.title.trim() : "",
      kind,
      questionType:
        kind === "group"
          ? "題組"
          : QUESTION_TYPES.includes(section?.questionType)
            ? section.questionType
            : "選擇題",
      objectiveIds: sectionObjectiveIds,
      plannedCount,
      textMode: "ai",
      providedText: "",
      topicHint: kind === "group" && hasText(groupPlan?.topicHint)
        ? groupPlan.topicHint.trim()
        : "",
      subCount: kind === "group" ? groupSubCount : plannedCount,
      stimulusPlan: "",
      subQuestionPlan: [],
      rationale: hasText(section?.rationale) ? section.rationale.trim() : "",
    };
  });
}

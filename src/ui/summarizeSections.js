import { allocateScores } from "../core/allocateScores.js";
import {
  buildDefaultObjectiveAllocations,
  DEFAULT_MAX_PER_ITEM_SCORE,
  legalQuestionCounts,
  validateAllocations,
} from "./validateAllocations.js";

const EPSILON = 1e-9;

function toPositiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getTotalScore(allocations = []) {
  const total = allocations.reduce(
    (sum, allocation) => sum + (Number(allocation?.suggestedScore) || 0),
    0,
  );

  return Number.isInteger(total) && total > 0 ? total : 100;
}

function buildObjectiveScores(
  objectives = [],
  allocations = [],
  objectiveAllocations = [],
  maxPerItemScore = DEFAULT_MAX_PER_ITEM_SCORE,
) {
  const totalScore = getTotalScore(allocations);
  const effectiveObjectiveAllocations =
    Array.isArray(objectiveAllocations) && objectiveAllocations.length > 0
      ? objectiveAllocations
      : buildDefaultObjectiveAllocations({ objectives, totalScore });
  const allocationResult = validateAllocations({
    objectives,
    allocations: effectiveObjectiveAllocations,
    totalScore,
    maxPerItemScore,
  });

  if (allocationResult.ok || allocationResult.rows.length > 0) {
    return {
      ok: allocationResult.rows.length > 0,
      objectiveScores: new Map(
        allocationResult.rows.map((row) => [row.objectiveId, row.actualScore]),
      ),
      errors: allocationResult.errors,
      totalScore,
      allocationRows: allocationResult.rows,
    };
  }

  const units = objectives.map((objective) => ({
    id: objective.objectiveId,
    name: objective.objectiveId,
    periodCount: Number(objective.periodCount),
  }));
  const result = allocateScores({ totalScore, units });

  if (!result.ok) {
    return {
      ok: false,
      objectiveScores: new Map(),
      errors: result.errors,
      totalScore,
      allocationRows: [],
    };
  }

  return {
    ok: true,
    objectiveScores: new Map(
      result.allocations.map((allocation) => [
        allocation.id,
        allocation.suggestedScore,
      ]),
    ),
    errors: [],
    totalScore,
    allocationRows: [],
  };
}

function normalizeSection(section, index) {
  const kind = section?.kind === "group" ? "group" : "normal";
  const questionType =
    kind === "group"
      ? "題組"
      : typeof section?.questionType === "string" && section.questionType.trim() !== ""
      ? section.questionType.trim()
      : "選擇題";
  const subCount = Number(section?.subCount ?? section?.plannedCount);
  const plannedCount = toPositiveInteger(section?.plannedCount, toPositiveInteger(subCount, 0));

  return {
    sectionId: section?.sectionId || `S-${String(index + 1).padStart(2, "0")}`,
    order: Number.isInteger(Number(section?.order)) ? Number(section.order) : index + 1,
    title: section?.title || `${questionType}`,
    kind,
    questionType,
    objectiveIds: Array.isArray(section?.objectiveIds)
      ? [...new Set(section.objectiveIds.filter(Boolean))]
      : [],
    plannedCount,
    textMode: section?.textMode === "provided" ? "provided" : "ai",
    providedText:
      typeof section?.providedText === "string" ? section.providedText : "",
    topicHint: typeof section?.topicHint === "string" ? section.topicHint : "",
    subCount: toPositiveInteger(subCount, plannedCount),
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getCoverageCounts(sections = []) {
  const coverageCounts = new Map();

  sections.forEach((section) => {
    section.objectiveIds.forEach((objectiveId) => {
      coverageCounts.set(objectiveId, (coverageCounts.get(objectiveId) ?? 0) + 1);
    });
  });

  return coverageCounts;
}

function getPlannedCounts(sections = []) {
  const plannedCounts = new Map();

  sections.forEach((section) => {
    if (section.kind === "group") {
      return;
    }

    const count = section.plannedCount;

    section.objectiveIds.forEach((objectiveId) => {
      plannedCounts.set(objectiveId, (plannedCounts.get(objectiveId) ?? 0) + count);
    });
  });

  return plannedCounts;
}

function buildLegalCountSuggestion(counts) {
  return counts.length > 0 ? `建議題數：${counts.join("、")}。` : "";
}

function buildNormalSectionIssues({
  section,
  objectiveIds,
  coverageCounts,
  objectiveScores,
  maxPerItemScore = DEFAULT_MAX_PER_ITEM_SCORE,
}) {
  if (section.kind === "group" || section.plannedCount < 1) {
    return [];
  }

  return objectiveIds.flatMap((objectiveId) => {
    const coverageCount = coverageCounts.get(objectiveId) ?? 1;
    const sectionScore = (objectiveScores.get(objectiveId) ?? 0) / coverageCount;
    const legalCounts = legalQuestionCounts({
      objectiveScore: sectionScore,
      maxPerItem: maxPerItemScore,
    });
    const suggestion = buildLegalCountSuggestion(legalCounts);

    if (!Number.isInteger(sectionScore) || sectionScore <= 0) {
      return [
        `此大題目標 ${objectiveId} 配分 ${sectionScore} 分，無法在每題不超過 ${maxPerItemScore} 分下整除出題，請回步驟③調整配分或調整大題涵蓋。${suggestion}`,
      ];
    }

    if (sectionScore % section.plannedCount !== 0) {
      return [
        `此大題目標 ${objectiveId} 配分 ${sectionScore} 分、題數 ${section.plannedCount}：無法整除。${suggestion}`,
      ];
    }

    const perItemScore = sectionScore / section.plannedCount;

    if (perItemScore > maxPerItemScore) {
      return [
        `此大題目標 ${objectiveId} 配分 ${sectionScore} 分、題數 ${section.plannedCount}：每題 ${perItemScore} 分超過每題最多 ${maxPerItemScore} 分。${suggestion}`,
      ];
    }

    return [];
  });
}

export function summarizeSections({
  sections = [],
  objectives = [],
  allocations = [],
  objectiveAllocations = [],
  maxPerItemScore = DEFAULT_MAX_PER_ITEM_SCORE,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const safeSections = Array.isArray(sections)
    ? sections.map(normalizeSection).sort((left, right) => left.order - right.order)
    : [];
  const plannedCounts = getPlannedCounts(safeSections);
  const objectiveAllocationsWithPlannedCounts = (
    Array.isArray(objectiveAllocations) ? objectiveAllocations : []
  ).map((allocation) => {
    const plannedCount = plannedCounts.get(String(allocation?.objectiveId ?? ""));

    return plannedCount
      ? {
          ...allocation,
          plannedCount,
        }
      : allocation;
  });
  const scoreResult = buildObjectiveScores(
    safeObjectives,
    allocations,
    objectiveAllocationsWithPlannedCounts,
    maxPerItemScore,
  );

  if (!scoreResult.ok) {
    return {
      ok: false,
      sectionSummaries: [],
      objectiveSummaries: [],
      missingObjectiveIds: safeObjectives.map((objective) => objective.objectiveId),
      invalidSectionIds: [],
      coverageRate: 0,
      totalSectionScore: 0,
      totalObjectiveScore: scoreResult.totalScore,
      allMatched: false,
      errors: scoreResult.errors,
    };
  }

  const objectiveById = new Map(
    safeObjectives.map((objective) => [objective.objectiveId, objective]),
  );
  const coverageCounts = getCoverageCounts(safeSections);
  const objectiveSummaries = safeObjectives.map((objective) => {
    const objectiveId = objective.objectiveId;
    const score = scoreResult.objectiveScores.get(objectiveId) ?? 0;
    const coverageCount = coverageCounts.get(objectiveId) ?? 0;
    const plannedCount = plannedCounts.get(objectiveId) ?? 0;

    return {
      objectiveId,
      unitName: objective.unitName,
      lessonName: objective.lessonName,
      text: objective.text,
      score,
      plannedCount,
      coverageCount,
      covered: coverageCount > 0,
    };
  });
  const sectionSummaries = safeSections.map((section) => {
    const issues = [];

    if (section.kind === "group") {
      if (
        !Number.isInteger(Number(section.subCount)) ||
        Number(section.subCount) < 1 ||
        Number(section.subCount) > 8
      ) {
        issues.push("題組小題數需介於 1～8。");
      }

      if (section.textMode === "provided" && !hasText(section.providedText)) {
        issues.push("自行提供文本模式需填入題組文本。");
      }
    }

    if (section.objectiveIds.length === 0) {
      issues.push("大題至少需涵蓋一個學習目標。");
    }

    if (section.kind !== "group" && section.plannedCount < 1) {
      issues.push("預計題數需大於 0。");
    }

    const knownObjectiveIds = section.objectiveIds.filter((objectiveId) =>
      objectiveById.has(objectiveId),
    );
    const score = knownObjectiveIds.reduce((sum, objectiveId) => {
      const coverageCount = coverageCounts.get(objectiveId) ?? 1;
      return sum + (scoreResult.objectiveScores.get(objectiveId) ?? 0) / coverageCount;
    }, 0);

    issues.push(
      ...buildNormalSectionIssues({
        section,
        objectiveIds: knownObjectiveIds,
        coverageCounts,
        objectiveScores: scoreResult.objectiveScores,
        maxPerItemScore,
      }),
    );

    return {
      ...section,
      objectiveIds: knownObjectiveIds,
      score,
      ratio: scoreResult.totalScore > 0 ? score / scoreResult.totalScore : 0,
      status: issues.length === 0 ? "pass" : "error",
      issues,
    };
  });
  const missingObjectiveIds = objectiveSummaries
    .filter((objective) => !objective.covered)
    .map((objective) => objective.objectiveId);
  const invalidSectionIds = sectionSummaries
    .filter((section) => section.status !== "pass")
    .map((section) => section.sectionId);
  const totalSectionScore = sectionSummaries.reduce(
    (sum, section) => sum + section.score,
    0,
  );
  const coveredCount = objectiveSummaries.filter((objective) => objective.covered).length;
  const errors = [...scoreResult.errors];

  if (safeSections.length === 0) {
    errors.push("請至少新增一個大題。");
  }

  if (missingObjectiveIds.length > 0) {
    errors.push(`尚有 ${missingObjectiveIds.length} 個學習目標未歸入任何大題。`);
  }

  sectionSummaries.forEach((section) => {
    section.issues.forEach((issue) => {
      errors.push(`${section.title}：${issue}`);
    });
  });

  if (Math.abs(totalSectionScore - scoreResult.totalScore) >= EPSILON) {
    errors.push(`大題配分合計需為 ${scoreResult.totalScore} 分。`);
  }

  return {
    ok:
      errors.length === 0 &&
      safeSections.length > 0 &&
      Math.abs(totalSectionScore - scoreResult.totalScore) < EPSILON,
    sectionSummaries,
    objectiveSummaries,
    missingObjectiveIds,
    invalidSectionIds,
    coverageRate:
      objectiveSummaries.length > 0
        ? Math.round((coveredCount / objectiveSummaries.length) * 100) / 100
        : 0,
    totalSectionScore,
    totalObjectiveScore: scoreResult.totalScore,
    allMatched:
      errors.length === 0 &&
      safeSections.length > 0 &&
      Math.abs(totalSectionScore - scoreResult.totalScore) < EPSILON,
    errors,
  };
}

export function buildBlueprintFromSections(summary) {
  if (!summary || !Array.isArray(summary.sectionSummaries)) {
    return [];
  }

  const objectiveScoreById = new Map(
    summary.objectiveSummaries.map((objective) => [objective.objectiveId, objective]),
  );

  return summary.sectionSummaries.flatMap((section) =>
    section.objectiveIds.map((objectiveId) => {
      const objective = objectiveScoreById.get(objectiveId);
      const coverageCount = objective?.coverageCount || 1;

      return {
        sectionId: section.sectionId,
        objectiveId,
        unitName: objective?.unitName ?? "",
        questionTypes: [section.questionType],
        plannedScore: (objective?.score ?? 0) / coverageCount,
        plannedCount: section.kind === "group" ? section.subCount : section.plannedCount,
        groupHint: "",
      };
    }),
  );
}

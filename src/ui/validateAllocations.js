import { allocateScores } from "../core/allocateScores.js";

const DEFAULT_TOTAL_SCORE = 100;
const DEFAULT_DEVIATION_THRESHOLD = 0.2;
const EPSILON = 1e-9;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function getTotalPeriods(objectives) {
  return objectives.reduce(
    (sum, objective) => sum + Math.max(0, toNumber(objective?.periodCount)),
    0,
  );
}

export function calculateSuggestedObjectiveScores({
  objectives = [],
  totalScore = DEFAULT_TOTAL_SCORE,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const safeTotalScore = toNumber(totalScore, DEFAULT_TOTAL_SCORE);
  const totalPeriods = getTotalPeriods(safeObjectives);

  return safeObjectives.map((objective) => {
    const periodCount = toNumber(objective?.periodCount);
    const suggestedScore =
      totalPeriods > 0 ? safeTotalScore * (periodCount / totalPeriods) : 0;

    return {
      objectiveId: objective?.objectiveId ?? "",
      unitName: objective?.unitName ?? "",
      lessonName: objective?.lessonName ?? "",
      text: objective?.text ?? "",
      periodCount,
      suggestedScore,
    };
  });
}

export function buildDefaultObjectiveAllocations({
  objectives = [],
  totalScore = DEFAULT_TOTAL_SCORE,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const result = allocateScores({
    totalScore,
    units: safeObjectives.map((objective) => ({
      id: objective.objectiveId,
      name: objective.objectiveId,
      periodCount: Number(objective.periodCount),
    })),
  });
  const suggestedRows = calculateSuggestedObjectiveScores({
    objectives: safeObjectives,
    totalScore,
  });
  const actualByObjectiveId = new Map(
    result.ok
      ? result.allocations.map((allocation) => [
          allocation.id,
          allocation.suggestedScore,
        ])
      : [],
  );

  return suggestedRows.map((row) => ({
    objectiveId: row.objectiveId,
    suggestedScore: row.suggestedScore,
    actualScore: actualByObjectiveId.get(row.objectiveId) ?? 0,
  }));
}

function getAllocationByObjectiveId(allocations) {
  return new Map(
    (Array.isArray(allocations) ? allocations : []).map((allocation) => [
      String(allocation?.objectiveId ?? ""),
      allocation,
    ]),
  );
}

function getDeviationRate(actualScore, suggestedScore) {
  if (Math.abs(suggestedScore) < EPSILON) {
    return actualScore === 0 ? 0 : Infinity;
  }

  return (actualScore - suggestedScore) / suggestedScore;
}

function buildRow({
  objective,
  allocation,
  suggestedScore,
  deviationThreshold,
}) {
  const actualInteger = toPositiveInteger(allocation?.actualScore);
  const actualScore = actualInteger ?? toNumber(allocation?.actualScore);
  const plannedCount =
    allocation?.plannedCount === undefined || allocation?.plannedCount === null
      ? null
      : toPositiveInteger(allocation.plannedCount);
  const deviationRate = getDeviationRate(actualScore, suggestedScore);
  const warnings = [];
  const errors = [];

  if (actualInteger === null) {
    errors.push(`${objective.objectiveId} 的實際配分需為正整數。`);
  }

  if (
    Number.isFinite(deviationRate) &&
    Math.abs(deviationRate) > deviationThreshold
  ) {
    warnings.push(`${objective.objectiveId} 與節數比例建議差距較大。`);
  }

  if (plannedCount !== null && actualInteger !== null) {
    if (actualInteger % plannedCount !== 0) {
      errors.push(
        `${objective.objectiveId} 共 ${actualInteger} 分，規劃 ${plannedCount} 題無法平分為正整數每題分。`,
      );
    }
  }

  return {
    objectiveId: objective.objectiveId,
    unitName: objective.unitName,
    lessonName: objective.lessonName,
    text: objective.text,
    periodCount: Number(objective.periodCount) || 0,
    suggestedScore,
    actualScore,
    plannedCount,
    perItemScore:
      plannedCount !== null && actualInteger !== null && actualInteger % plannedCount === 0
        ? actualInteger / plannedCount
        : null,
    deviationRate,
    warning: warnings.length > 0,
    warnings,
    errors,
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "pass",
  };
}

export function validateAllocations({
  objectives = [],
  allocations = [],
  totalScore = DEFAULT_TOTAL_SCORE,
  deviationThreshold = DEFAULT_DEVIATION_THRESHOLD,
} = {}) {
  const safeObjectives = Array.isArray(objectives) ? objectives : [];
  const suggestedRows = calculateSuggestedObjectiveScores({
    objectives: safeObjectives,
    totalScore,
  });
  const allocationByObjectiveId = getAllocationByObjectiveId(allocations);
  const suggestedByObjectiveId = new Map(
    suggestedRows.map((row) => [row.objectiveId, row.suggestedScore]),
  );
  const rows = safeObjectives.map((objective) =>
    buildRow({
      objective,
      allocation: allocationByObjectiveId.get(String(objective.objectiveId)),
      suggestedScore: suggestedByObjectiveId.get(String(objective.objectiveId)) ?? 0,
      deviationThreshold,
    }),
  );
  const totalActualScore = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.actualScore) ? row.actualScore : 0),
    0,
  );
  const errors = rows.flatMap((row) => row.errors);
  const warnings = rows.flatMap((row) => row.warnings);

  if (Math.abs(totalActualScore - totalScore) >= EPSILON) {
    errors.unshift(
      `全卷實際配分合計需為 ${totalScore} 分，目前為 ${totalActualScore} 分。`,
    );
  }

  return {
    ok: errors.length === 0,
    totalScore,
    totalActualScore,
    totalMatches: Math.abs(totalActualScore - totalScore) < EPSILON,
    rows,
    warnings,
    errors,
  };
}

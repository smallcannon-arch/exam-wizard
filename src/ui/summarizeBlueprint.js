function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

function normalizeScore(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return Number.NaN;
}

function getEntryUnitName(entry) {
  if (typeof entry.unitName === "string" && entry.unitName.trim() !== "") {
    return entry.unitName;
  }

  if (typeof entry.allocationName === "string" && entry.allocationName.trim() !== "") {
    return entry.allocationName;
  }

  return "";
}

function validateEntry(entry, index) {
  const issues = [];
  const entryNumber = index + 1;

  if (!isPlainObject(entry)) {
    return {
      objectiveId: "",
      issues: [`第 ${entryNumber} 筆藍圖資料必須是物件。`],
    };
  }

  if (typeof entry.objectiveId !== "string" || entry.objectiveId.trim() === "") {
    issues.push(`第 ${entryNumber} 筆 objectiveId 欄位必須是非空白字串。`);
  }

  if (!Array.isArray(entry.questionTypes) || entry.questionTypes.length === 0) {
    issues.push(`第 ${entryNumber} 筆 questionTypes 欄位至少需勾選一種題型。`);
  }

  const plannedScore = normalizeScore(entry.plannedScore);

  if (!isPositiveInteger(plannedScore)) {
    issues.push(`第 ${entryNumber} 筆 plannedScore 欄位必須是大於或等於 1 的正整數。`);
  }

  if (getEntryUnitName(entry) === "") {
    issues.push(`第 ${entryNumber} 筆 unitName 欄位必須是非空白字串。`);
  }

  return {
    objectiveId: typeof entry.objectiveId === "string" ? entry.objectiveId : "",
    issues,
  };
}

export function summarizeBlueprint(allocations, blueprint) {
  const errors = [];

  if (!Array.isArray(allocations) || allocations.length === 0) {
    errors.push("allocations 欄位不可為空陣列。");
  }

  if (!Array.isArray(blueprint) || blueprint.length === 0) {
    errors.push("blueprint 欄位不可為空陣列。");
  }

  const sourceBlueprint = Array.isArray(blueprint) ? blueprint : [];
  const invalidEntries = sourceBlueprint
    .map((entry, index) => validateEntry(entry, index))
    .filter((result) => result.issues.length > 0);

  const unitSummaries = Array.isArray(allocations)
    ? allocations.map((allocation) => {
        const unitName =
          typeof allocation?.name === "string" ? allocation.name : "";
        const expectedScore =
          typeof allocation?.suggestedScore === "number"
            ? allocation.suggestedScore
            : 0;
        const actualScore = sourceBlueprint
          .filter((entry) => getEntryUnitName(entry) === unitName)
          .reduce((sum, entry) => {
            const score = normalizeScore(entry.plannedScore);
            return Number.isFinite(score) ? sum + score : sum;
          }, 0);
        const diff = actualScore - expectedScore;

        return {
          unitName,
          actualScore,
          expectedScore,
          diff,
          status: diff === 0 ? "pass" : "error",
        };
      })
    : [];

  const allMatched =
    errors.length === 0 &&
    invalidEntries.length === 0 &&
    unitSummaries.length > 0 &&
    unitSummaries.every((summary) => summary.diff === 0);

  return {
    allMatched,
    unitSummaries,
    invalidEntries,
    errors,
  };
}

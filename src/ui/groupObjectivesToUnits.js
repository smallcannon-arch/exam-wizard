export function groupObjectivesToUnits(objectives) {
  const errors = [];

  if (!Array.isArray(objectives)) {
    return {
      ok: false,
      units: [],
      errors: ["objectives 欄位必須是陣列。"],
    };
  }

  if (objectives.length === 0) {
    return {
      ok: false,
      units: [],
      errors: ["objectives 欄位不可為空陣列。"],
    };
  }

  const unitMap = new Map();
  const units = [];

  objectives.forEach((objective, index) => {
    const itemNumber = index + 1;

    if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
      errors.push(`第 ${itemNumber} 筆學習目標必須是物件。`);
      return;
    }

    if (typeof objective.unitName !== "string" || objective.unitName.trim() === "") {
      errors.push(`第 ${itemNumber} 筆學習目標 unitName 欄位必須是非空白字串。`);
      return;
    }

    if (
      typeof objective.periodCount !== "number" ||
      !Number.isFinite(objective.periodCount) ||
      objective.periodCount <= 0
    ) {
      errors.push(`第 ${itemNumber} 筆學習目標 periodCount 欄位必須是正數。`);
      return;
    }

    if (!unitMap.has(objective.unitName)) {
      const unit = {
        id: `U${units.length + 1}`,
        name: objective.unitName,
        periodCount: 0,
      };
      unitMap.set(objective.unitName, unit);
      units.push(unit);
    }

    unitMap.get(objective.unitName).periodCount += objective.periodCount;
  });

  if (errors.length > 0) {
    return {
      ok: false,
      units: [],
      errors,
    };
  }

  return {
    ok: true,
    units,
    errors: [],
  };
}

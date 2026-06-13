function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(object, fieldName) {
  return Object.prototype.hasOwnProperty.call(object, fieldName);
}

function compareAllocationPriority(a, b) {
  if (b.fractionalPart !== a.fractionalPart) {
    return b.fractionalPart - a.fractionalPart;
  }

  if (b.periodCount !== a.periodCount) {
    return b.periodCount - a.periodCount;
  }

  return a.index - b.index;
}

function compareBorrowPriority(a, b) {
  if (b.suggestedScore !== a.suggestedScore) {
    return b.suggestedScore - a.suggestedScore;
  }

  if (a.fractionalPart !== b.fractionalPart) {
    return a.fractionalPart - b.fractionalPart;
  }

  if (a.periodCount !== b.periodCount) {
    return a.periodCount - b.periodCount;
  }

  return b.index - a.index;
}

function validateInput({ totalScore, units }) {
  const errors = [];
  const isTotalScoreValid = Number.isInteger(totalScore) && totalScore > 0;

  if (!isTotalScoreValid) {
    errors.push("totalScore 欄位必須是正整數。");
  }

  if (!Array.isArray(units) || units.length === 0) {
    errors.push("units 欄位必須是非空陣列。");
    return errors;
  }

  units.forEach((unit, index) => {
    const itemNumber = index + 1;

    if (!isPlainObject(unit)) {
      errors.push(`第 ${itemNumber} 筆單元必須是物件。`);
      return;
    }

    if (!hasText(unit.id)) {
      errors.push(`第 ${itemNumber} 筆單元 id 欄位必填。`);
    }

    if (!hasOwn(unit, "periodCount")) {
      errors.push(`第 ${itemNumber} 筆單元 periodCount 欄位必填。`);
      return;
    }

    if (
      typeof unit.periodCount !== "number" ||
      !Number.isFinite(unit.periodCount) ||
      unit.periodCount <= 0
    ) {
      errors.push(`第 ${itemNumber} 筆單元 periodCount 欄位必須是正數。`);
    }
  });

  if (isTotalScoreValid && units.length > totalScore) {
    errors.push(
      `單元數量 ${units.length} 筆多於 totalScore ${totalScore}，無法讓每個單元至少分配 1 分。`,
    );
  }

  return errors;
}

function ensureMinimumScore(workUnits) {
  const zeroScoreUnits = workUnits
    .filter((unit) => unit.suggestedScore < 1)
    .sort(compareAllocationPriority);

  zeroScoreUnits.forEach((unit) => {
    const donor = workUnits
      .filter((candidate) => candidate !== unit && candidate.suggestedScore > 1)
      .sort(compareBorrowPriority)[0];

    unit.suggestedScore += 1;
    donor.suggestedScore -= 1;
  });
}

export function allocateScores(input) {
  const { totalScore, units } = isPlainObject(input) ? input : {};
  const errors = validateInput({ totalScore, units });

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const totalPeriods = units.reduce((sum, unit) => sum + unit.periodCount, 0);
  const workUnits = units.map((unit, index) => {
    const rawScore = totalScore * (unit.periodCount / totalPeriods);
    const baseScore = Math.floor(rawScore);

    return {
      id: unit.id,
      name: unit.name,
      periodCount: unit.periodCount,
      index,
      fractionalPart: rawScore - baseScore,
      suggestedScore: baseScore,
    };
  });

  const baseTotal = workUnits.reduce(
    (sum, unit) => sum + unit.suggestedScore,
    0,
  );
  let remainingScore = totalScore - baseTotal;

  [...workUnits].sort(compareAllocationPriority).forEach((unit) => {
    if (remainingScore <= 0) {
      return;
    }

    unit.suggestedScore += 1;
    remainingScore -= 1;
  });

  ensureMinimumScore(workUnits);

  return {
    ok: true,
    allocations: workUnits.map(
      ({ id, name, periodCount, suggestedScore }) => ({
        id,
        name,
        periodCount,
        suggestedScore,
      }),
    ),
  };
}

const CHINESE_DIMENSIONS = new Set([
  "word_phrase",
  "sentence_grammar",
  "reading_writing",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateRequiredText(errors, obj, fieldName) {
  if (!hasText(obj[fieldName])) {
    errors.push(`${fieldName} 欄位必須是非空白字串。`);
  }
}

function validateStringField(errors, obj, fieldName) {
  if (typeof obj[fieldName] !== "string") {
    errors.push(`${fieldName} 欄位必須是字串。`);
  }
}

function validateStringArray(errors, value, fieldName, { minLength = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} 欄位必須是陣列。`);
    return;
  }

  if (value.length < minLength) {
    errors.push(`${fieldName} 欄位至少需要 ${minLength} 筆資料。`);
  }

  value.forEach((entry, index) => {
    if (!hasText(entry)) {
      errors.push(`${fieldName}[${index}] 欄位必須是非空白字串。`);
    }
  });
}

export function validateObjective(obj) {
  const errors = [];

  if (!isPlainObject(obj)) {
    return {
      valid: false,
      errors: ["objective 必須是物件。"],
    };
  }

  validateRequiredText(errors, obj, "objectiveId");
  validateRequiredText(errors, obj, "unitName");
  validateRequiredText(errors, obj, "lessonName");
  validateRequiredText(errors, obj, "text");

  if (!isPositiveNumber(obj.periodCount)) {
    errors.push("periodCount 欄位必須是大於 0 的數字。");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateItem(item, { isChinese } = {}) {
  const errors = [];

  if (!isPlainObject(item)) {
    return {
      valid: false,
      errors: ["item 必須是物件。"],
    };
  }

  validateRequiredText(errors, item, "itemId");
  validateStringField(errors, item, "groupId");
  validateRequiredText(errors, item, "questionType");
  validateRequiredText(errors, item, "competencyType");
  validateStringField(errors, item, "stimulus");
  validateRequiredText(errors, item, "question");
  validateStringArray(errors, item.options, "options");
  validateRequiredText(errors, item, "answer");
  validateStringField(errors, item, "explanation");
  validateStringArray(errors, item.objectiveIds, "objectiveIds", {
    minLength: 1,
  });

  if (!isPositiveNumber(item.score)) {
    errors.push("score 欄位必須是大於 0 的數字。");
  }

  if (!isPositiveNumber(item.estimatedTimeSeconds)) {
    errors.push("estimatedTimeSeconds 欄位必須是大於 0 的數字。");
  }

  if (
    item.discriminationPrediction !== undefined &&
    item.discriminationPrediction !== null
  ) {
    const value = item.discriminationPrediction;

    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      errors.push("discriminationPrediction 欄位必須介於 0 與 1 之間。");
    }
  }

  if (isChinese && !CHINESE_DIMENSIONS.has(item.chineseDimension)) {
    errors.push(
      "chineseDimension 欄位為國語科必填，且只能是 word_phrase、sentence_grammar 或 reading_writing。",
    );
  } else if (
    item.chineseDimension !== undefined &&
    item.chineseDimension !== null &&
    item.chineseDimension !== "" &&
    !CHINESE_DIMENSIONS.has(item.chineseDimension)
  ) {
    errors.push(
      "chineseDimension 欄位只能是 word_phrase、sentence_grammar 或 reading_writing。",
    );
  }

  if (!Array.isArray(item.reviewFlags)) {
    errors.push("reviewFlags 欄位必須是陣列。");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

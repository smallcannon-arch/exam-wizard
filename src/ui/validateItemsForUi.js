import { validateItem } from "../core/schemas.js";

function isGroupSubItem(item) {
  return typeof item?.groupId === "string" && item.groupId.trim() !== "";
}

function optionCount(item) {
  return Array.isArray(item?.options)
    ? item.options.filter((option) => String(option ?? "").trim() !== "").length
    : 0;
}

function shouldRequireChoiceOptions(item) {
  return item?.questionType === "選擇題" && !isGroupSubItem(item);
}

function normalizeQuestionTypeForAudit(item) {
  if (
    isGroupSubItem(item) &&
    item?.questionType === "選擇題" &&
    optionCount(item) < 3
  ) {
    return "簡答題";
  }

  return item?.questionType;
}

export function normalizeItemForUiValidation(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    ...item,
    questionType: normalizeQuestionTypeForAudit(item),
  };
}

export function validateItemForUi(item, { isChinese } = {}) {
  const normalizedItem = normalizeItemForUiValidation(item);
  const result = validateItem(normalizedItem, { isChinese });
  const errors = [...result.errors];

  if (shouldRequireChoiceOptions(item) && optionCount(item) < 3) {
    errors.push("選擇題的選項至少需 3 個。");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeItemsForAudit(items = []) {
  return (Array.isArray(items) ? items : []).map((item) =>
    normalizeItemForUiValidation(item),
  );
}

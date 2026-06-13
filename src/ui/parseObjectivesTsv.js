import { validateObjective } from "../core/schemas.js";
import { replaceFieldLabels, toFieldLabel } from "./fieldLabels.js";

const FIELD_NAMES = [
  "objectiveId",
  "unitName",
  "lessonName",
  "text",
  "periodCount",
];

function normalizeCell(value) {
  return String(value ?? "").replace(/\u3000/g, " ").trim();
}

function isBlankRow(cells) {
  return cells.every((cell) => normalizeCell(cell) === "");
}

function isNoteLine(row) {
  const normalized = normalizeCell(row);

  return normalized.startsWith("註：") || normalized.startsWith("註:");
}

function isMarkdownSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(normalizeCell(cell)));
}

function isHeaderRow(cells) {
  const normalizedCells = cells.map(normalizeCell);

  return (
    normalizedCells.length === FIELD_NAMES.length &&
    normalizedCells[0].includes("目標") &&
    normalizedCells[1].includes("單元") &&
    normalizedCells[2].includes("小單元") &&
    normalizedCells[3].includes("學習目標") &&
    normalizedCells[4].includes("節數")
  );
}

function parseRowCells(row) {
  const trimmedRow = row.trim();

  if (trimmedRow.includes("|")) {
    return trimmedRow
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(normalizeCell);
  }

  return row.split("\t").map(normalizeCell);
}

function toHalfWidthNumberText(value) {
  return String(value ?? "").replace(/[０-９．－]/g, (character) => {
    if (character === "．") {
      return ".";
    }

    if (character === "－") {
      return "-";
    }

    return String(character.charCodeAt(0) - "０".charCodeAt(0));
  });
}

export function normalizePeriodCount(raw) {
  const normalized = toHalfWidthNumberText(normalizeCell(raw)).replace(
    /\s*(小時|節|堂|課)\s*$/u,
    "",
  );
  const value = Number(normalized);

  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatPeriodCountError(rowNumber, rawValue) {
  const original = normalizeCell(rawValue);

  return `第 ${rowNumber} 列『${toFieldLabel("periodCount")}』需為大於 0 的數字（目前內容：『${original}』）。請改為數字，如 1 或 0.5。`;
}

export function parseObjectivesTsv(text) {
  if (typeof text !== "string") {
    return {
      ok: false,
      rows: [],
      objectives: [],
      errors: ["貼上內容必須是文字。"],
      notices: [],
    };
  }

  const objectives = [];
  const errors = [];
  const notices = [];
  const sourceRows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let collectingNotices = false;

  sourceRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const cells = parseRowCells(row);

    if (collectingNotices) {
      if (normalizeCell(row) !== "") {
        notices.push(normalizeCell(row));
      }
      return;
    }

    if (isNoteLine(row)) {
      collectingNotices = true;
      notices.push(normalizeCell(row));
      return;
    }

    if (isBlankRow(cells)) {
      return;
    }

    if (isHeaderRow(cells) || isMarkdownSeparator(cells)) {
      return;
    }

    if (cells.length !== FIELD_NAMES.length) {
      errors.push(`第 ${rowNumber} 列欄位數不正確，應為 5 欄。`);
      return;
    }

    const periodCount = normalizePeriodCount(cells[4]);

    if (periodCount === null) {
      errors.push(formatPeriodCountError(rowNumber, cells[4]));
      return;
    }

    const objective = {
      objectiveId: cells[0],
      unitName: cells[1],
      lessonName: cells[2],
      text: cells[3],
      periodCount,
    };
    const result = validateObjective(objective);

    if (!result.valid) {
      result.errors.forEach((error) => {
        errors.push(`第 ${rowNumber} 列 ${replaceFieldLabels(error)}`);
      });
      return;
    }

    objectives.push(objective);
  });

  return {
    ok: errors.length === 0,
    rows: objectives,
    objectives,
    errors,
    notices,
  };
}

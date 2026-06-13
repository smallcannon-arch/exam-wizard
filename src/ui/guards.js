import { validateObjective } from "../core/schemas.js";
import { summarizeBlueprint } from "./summarizeBlueprint.js";

function hasProject(state) {
  return state?.project !== null && typeof state?.project === "object";
}

function hasObjectives(state) {
  return (
    Array.isArray(state?.objectives) &&
    state.objectives.length > 0 &&
    state.objectives.every((objective) => validateObjective(objective).valid)
  );
}

function hasAllocations(state) {
  return Array.isArray(state?.allocations) && state.allocations.length > 0;
}

function hasBlueprint(state) {
  if (!Array.isArray(state?.blueprint) || state.blueprint.length === 0) {
    return false;
  }

  return summarizeBlueprint(state.allocations, state.blueprint).allMatched;
}

function hasPromptGenerated(state) {
  return (
    typeof state?.promptGeneratedAt === "string" &&
    state.promptGeneratedAt.trim() !== ""
  );
}

function hasItems(state) {
  return Array.isArray(state?.items) && state.items.length > 0;
}

function hasAuditReport(state) {
  return state?.auditReport !== null && typeof state?.auditReport === "object";
}

function hasFreshAuditReport(state) {
  return hasAuditReport(state) && state.auditStale !== true;
}

function hasNonErrorAuditReport(state) {
  return hasAuditReport(state) && state.auditReport.overallSeverity !== "error";
}

const STEP_RULES = {
  2: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
  ],
  3: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
  ],
  4: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
  ],
  5: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：命題藍圖。" },
  ],
  6: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：命題藍圖。" },
    { ok: hasPromptGenerated, reason: "請先完成步驟 5：產生出題指令。" },
  ],
  7: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：命題藍圖。" },
    { ok: hasItems, reason: "請先完成步驟 6：匯入題庫與檢核。" },
    { ok: hasAuditReport, reason: "請先完成題庫檢核並產生審題報告。" },
    { ok: hasFreshAuditReport, reason: "題庫已變更，請重新檢核。" },
    { ok: hasNonErrorAuditReport, reason: "審題報告仍有 error，請先修正題庫後重新檢核。" },
  ],
};

export function canEnterStep(state, stepNumber) {
  if (stepNumber === 1) {
    return {
      allowed: true,
      reason: "",
    };
  }

  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 7) {
    return {
      allowed: false,
      reason: "步驟編號不正確。",
    };
  }

  const failedRule = STEP_RULES[stepNumber].find((rule) => !rule.ok(state));

  if (failedRule) {
    return {
      allowed: false,
      reason: failedRule.reason,
    };
  }

  return {
    allowed: true,
    reason: "",
  };
}

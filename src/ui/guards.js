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

function hasTypePlanMode(state) {
  return state?.typePlanMode === "ai" || state?.typePlanMode === "manual";
}

function hasPromptGenerated(state) {
  return (
    typeof state?.promptGeneratedAt === "string" &&
    state.promptGeneratedAt.trim() !== ""
  );
}

function hasCandidatePool(state) {
  return Array.isArray(state?.candidatePool) && state.candidatePool.length > 0;
}

function hasItems(state) {
  return Array.isArray(state?.items) && state.items.length > 0;
}

function hasItemsOrManualPrompt(state) {
  return hasItems(state) || hasPromptGenerated(state);
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
  2: [{ ok: hasProject, reason: "請先完成步驟 1：建立試卷。" }],
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
    { ok: hasTypePlanMode, reason: "請先在步驟 4 選擇題型規劃模式。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：題型規劃。" },
  ],
  6: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasTypePlanMode, reason: "請先在步驟 4 選擇題型規劃模式。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：題型規劃。" },
    { ok: hasCandidatePool, reason: "請先完成步驟 5：生成備選題。" },
  ],
  7: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasTypePlanMode, reason: "請先在步驟 4 選擇題型規劃模式。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：題型規劃。" },
    {
      ok: hasItems,
      reason: "請先完成步驟 6：選題組卷。",
    },
  ],
  8: [
    { ok: hasProject, reason: "請先完成步驟 1：建立試卷。" },
    { ok: hasObjectives, reason: "請先完成步驟 2：匯入學習目標。" },
    { ok: hasAllocations, reason: "請先完成步驟 3：節數配分。" },
    { ok: hasBlueprint, reason: "請先完成步驟 4：題型規劃。" },
    { ok: hasItems, reason: "請先完成步驟 6：選題組卷。" },
    { ok: hasAuditReport, reason: "請先在步驟 7 執行審題檢核。" },
    { ok: hasFreshAuditReport, reason: "題庫已變更，請重新檢核。" },
    {
      ok: hasNonErrorAuditReport,
      reason: "審題結果仍有 error，請修正後重新檢核。",
    },
  ],
};

export function canEnterStep(state, stepNumber) {
  if (stepNumber === 1) {
    return {
      allowed: true,
      reason: "",
    };
  }

  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 8) {
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

import { describe, expect, it } from "vitest";
import { canEnterStep } from "../src/ui/guards.js";
import { applyAction, createInitialState } from "../src/ui/state.js";

const validObjective = {
  objectiveId: "1-1-1",
  unitName: "一、探索星空的奧祕",
  lessonName: "1-1 星星的位置",
  text: "能以方位與高度描述觀察到的星星位置。",
  periodCount: 3,
};

const validAllocation = {
  id: "U1",
  name: "一、探索星空的奧祕",
  periodCount: 3,
  suggestedScore: 100,
};

const validBlueprint = {
  objectiveId: "1-1-1",
  unitName: "一、探索星空的奧祕",
  questionTypes: ["選擇題"],
  plannedScore: 100,
  groupHint: "",
};

function createReadyForBlueprintState() {
  const projectState = applyAction(createInitialState(), {
    type: "SET_PROJECT",
    payload: { subject: "自然" },
  });
  const objectiveState = applyAction(projectState, {
    type: "SET_OBJECTIVES",
    payload: [validObjective],
  });

  return applyAction(objectiveState, {
    type: "SET_ALLOCATIONS",
    payload: [validAllocation],
  });
}

function createReadyForAuditState() {
  const baseState = createReadyForBlueprintState();
  const blueprintState = applyAction(baseState, {
    type: "SET_BLUEPRINT",
    payload: [validBlueprint],
  });
  const promptState = applyAction(blueprintState, {
    type: "SET_PROMPT_GENERATED_AT",
    payload: "2026-06-13T10:00:00+08:00",
  });

  return applyAction(promptState, {
    type: "SET_ITEMS",
    payload: [{ itemId: "A-01" }],
  });
}

describe("ui guards", () => {
  it("步驟 1 永遠可以進入", () => {
    expect(canEnterStep(createInitialState(), 1)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("無 project 時步驟 2 不可進入，reason 為繁體中文", () => {
    expect(canEnterStep(createInitialState(), 2)).toEqual({
      allowed: false,
      reason: "請先完成步驟 1：建立試卷。",
    });
  });

  it("有 project 時可進入步驟 2", () => {
    const state = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
    });

    expect(canEnterStep(state, 2)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("缺學習目標時不可進入步驟 3", () => {
    const state = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
    });

    expect(canEnterStep(state, 3)).toEqual({
      allowed: false,
      reason: "請先完成步驟 2：匯入學習目標。",
    });
  });

  it("學習目標未通過驗證時不可進入步驟 3", () => {
    const projectState = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
    });
    const state = applyAction(projectState, {
      type: "SET_OBJECTIVES",
      payload: [{ ...validObjective, periodCount: 0 }],
    });

    expect(canEnterStep(state, 3)).toEqual({
      allowed: false,
      reason: "請先完成步驟 2：匯入學習目標。",
    });
  });

  it("學習目標齊備時可進入步驟 3", () => {
    const projectState = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
    });
    const state = applyAction(projectState, {
      type: "SET_OBJECTIVES",
      payload: [validObjective],
    });

    expect(canEnterStep(state, 3)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("缺 allocations 時不可進入步驟 4", () => {
    const projectState = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
    });
    const objectiveState = applyAction(projectState, {
      type: "SET_OBJECTIVES",
      payload: [validObjective],
    });

    expect(canEnterStep(objectiveState, 4)).toEqual({
      allowed: false,
      reason: "請先完成步驟 3：節數配分。",
    });
  });

  it("allocations 存在時可進入步驟 4", () => {
    const state = createReadyForBlueprintState();

    expect(canEnterStep(state, 4)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 4 到 5 需藍圖全數吻合", () => {
    const baseState = createReadyForBlueprintState();
    const state = applyAction(baseState, {
      type: "SET_BLUEPRINT",
      payload: [{ ...validBlueprint, plannedScore: 99 }],
    });

    expect(canEnterStep(state, 5)).toEqual({
      allowed: false,
      reason: "請先完成步驟 4：命題藍圖。",
    });
  });

  it("藍圖全數吻合時可進入步驟 5", () => {
    const baseState = createReadyForBlueprintState();
    const state = applyAction(baseState, {
      type: "SET_BLUEPRINT",
      payload: [validBlueprint],
    });

    expect(canEnterStep(state, 5)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 5 到 6 需 promptGeneratedAt 存在", () => {
    const baseState = createReadyForBlueprintState();
    const state = applyAction(baseState, {
      type: "SET_BLUEPRINT",
      payload: [validBlueprint],
    });

    expect(canEnterStep(state, 6)).toEqual({
      allowed: false,
      reason: "請先完成步驟 5：產生出題指令。",
    });
  });

  it("promptGeneratedAt 存在時可進入步驟 6", () => {
    const baseState = createReadyForBlueprintState();
    const blueprintState = applyAction(baseState, {
      type: "SET_BLUEPRINT",
      payload: [validBlueprint],
    });
    const state = applyAction(blueprintState, {
      type: "SET_PROMPT_GENERATED_AT",
      payload: "2026-06-13T10:00:00+08:00",
    });

    expect(canEnterStep(state, 6)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 6 到 7 需 auditReport 存在", () => {
    const state = createReadyForAuditState();

    expect(canEnterStep(state, 7)).toEqual({
      allowed: false,
      reason: "請先完成題庫檢核並產生審題報告。",
    });
  });

  it("auditReport 過期時不可進入步驟 7", () => {
    const baseState = createReadyForAuditState();
    const auditedState = applyAction(baseState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "pass" },
    });
    const staleState = applyAction(auditedState, {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-02" }],
    });

    expect(canEnterStep(staleState, 7)).toEqual({
      allowed: false,
      reason: "題庫已變更，請重新檢核。",
    });
  });

  it("auditReport 為 error 時不可進入步驟 7", () => {
    const baseState = createReadyForAuditState();
    const state = applyAction(baseState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "error" },
    });

    expect(canEnterStep(state, 7)).toEqual({
      allowed: false,
      reason: "審題報告仍有 error，請先修正題庫後重新檢核。",
    });
  });

  it("auditReport 為 warning 且未過期時可進入步驟 7", () => {
    const baseState = createReadyForAuditState();
    const state = applyAction(baseState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "warning" },
    });

    expect(canEnterStep(state, 7)).toEqual({
      allowed: true,
      reason: "",
    });
  });
});

import { describe, expect, it } from "vitest";
import { canEnterStep } from "../src/ui/guards.js";
import { applyAction, createInitialState } from "../src/ui/state.js";

const validObjective = {
  objectiveId: "1-1-1",
  unitName: "一、探索星空的奧祕",
  lessonName: "1-1 星空大解密",
  text: "能以方位和高度角描述星星位置。",
  periodCount: 3,
};

const validAllocation = {
  id: "U1",
  name: "一、探索星空的奧祕",
  periodCount: 3,
  suggestedScore: 100,
};

const validBlueprint = {
  sectionId: "S-01",
  objectiveId: "1-1-1",
  unitName: "一、探索星空的奧祕",
  questionTypes: ["選擇題"],
  plannedScore: 100,
  groupHint: "",
};

const validSection = {
  sectionId: "S-01",
  order: 1,
  title: "一、選擇題",
  kind: "normal",
  questionType: "選擇題",
  objectiveIds: ["1-1-1"],
  plannedCount: 10,
};

const validGroupSection = {
  sectionId: "S-02",
  order: 1,
  title: "一、題組",
  kind: "group",
  questionType: "題組",
  objectiveIds: ["1-1-1"],
  plannedCount: 3,
  subCount: 3,
  textMode: "provided",
  providedText: "一段觀察紀錄文本。",
  topicHint: "",
};

function withProject(state = createInitialState()) {
  return applyAction(state, {
    type: "SET_PROJECT",
    payload: { subject: "自然", grade: 5 },
  });
}

function readyForStep3() {
  return applyAction(withProject(), {
    type: "SET_OBJECTIVES",
    payload: [validObjective],
  });
}

function readyForStep4() {
  return applyAction(readyForStep3(), {
    type: "SET_ALLOCATIONS",
    payload: [validAllocation],
  });
}

function readyForStep5() {
  return applyAction(
    applyAction(readyForStep4(), {
      type: "SET_SECTIONS",
      payload: [validSection],
    }),
    {
      type: "SET_BLUEPRINT",
      payload: [validBlueprint],
    },
  );
}

function readyForStep6() {
  return applyAction(readyForStep5(), {
    type: "SET_CANDIDATE_POOL",
    payload: [{ itemId: "C-01", objectiveIds: ["1-1-1"] }],
  });
}

function readyForStep7() {
  return applyAction(readyForStep6(), {
    type: "SET_ITEMS",
    payload: [{ itemId: "A-01", objectiveIds: ["1-1-1"] }],
  });
}

describe("ui guards", () => {
  it("步驟 1 永遠可進入", () => {
    expect(canEnterStep(createInitialState(), 1)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("無 project 時步驟 2 不可進入且 reason 為繁體中文", () => {
    expect(canEnterStep(createInitialState(), 2)).toEqual({
      allowed: false,
      reason: "請先完成步驟 1：建立試卷。",
    });
  });

  it("有 project 時可進入步驟 2", () => {
    expect(canEnterStep(withProject(), 2)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 2 到 3 需目標齊備", () => {
    expect(canEnterStep(withProject(), 3)).toEqual({
      allowed: false,
      reason: "請先完成步驟 2：匯入學習目標。",
    });
    expect(canEnterStep(readyForStep3(), 3)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 3 到 4 需 allocations 存在", () => {
    expect(canEnterStep(readyForStep3(), 4)).toEqual({
      allowed: false,
      reason: "請先完成步驟 3：節數配分。",
    });
    expect(canEnterStep(readyForStep4(), 4)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 4 到 5 需卷結構涵蓋所有目標", () => {
    const noSectionState = applyAction(readyForStep4(), {
      type: "SET_BLUEPRINT",
      payload: [validBlueprint],
    });
    const emptySectionState = applyAction(readyForStep4(), {
      type: "SET_SECTIONS",
      payload: [{ ...validSection, objectiveIds: [] }],
    });

    expect(canEnterStep(noSectionState, 5)).toEqual({
      allowed: false,
      reason: "請先完成步驟 4：卷結構規劃。",
    });

    expect(canEnterStep(emptySectionState, 5)).toEqual({
      allowed: false,
      reason: "請先完成步驟 4：卷結構規劃。",
    });
    expect(canEnterStep(readyForStep5(), 5)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("題組大題需完成文本來源、小題數與目標設定才可進入步驟 5", () => {
    const missingTextState = applyAction(readyForStep4(), {
      type: "SET_SECTIONS",
      payload: [{ ...validGroupSection, providedText: "" }],
    });
    const validGroupState = applyAction(
      applyAction(readyForStep4(), {
        type: "SET_SECTIONS",
        payload: [validGroupSection],
      }),
      {
        type: "SET_BLUEPRINT",
        payload: [{ ...validBlueprint, sectionId: "S-02", questionTypes: ["題組"] }],
      },
    );

    expect(canEnterStep(missingTextState, 5)).toEqual({
      allowed: false,
      reason: "請先完成步驟 4：卷結構規劃。",
    });
    expect(canEnterStep(validGroupState, 5)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 5 到 6 需 candidatePool 非空", () => {
    expect(canEnterStep(readyForStep5(), 6)).toEqual({
      allowed: false,
      reason: "請先完成步驟 5：生成備選題。",
    });
    expect(canEnterStep(readyForStep6(), 6)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 6 到 7 需 items 非空", () => {
    expect(canEnterStep(readyForStep6(), 7)).toEqual({
      allowed: false,
      reason: "請先完成步驟 6：選題組卷。",
    });

    const manualPromptState = applyAction(readyForStep5(), {
      type: "SET_PROMPT_GENERATED_AT",
      payload: "2026-06-13T10:00:00+08:00",
    });

    expect(canEnterStep(manualPromptState, 7)).toEqual({
      allowed: false,
      reason: "請先完成步驟 6：選題組卷。",
    });
    expect(canEnterStep(readyForStep7(), 7)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟 7 到 8 需 auditReport 存在、非過期且非 error", () => {
    expect(canEnterStep(readyForStep7(), 8)).toEqual({
      allowed: false,
      reason: "請先在步驟 7 執行審題檢核。",
    });

    const auditedState = applyAction(readyForStep7(), {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "pass" },
    });
    const staleState = applyAction(auditedState, {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-02", objectiveIds: ["1-1-1"] }],
    });
    const errorState = applyAction(readyForStep7(), {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "error" },
    });
    const warningState = applyAction(readyForStep7(), {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "warning" },
    });

    expect(staleState.auditStale).toBe(true);
    expect(canEnterStep(staleState, 8)).toEqual({
      allowed: false,
      reason: "題庫已變更，請重新檢核。",
    });
    expect(canEnterStep(errorState, 8)).toEqual({
      allowed: false,
      reason: "審題結果仍有 error，請修正後重新檢核。",
    });
    expect(canEnterStep(warningState, 8)).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("步驟編號超出 1 到 8 時不可進入", () => {
    expect(canEnterStep(createInitialState(), 9)).toEqual({
      allowed: false,
      reason: "步驟編號不正確。",
    });
  });
});

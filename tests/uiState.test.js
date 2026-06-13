import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  deserializeState,
  serializeState,
} from "../src/ui/state.js";

describe("ui state", () => {
  it("createInitialState 結構正確", () => {
    expect(createInitialState()).toEqual({
      currentStep: 1,
      project: null,
      objectives: [],
      allocations: [],
      typePlanMode: null,
      blueprint: [],
      materialText: "",
      promptGeneratedAt: null,
      candidatePool: [],
      candidatesPerObjective: 3,
      items: [],
      auditReport: null,
      auditStale: false,
      apiBusy: false,
      updatedAt: null,
    });
  });

  it("applyAction 各 action type 行為正確且不變更原 state", () => {
    const original = createInitialState();
    const originalSnapshot = structuredClone(original);
    const updatedAt = "2026-06-13T10:00:00+08:00";
    const projectState = applyAction(original, {
      type: "SET_PROJECT",
      payload: { subject: "自然" },
      updatedAt,
    });
    const objectivesState = applyAction(projectState, {
      type: "SET_OBJECTIVES",
      payload: [{ objectiveId: "O-1" }],
      updatedAt,
    });
    const allocationsState = applyAction(objectivesState, {
      type: "SET_ALLOCATIONS",
      payload: [{ id: "U1", suggestedScore: 100 }],
      updatedAt,
    });
    const modeState = applyAction(allocationsState, {
      type: "SET_TYPE_PLAN_MODE",
      payload: "manual",
      updatedAt,
    });
    const blueprintState = applyAction(modeState, {
      type: "SET_BLUEPRINT",
      payload: [{ objectiveId: "O-1", plannedScore: 100 }],
      updatedAt,
    });
    const materialState = applyAction(blueprintState, {
      type: "SET_MATERIAL_TEXT",
      payload: "教材摘要",
      updatedAt,
    });
    const promptState = applyAction(materialState, {
      type: "SET_PROMPT_GENERATED_AT",
      payload: updatedAt,
      updatedAt,
    });
    const candidateState = applyAction(promptState, {
      type: "SET_CANDIDATE_POOL",
      payload: [{ itemId: "C-01" }],
      updatedAt,
    });
    const candidateCountState = applyAction(candidateState, {
      type: "SET_CANDIDATES_PER_OBJECTIVE",
      payload: 5,
      updatedAt,
    });
    const itemsState = applyAction(candidateCountState, {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-01" }],
      updatedAt,
    });
    const reportState = applyAction(itemsState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "pass" },
      updatedAt,
    });
    const busyState = applyAction(reportState, {
      type: "SET_API_BUSY",
      payload: true,
      updatedAt,
    });
    const stepState = applyAction(busyState, {
      type: "GO_TO_STEP",
      payload: 8,
      updatedAt,
    });

    expect(original).toEqual(originalSnapshot);
    expect(projectState.project).toEqual({ subject: "自然" });
    expect(objectivesState.objectives).toEqual([{ objectiveId: "O-1" }]);
    expect(allocationsState.allocations).toEqual([{ id: "U1", suggestedScore: 100 }]);
    expect(modeState.typePlanMode).toBe("manual");
    expect(blueprintState.blueprint).toEqual([{ objectiveId: "O-1", plannedScore: 100 }]);
    expect(materialState.materialText).toBe("教材摘要");
    expect(promptState.promptGeneratedAt).toBe(updatedAt);
    expect(candidateState.candidatePool).toEqual([{ itemId: "C-01" }]);
    expect(candidateCountState.candidatesPerObjective).toBe(5);
    expect(itemsState.items).toEqual([{ itemId: "A-01" }]);
    expect(reportState.auditReport).toEqual({ overallSeverity: "pass" });
    expect(reportState.auditStale).toBe(false);
    expect(busyState.apiBusy).toBe(true);
    expect(stepState.currentStep).toBe(8);
    expect(stepState.updatedAt).toBe(updatedAt);
  });

  it("GO_TO_STEP 範圍限制為 1 到 8", () => {
    expect(
      applyAction(createInitialState(), { type: "GO_TO_STEP", payload: 99 }).currentStep,
    ).toBe(8);
    expect(
      applyAction(createInitialState(), { type: "GO_TO_STEP", payload: -1 }).currentStep,
    ).toBe(1);
  });

  it("apiBusy 可設為忙碌與清除，忙碌中重複設忙碌不產生新 state", () => {
    const busyState = applyAction(createInitialState(), {
      type: "SET_API_BUSY",
      payload: true,
      updatedAt: "2026-06-13T10:00:00+08:00",
    });
    const duplicateBusyState = applyAction(busyState, {
      type: "SET_API_BUSY",
      payload: true,
      updatedAt: "2026-06-13T10:01:00+08:00",
    });
    const idleState = applyAction(busyState, {
      type: "SET_API_BUSY",
      payload: false,
      updatedAt: "2026-06-13T10:02:00+08:00",
    });

    expect(busyState.apiBusy).toBe(true);
    expect(duplicateBusyState).toBe(busyState);
    expect(idleState.apiBusy).toBe(false);
    expect(idleState.updatedAt).toBe("2026-06-13T10:02:00+08:00");
  });

  it("items 變更後 auditReport 會標記為過期", () => {
    const itemState = applyAction(createInitialState(), {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-01" }],
    });
    const auditedState = applyAction(itemState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "pass" },
    });
    const changedState = applyAction(auditedState, {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-02" }],
    });

    expect(auditedState.auditStale).toBe(false);
    expect(changedState.auditReport).toEqual({ overallSeverity: "pass" });
    expect(changedState.auditStale).toBe(true);
  });

  it("RENUMBER_OBJECTIVES 同步改寫 blueprint、items 與 candidatePool 引用並標記過期", () => {
    const auditedState = {
      ...createInitialState(),
      objectives: [
        {
          objectiveId: "17",
          unitName: "四、揭祕動物的世界",
          lessonName: "4-2 動物的生存之道",
          text: "觀察動物適應環境的方式。",
          periodCount: 1,
        },
        {
          objectiveId: "18",
          unitName: "四、揭祕動物的世界",
          lessonName: "4-2 動物的生存之道",
          text: "說明動物行為與生存的關係。",
          periodCount: 1,
        },
      ],
      blueprint: [
        {
          objectiveId: "17",
          unitName: "四、揭祕動物的世界",
          questionTypes: ["選擇題"],
          plannedScore: 50,
        },
      ],
      candidatePool: [{ itemId: "C-01", objectiveIds: ["17"] }],
      items: [{ itemId: "A-01", objectiveIds: ["17", "18", "9-9-9"] }],
      auditReport: { overallSeverity: "pass" },
      auditStale: false,
    };
    const result = applyAction(auditedState, {
      type: "RENUMBER_OBJECTIVES",
      updatedAt: "2026-06-13T10:10:00+08:00",
    });

    expect(result.objectives.map((objective) => objective.objectiveId)).toEqual([
      "4-2-1",
      "4-2-2",
    ]);
    expect(result.blueprint[0].objectiveId).toBe("4-2-1");
    expect(result.candidatePool[0].objectiveIds).toEqual(["4-2-1"]);
    expect(result.items[0].objectiveIds).toEqual(["4-2-1", "4-2-2", "9-9-9"]);
    expect(result.auditStale).toBe(true);
  });

  it("RESET 回到初始狀態", () => {
    const changed = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "國語" },
    });

    expect(applyAction(changed, { type: "RESET" })).toEqual(createInitialState());
  });

  it("serialize 到 deserialize 往返一致", () => {
    const state = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "自然", grade: 5 },
      updatedAt: "2026-06-13T10:00:00+08:00",
    });
    const result = deserializeState(serializeState(state));

    expect(result.warning).toBeNull();
    expect(result.state).toEqual(state);
  });

  it("project.version 於其他加自填情境可正確存取", () => {
    const state = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: {
        subject: "自然",
        grade: 5,
        version: "校本教材",
        versionChoice: "其他",
        versionOther: "校本教材",
        publisher: "校本教材",
      },
    });
    const result = deserializeState(serializeState(state));

    expect(result.warning).toBeNull();
    expect(result.state.project.version).toBe("校本教材");
    expect(result.state.project.versionChoice).toBe("其他");
    expect(result.state.project.versionOther).toBe("校本教材");
  });

  it("deserializeState 收到壞 JSON 回初始狀態與 warning", () => {
    const result = deserializeState("不是 JSON");

    expect(result.state).toEqual(createInitialState());
    expect(result.warning).toBe("草稿資料無法讀取，已改用新的空白草稿。");
  });

  it("deserializeState 收到缺欄位資料回初始狀態與 warning", () => {
    const result = deserializeState(JSON.stringify({ currentStep: 1 }));

    expect(result.state).toEqual(createInitialState());
    expect(result.warning).toBe("草稿資料格式不完整，已改用新的空白草稿。");
  });
});

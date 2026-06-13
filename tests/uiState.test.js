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
      blueprint: [],
      materialText: "",
      promptGeneratedAt: null,
      items: [],
      auditReport: null,
      auditStale: false,
      apiBusy: false,
      updatedAt: null,
    });
  });

  it("applyAction 各 action type 行為正確，且不變更原 state", () => {
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
    const blueprintState = applyAction(allocationsState, {
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
    const itemsState = applyAction(promptState, {
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
      payload: 7,
      updatedAt,
    });

    expect(original).toEqual(originalSnapshot);
    expect(projectState.project).toEqual({ subject: "自然" });
    expect(objectivesState.objectives).toEqual([{ objectiveId: "O-1" }]);
    expect(allocationsState.allocations).toEqual([{ id: "U1", suggestedScore: 100 }]);
    expect(blueprintState.blueprint).toEqual([{ objectiveId: "O-1", plannedScore: 100 }]);
    expect(materialState.materialText).toBe("教材摘要");
    expect(promptState.promptGeneratedAt).toBe(updatedAt);
    expect(itemsState.items).toEqual([{ itemId: "A-01" }]);
    expect(reportState.auditReport).toEqual({ overallSeverity: "pass" });
    expect(reportState.auditStale).toBe(false);
    expect(busyState.apiBusy).toBe(true);
    expect(stepState.currentStep).toBe(7);
    expect(stepState.updatedAt).toBe(updatedAt);
  });

  it("apiBusy 可設為忙碌與清除", () => {
    const busyState = applyAction(createInitialState(), {
      type: "SET_API_BUSY",
      payload: true,
      updatedAt: "2026-06-13T10:00:00+08:00",
    });
    const idleState = applyAction(busyState, {
      type: "SET_API_BUSY",
      payload: false,
      updatedAt: "2026-06-13T10:01:00+08:00",
    });

    expect(busyState.apiBusy).toBe(true);
    expect(busyState.updatedAt).toBe("2026-06-13T10:00:00+08:00");
    expect(idleState.apiBusy).toBe(false);
    expect(idleState.updatedAt).toBe("2026-06-13T10:01:00+08:00");
  });

  it("apiBusy 忙碌中重複設為忙碌時不產生新 state", () => {
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

    expect(duplicateBusyState).toBe(busyState);
    expect(duplicateBusyState.updatedAt).toBe("2026-06-13T10:00:00+08:00");
  });

  it("items 變更後 auditReport 應被標記為過期", () => {
    const itemState = applyAction(createInitialState(), {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-01" }],
      updatedAt: "2026-06-13T10:00:00+08:00",
    });
    const auditedState = applyAction(itemState, {
      type: "SET_AUDIT_REPORT",
      payload: { overallSeverity: "pass" },
      updatedAt: "2026-06-13T10:05:00+08:00",
    });
    const changedState = applyAction(auditedState, {
      type: "SET_ITEMS",
      payload: [{ itemId: "A-02" }],
      updatedAt: "2026-06-13T10:10:00+08:00",
    });

    expect(auditedState.auditStale).toBe(false);
    expect(changedState.auditReport).toEqual({ overallSeverity: "pass" });
    expect(changedState.auditStale).toBe(true);
  });

  it("RENUMBER_OBJECTIVES 同步改寫藍圖與題庫引用並標記檢核過期", () => {
    const auditedState = {
      ...createInitialState(),
      objectives: [
        {
          objectiveId: "17",
          unitName: "四、揭祕動物的世界",
          lessonName: "4-2 動物的生存之道",
          text: "觀察動物的生存方式。",
          periodCount: 1,
        },
        {
          objectiveId: "18",
          unitName: "四、揭祕動物的世界",
          lessonName: "4-2 動物的生存之道",
          text: "說明動物與環境的關係。",
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
      items: [
        {
          itemId: "A-01",
          objectiveIds: ["17", "18", "9-9-9"],
        },
      ],
      auditReport: { overallSeverity: "pass" },
      auditStale: false,
      updatedAt: "2026-06-13T10:00:00+08:00",
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
    expect(result.items[0].objectiveIds).toEqual(["4-2-1", "4-2-2", "9-9-9"]);
    expect(result.auditReport).toEqual({ overallSeverity: "pass" });
    expect(result.auditStale).toBe(true);
    expect(result.updatedAt).toBe("2026-06-13T10:10:00+08:00");
  });

  it("RESET 回到初始狀態", () => {
    const changed = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: { subject: "國語" },
      updatedAt: "2026-06-13T10:00:00+08:00",
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

  it("project.version 可保存其他版本自填名稱並序列化還原", () => {
    const state = applyAction(createInitialState(), {
      type: "SET_PROJECT",
      payload: {
        subject: "自然",
        grade: 5,
        version: "校本星空教材",
        versionChoice: "其他",
        versionOther: "校本星空教材",
        publisher: "校本星空教材",
      },
      updatedAt: "2026-06-13T10:00:00+08:00",
    });
    const result = deserializeState(serializeState(state));

    expect(result.warning).toBeNull();
    expect(result.state.project.version).toBe("校本星空教材");
    expect(result.state.project.versionChoice).toBe("其他");
    expect(result.state.project.versionOther).toBe("校本星空教材");
  });

  it("deserializeState 收到壞 JSON 時回初始狀態與 warning", () => {
    const result = deserializeState("不是 JSON");

    expect(result.state).toEqual(createInitialState());
    expect(result.warning).toBe("草稿資料無法解析，已改用初始狀態。");
  });

  it("deserializeState 收到缺欄位資料時回初始狀態與 warning", () => {
    const result = deserializeState(JSON.stringify({ currentStep: 1 }));

    expect(result.state).toEqual(createInitialState());
    expect(result.warning).toBe("草稿資料格式不完整，已改用初始狀態。");
  });
});

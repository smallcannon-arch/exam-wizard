import { renumberObjectives } from "./renumberObjectives.js";

const MIN_STEP = 1;
const MAX_STEP = 8;

export function createInitialState() {
  return {
    currentStep: 1,
    project: null,
    objectives: [],
    allocations: [],
    typePlanMode: null,
    sections: [],
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
  };
}

function cloneArrayPayload(payload) {
  return Array.isArray(payload) ? [...payload] : [];
}

function normalizeTypePlanMode(payload) {
  return payload === "ai" || payload === "manual" ? payload : null;
}

function normalizeCandidatesPerObjective(payload) {
  const value = Number(payload);
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 3;
}

function normalizeSection(section, index = 0) {
  const kind = section?.kind === "group" ? "group" : "normal";
  const questionType =
    kind === "group"
      ? "題組"
      : typeof section?.questionType === "string" && section.questionType.trim() !== ""
      ? section.questionType.trim()
      : "選擇題";
  const textMode = section?.textMode === "provided" ? "provided" : "ai";
  const subCount = Number(section?.subCount ?? section?.plannedCount);
  const plannedCount = Number.isInteger(Number(section?.plannedCount))
    ? Number(section.plannedCount)
    : Number.isInteger(subCount)
      ? subCount
      : 1;

  return {
    sectionId: section?.sectionId || `S-${String(index + 1).padStart(2, "0")}`,
    order: Number.isInteger(Number(section?.order)) ? Number(section.order) : index + 1,
    title: typeof section?.title === "string" ? section.title : "",
    kind,
    questionType,
    objectiveIds: Array.isArray(section?.objectiveIds) ? [...section.objectiveIds] : [],
    plannedCount,
    textMode,
    providedText:
      typeof section?.providedText === "string" ? section.providedText : "",
    topicHint: typeof section?.topicHint === "string" ? section.topicHint : "",
    subCount: Number.isInteger(subCount) && subCount > 0 ? subCount : plannedCount,
    stimulusPlan: typeof section?.stimulusPlan === "string" ? section.stimulusPlan : "",
    subQuestionPlan: Array.isArray(section?.subQuestionPlan)
      ? [...section.subQuestionPlan]
      : [],
  };
}

function normalizeSections(payload) {
  return cloneArrayPayload(payload)
    .map(normalizeSection)
    .sort((left, right) => left.order - right.order)
    .map((section, index) => ({ ...section, order: index + 1 }));
}

function createDefaultSection(existingSections) {
  const usedNumbers = new Set(
    cloneArrayPayload(existingSections)
      .map((section) => String(section?.sectionId ?? "").match(/^S-(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  let nextIndex = 1;

  while (usedNumbers.has(nextIndex)) {
    nextIndex += 1;
  }

  return normalizeSection(
    {
      sectionId: `S-${String(nextIndex).padStart(2, "0")}`,
      order: cloneArrayPayload(existingSections).length + 1,
      title: "",
      kind: "normal",
      questionType: "選擇題",
      objectiveIds: [],
      plannedCount: 1,
      textMode: "ai",
      providedText: "",
      topicHint: "",
      subCount: 3,
    },
    nextIndex - 1,
  );
}

function withUpdatedAt(state, action) {
  return {
    ...state,
    updatedAt: typeof action.updatedAt === "string" ? action.updatedAt : state.updatedAt,
  };
}

function remapObjectiveId(objectiveId, mapping) {
  return mapping[String(objectiveId ?? "")] ?? objectiveId;
}

function remapBlueprintObjectiveIds(blueprint, mapping) {
  return cloneArrayPayload(blueprint).map((entry) => ({
    ...entry,
    objectiveId: remapObjectiveId(entry?.objectiveId, mapping),
  }));
}

function remapSectionObjectiveIds(sections, mapping) {
  return normalizeSections(sections).map((section) => ({
    ...section,
    objectiveIds: section.objectiveIds.map((objectiveId) =>
      remapObjectiveId(objectiveId, mapping),
    ),
  }));
}

function remapItemObjectiveIds(items, mapping) {
  return cloneArrayPayload(items).map((item) => ({
    ...item,
    objectiveIds: Array.isArray(item?.objectiveIds)
      ? item.objectiveIds.map((objectiveId) => remapObjectiveId(objectiveId, mapping))
      : item?.objectiveIds,
  }));
}

export function applyAction(state, action) {
  const currentState = state ?? createInitialState();
  const currentAction = action ?? {};

  switch (currentAction.type) {
    case "SET_PROJECT":
      return withUpdatedAt(
        {
          ...currentState,
          project: currentAction.payload ?? null,
        },
        currentAction,
      );
    case "SET_OBJECTIVES":
      return withUpdatedAt(
        {
          ...currentState,
          objectives: cloneArrayPayload(currentAction.payload),
          allocations: [],
          typePlanMode: null,
          sections: [],
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "SET_ALLOCATIONS":
      return withUpdatedAt(
        {
          ...currentState,
          allocations: cloneArrayPayload(currentAction.payload),
        },
        currentAction,
      );
    case "SET_TYPE_PLAN_MODE":
      return withUpdatedAt(
        {
          ...currentState,
          typePlanMode: normalizeTypePlanMode(currentAction.payload),
        },
        currentAction,
      );
    case "SET_SECTIONS":
      return withUpdatedAt(
        {
          ...currentState,
          sections: normalizeSections(currentAction.payload),
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "ADD_SECTION":
      return withUpdatedAt(
        {
          ...currentState,
          sections: normalizeSections([
            ...currentState.sections,
            currentAction.payload
              ? normalizeSection(currentAction.payload, currentState.sections.length)
              : createDefaultSection(currentState.sections),
          ]),
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "UPDATE_SECTION": {
      const payload =
        currentAction.payload && typeof currentAction.payload === "object"
          ? currentAction.payload
          : {};
      const sectionId = payload.sectionId;

      return withUpdatedAt(
        {
          ...currentState,
          sections: normalizeSections(
            currentState.sections.map((section) =>
              section.sectionId === sectionId
                ? normalizeSection({ ...section, ...payload }, section.order - 1)
                : section,
            ),
          ),
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    }
    case "REMOVE_SECTION":
      return withUpdatedAt(
        {
          ...currentState,
          sections: normalizeSections(
            currentState.sections.filter(
              (section) => section.sectionId !== currentAction.payload,
            ),
          ),
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "REORDER_SECTION": {
      const payload =
        currentAction.payload && typeof currentAction.payload === "object"
          ? currentAction.payload
          : {};
      const fromIndex = currentState.sections.findIndex(
        (section) => section.sectionId === payload.sectionId,
      );
      const direction = payload.direction === "down" ? 1 : -1;
      const toIndex = fromIndex + direction;

      if (fromIndex < 0 || toIndex < 0 || toIndex >= currentState.sections.length) {
        return currentState;
      }

      const nextSections = [...currentState.sections];
      const [moved] = nextSections.splice(fromIndex, 1);
      nextSections.splice(toIndex, 0, moved);

      return withUpdatedAt(
        {
          ...currentState,
          sections: normalizeSections(
            nextSections.map((section, index) => ({
              ...section,
              order: index + 1,
            })),
          ),
          blueprint: [],
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    }
    case "SET_BLUEPRINT":
      return withUpdatedAt(
        {
          ...currentState,
          blueprint: cloneArrayPayload(currentAction.payload),
          promptGeneratedAt: null,
          candidatePool: [],
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "SET_MATERIAL_TEXT":
      return withUpdatedAt(
        {
          ...currentState,
          materialText:
            typeof currentAction.payload === "string" ? currentAction.payload : "",
        },
        currentAction,
      );
    case "SET_PROMPT_GENERATED_AT":
      return withUpdatedAt(
        {
          ...currentState,
          promptGeneratedAt:
            typeof currentAction.payload === "string" ? currentAction.payload : null,
        },
        currentAction,
      );
    case "SET_CANDIDATE_POOL":
      return withUpdatedAt(
        {
          ...currentState,
          candidatePool: cloneArrayPayload(currentAction.payload),
          items: [],
          auditReport: null,
          auditStale: false,
        },
        currentAction,
      );
    case "SET_CANDIDATES_PER_OBJECTIVE":
      return withUpdatedAt(
        {
          ...currentState,
          candidatesPerObjective: normalizeCandidatesPerObjective(currentAction.payload),
        },
        currentAction,
      );
    case "SET_ITEMS":
      return withUpdatedAt(
        {
          ...currentState,
          items: cloneArrayPayload(currentAction.payload),
          auditStale: currentState.auditReport !== null,
        },
        currentAction,
      );
    case "SET_AUDIT_REPORT":
      return withUpdatedAt(
        {
          ...currentState,
          auditReport: currentAction.payload ?? null,
          auditStale: false,
        },
        currentAction,
      );
    case "SET_API_BUSY": {
      const nextBusy = currentAction.payload === true;

      if (currentState.apiBusy === true && nextBusy === true) {
        return currentState;
      }

      return withUpdatedAt(
        {
          ...currentState,
          apiBusy: nextBusy,
        },
        currentAction,
      );
    }
    case "RENUMBER_OBJECTIVES": {
      const result =
        currentAction.payload && typeof currentAction.payload === "object"
          ? currentAction.payload
          : renumberObjectives(currentState.objectives);
      const mapping = result.mapping ?? {};

      return withUpdatedAt(
        {
          ...currentState,
          objectives: cloneArrayPayload(result.objectives),
          sections: remapSectionObjectiveIds(currentState.sections, mapping),
          blueprint: remapBlueprintObjectiveIds(currentState.blueprint, mapping),
          candidatePool: remapItemObjectiveIds(currentState.candidatePool, mapping),
          items: remapItemObjectiveIds(currentState.items, mapping),
          auditStale:
            currentState.auditReport !== null ? true : currentState.auditStale,
        },
        currentAction,
      );
    }
    case "GO_TO_STEP": {
      const stepNumber = Number(currentAction.payload);

      return withUpdatedAt(
        {
          ...currentState,
          currentStep: Number.isInteger(stepNumber)
            ? Math.min(Math.max(stepNumber, MIN_STEP), MAX_STEP)
            : currentState.currentStep,
        },
        currentAction,
      );
    }
    case "RESET":
      return createInitialState();
    default:
      return currentState;
  }
}

export function serializeState(state) {
  return JSON.stringify(state ?? createInitialState());
}

function isValidState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isInteger(value.currentStep) &&
    value.currentStep >= MIN_STEP &&
    value.currentStep <= MAX_STEP &&
    Object.prototype.hasOwnProperty.call(value, "project") &&
    Array.isArray(value.objectives) &&
    Array.isArray(value.allocations) &&
    (Array.isArray(value.sections) || value.sections === undefined) &&
    Array.isArray(value.blueprint) &&
    Array.isArray(value.items) &&
    Object.prototype.hasOwnProperty.call(value, "auditReport") &&
    Object.prototype.hasOwnProperty.call(value, "updatedAt")
  );
}

export function deserializeState(json) {
  try {
    const parsed = JSON.parse(json);

    if (!isValidState(parsed)) {
      return {
        state: createInitialState(),
        warning: "草稿資料格式不完整，已改用新的空白草稿。",
      };
    }

    return {
      state: {
        ...createInitialState(),
        ...parsed,
        objectives: [...parsed.objectives],
        allocations: [...parsed.allocations],
        typePlanMode: normalizeTypePlanMode(parsed.typePlanMode),
        sections: normalizeSections(parsed.sections),
        blueprint: [...parsed.blueprint],
        materialText:
          typeof parsed.materialText === "string" ? parsed.materialText : "",
        promptGeneratedAt:
          typeof parsed.promptGeneratedAt === "string"
            ? parsed.promptGeneratedAt
            : null,
        candidatePool: Array.isArray(parsed.candidatePool)
          ? [...parsed.candidatePool]
          : [],
        candidatesPerObjective: normalizeCandidatesPerObjective(
          parsed.candidatesPerObjective,
        ),
        items: [...parsed.items],
        auditStale: parsed.auditStale === true,
        apiBusy: parsed.apiBusy === true,
      },
      warning: null,
    };
  } catch {
    return {
      state: createInitialState(),
      warning: "草稿資料無法讀取，已改用新的空白草稿。",
    };
  }
}

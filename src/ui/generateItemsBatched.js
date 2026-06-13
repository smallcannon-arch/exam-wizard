const DEFAULT_MAX_ITEMS_PER_BATCH = 12;
const QUESTION_TYPE_ORDER = [
  "選擇題",
  "填充題",
  "勾選題",
  "應用題",
  "畫圖題",
  "其他",
  "題組",
];

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function toPositiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getQuestionTypes(entry) {
  return Array.isArray(entry?.questionTypes) && entry.questionTypes.length > 0
    ? entry.questionTypes
    : ["未指定題型"];
}

function countEntryItems(entry, perObjective) {
  return getQuestionTypes(entry).length * perObjective;
}

function createBatch(
  batchNumber,
  unitName,
  objectives,
  blueprint,
  perObjective,
  metadata = {},
) {
  const requestedItemCount = blueprint.reduce(
    (total, entry) => total + countEntryItems(entry, perObjective),
    0,
  );

  return {
    id: `B-${String(batchNumber).padStart(2, "0")}`,
    unitName,
    objectives: objectives.map((objective) => ({ ...objective })),
    blueprint: blueprint.map((entry) => ({ ...entry })),
    perObjective,
    requestedItemCount,
    ...metadata,
  };
}

function splitOversizedObjective({
  batchNumber,
  unitName,
  objective,
  entries,
  perObjective,
  maxItemsPerBatch,
}) {
  const batches = [];
  const maxTypesPerBatch = Math.max(1, Math.floor(maxItemsPerBatch / perObjective));
  let nextBatchNumber = batchNumber;

  entries.forEach((entry) => {
    const questionTypes = getQuestionTypes(entry);

    for (let index = 0; index < questionTypes.length; index += maxTypesPerBatch) {
      const chunk = questionTypes.slice(index, index + maxTypesPerBatch);
      batches.push(
        createBatch(
          nextBatchNumber,
          unitName,
          [objective],
          [
            {
              ...entry,
              questionTypes: chunk,
            },
          ],
          perObjective,
        ),
      );
      nextBatchNumber += 1;
    }
  });

  return { batches, nextBatchNumber };
}

function planSectionItemBatches({
  objectives,
  blueprint,
  sections,
  perObjective,
  maxItemsPerBatch,
}) {
  const objectiveById = new Map(
    objectives.map((objective) => [String(objective?.objectiveId ?? ""), objective]),
  );
  const blueprintBySectionAndObjective = new Map();

  blueprint.forEach((entry) => {
    const key = `${entry?.sectionId ?? ""}::${entry?.objectiveId ?? ""}`;
    const entries = blueprintBySectionAndObjective.get(key) ?? [];
    entries.push(entry);
    blueprintBySectionAndObjective.set(key, entries);
  });

  const batches = [];
  const errors = [];
  let nextBatchNumber = 1;

  sections
    .filter((section) => section?.kind !== "group")
    .sort((left, right) => Number(left.order) - Number(right.order))
    .forEach((section) => {
      const sectionObjectives = [];
      const sectionBlueprint = [];

      (Array.isArray(section.objectiveIds) ? section.objectiveIds : []).forEach(
        (objectiveId) => {
          const objective = objectiveById.get(String(objectiveId));

          if (!objective) {
            return;
          }

          const entries =
            blueprintBySectionAndObjective.get(`${section.sectionId}::${objectiveId}`) ??
            [];

          if (entries.length === 0) {
            errors.push(`大題 ${section.title || section.sectionId} 缺少 ${objectiveId} 的生成規劃。`);
            return;
          }

          sectionObjectives.push(objective);
          sectionBlueprint.push(...entries);
        },
      );

      const sectionRequestedCount = sectionBlueprint.reduce(
        (total, entry) => total + countEntryItems(entry, perObjective),
        0,
      );
      const metadata = {
        sectionId: section.sectionId,
        sectionTitle: section.title,
        questionType: section.questionType,
      };

      if (sectionObjectives.length === 0 || sectionBlueprint.length === 0) {
        errors.push(`大題 ${section.title || section.sectionId} 缺少可生成的學習目標。`);
        return;
      }

      if (sectionRequestedCount <= maxItemsPerBatch) {
        batches.push(
          createBatch(
            nextBatchNumber,
            section.title || section.sectionId,
            sectionObjectives,
            sectionBlueprint,
            perObjective,
            metadata,
          ),
        );
        nextBatchNumber += 1;
        return;
      }

      let currentObjectives = [];
      let currentBlueprint = [];
      let currentCount = 0;

      sectionObjectives.forEach((objective) => {
        const entries =
          blueprintBySectionAndObjective.get(
            `${section.sectionId}::${objective.objectiveId}`,
          ) ?? [];
        const objectiveCount = entries.reduce(
          (total, entry) => total + countEntryItems(entry, perObjective),
          0,
        );

        if (
          currentObjectives.length > 0 &&
          currentCount + objectiveCount > maxItemsPerBatch
        ) {
          batches.push(
            createBatch(
              nextBatchNumber,
              section.title || section.sectionId,
              currentObjectives,
              currentBlueprint,
              perObjective,
              metadata,
            ),
          );
          nextBatchNumber += 1;
          currentObjectives = [];
          currentBlueprint = [];
          currentCount = 0;
        }

        if (objectiveCount > maxItemsPerBatch) {
          const split = splitOversizedObjective({
            batchNumber: nextBatchNumber,
            unitName: section.title || section.sectionId,
            objective,
            entries,
            perObjective,
            maxItemsPerBatch,
          });
          batches.push(
            ...split.batches.map((batch) => ({
              ...batch,
              ...metadata,
            })),
          );
          nextBatchNumber = split.nextBatchNumber;
          return;
        }

        currentObjectives.push(objective);
        currentBlueprint.push(...entries);
        currentCount += objectiveCount;
      });

      if (currentObjectives.length > 0) {
        batches.push(
          createBatch(
            nextBatchNumber,
            section.title || section.sectionId,
            currentObjectives,
            currentBlueprint,
            perObjective,
            metadata,
          ),
        );
        nextBatchNumber += 1;
      }
    });

  if (errors.length > 0) {
    return { ok: false, batches: [], errors };
  }

  return { ok: true, batches, errors: [] };
}

export function planItemBatches({
  objectives,
  blueprint,
  sections = null,
  perObjective = 1,
  maxItemsPerBatch = DEFAULT_MAX_ITEMS_PER_BATCH,
}) {
  if (!isNonEmptyArray(objectives)) {
    return { ok: false, batches: [], errors: ["缺少學習目標，無法規劃生成批次。"] };
  }

  if (!isNonEmptyArray(blueprint)) {
    return { ok: false, batches: [], errors: ["缺少題型規劃，無法規劃生成批次。"] };
  }

  const safePerObjective = toPositiveInteger(perObjective, 1);
  const safeMaxItemsPerBatch = toPositiveInteger(
    maxItemsPerBatch,
    DEFAULT_MAX_ITEMS_PER_BATCH,
  );

  if (Array.isArray(sections) && sections.length > 0) {
    return planSectionItemBatches({
      objectives,
      blueprint,
      sections,
      perObjective: safePerObjective,
      maxItemsPerBatch: safeMaxItemsPerBatch,
    });
  }

  const blueprintByObjective = new Map();

  blueprint.forEach((entry) => {
    const objectiveId = String(entry?.objectiveId ?? "");
    const entries = blueprintByObjective.get(objectiveId) ?? [];
    entries.push(entry);
    blueprintByObjective.set(objectiveId, entries);
  });

  const unitOrder = [];
  const objectivesByUnit = new Map();

  objectives.forEach((objective) => {
    const unitName = String(objective?.unitName ?? "");

    if (!objectivesByUnit.has(unitName)) {
      unitOrder.push(unitName);
      objectivesByUnit.set(unitName, []);
    }

    objectivesByUnit.get(unitName).push(objective);
  });

  const batches = [];
  const errors = [];
  let nextBatchNumber = 1;

  unitOrder.forEach((unitName) => {
    const unitObjectives = objectivesByUnit.get(unitName);
    const unitBlueprint = [];
    let unitRequestedCount = 0;

    unitObjectives.forEach((objective) => {
      const entries = blueprintByObjective.get(objective.objectiveId) ?? [];

      if (entries.length === 0) {
        errors.push(`目標 ${objective.objectiveId} 缺少題型規劃。`);
        return;
      }

      entries.forEach((entry) => {
        unitBlueprint.push(entry);
        unitRequestedCount += countEntryItems(entry, safePerObjective);
      });
    });

    if (unitRequestedCount <= safeMaxItemsPerBatch) {
      batches.push(
        createBatch(
          nextBatchNumber,
          unitName,
          unitObjectives,
          unitBlueprint,
          safePerObjective,
        ),
      );
      nextBatchNumber += 1;
      return;
    }

    let currentObjectives = [];
    let currentBlueprint = [];
    let currentCount = 0;

    unitObjectives.forEach((objective) => {
      const entries = blueprintByObjective.get(objective.objectiveId) ?? [];
      const objectiveCount = entries.reduce(
        (total, entry) => total + countEntryItems(entry, safePerObjective),
        0,
      );

      if (entries.length === 0) {
        return;
      }

      if (
        currentObjectives.length > 0 &&
        currentCount + objectiveCount > safeMaxItemsPerBatch
      ) {
        batches.push(
          createBatch(
            nextBatchNumber,
            unitName,
            currentObjectives,
            currentBlueprint,
            safePerObjective,
          ),
        );
        nextBatchNumber += 1;
        currentObjectives = [];
        currentBlueprint = [];
        currentCount = 0;
      }

      if (objectiveCount > safeMaxItemsPerBatch) {
        const split = splitOversizedObjective({
          batchNumber: nextBatchNumber,
          unitName,
          objective,
          entries,
          perObjective: safePerObjective,
          maxItemsPerBatch: safeMaxItemsPerBatch,
        });
        batches.push(...split.batches);
        nextBatchNumber = split.nextBatchNumber;
        return;
      }

      currentObjectives.push(objective);
      currentBlueprint.push(...entries);
      currentCount += objectiveCount;
    });

    if (currentObjectives.length > 0) {
      batches.push(
        createBatch(
          nextBatchNumber,
          unitName,
          currentObjectives,
          currentBlueprint,
          safePerObjective,
        ),
      );
      nextBatchNumber += 1;
    }
  });

  if (errors.length > 0) {
    return { ok: false, batches: [], errors };
  }

  return { ok: true, batches, errors: [] };
}

function getQuestionTypeRank(item) {
  const effectiveType = item?.groupId ? "題組" : item?.questionType;
  const index = QUESTION_TYPE_ORDER.indexOf(effectiveType);
  return index >= 0 ? index : QUESTION_TYPE_ORDER.indexOf("其他");
}

function normalizeBatchResultItems(batchResult) {
  if (Array.isArray(batchResult)) {
    return batchResult;
  }

  if (Array.isArray(batchResult?.items)) {
    return batchResult.items;
  }

  return [];
}

export function mergeItemBatches(batchResults) {
  if (!Array.isArray(batchResults) || batchResults.length === 0) {
    return { ok: false, items: [], errors: ["缺少可合併的備選題。"] };
  }

  const items = batchResults
    .flatMap((batchResult, batchIndex) =>
      normalizeBatchResultItems(batchResult).map((item, itemIndex) => ({
        ...item,
        __batchOrder: batchIndex,
        __itemOrder: itemIndex,
      })),
    )
    .sort((left, right) => {
      const rankDiff = getQuestionTypeRank(left) - getQuestionTypeRank(right);

      if (rankDiff !== 0) {
        return rankDiff;
      }

      if (left.__batchOrder !== right.__batchOrder) {
        return left.__batchOrder - right.__batchOrder;
      }

      return left.__itemOrder - right.__itemOrder;
    });

  if (items.length === 0) {
    return { ok: false, items: [], errors: ["缺少可合併的備選題。"] };
  }

  return {
    ok: true,
    items: items.map((item, index) => {
      const { __batchOrder, __itemOrder, ...cleanItem } = item;

      return {
        ...cleanItem,
        itemId: `A-${String(index + 1).padStart(2, "0")}`,
      };
    }),
    errors: [],
  };
}

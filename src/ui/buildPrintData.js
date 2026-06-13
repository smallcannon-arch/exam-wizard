import { getCanonicalSubjectLabel, normalizeSubject } from "./subjects.js";

const QUESTION_TYPE_ORDER = ["選擇題", "填充題", "勾選題", "應用題", "畫圖題", "其他", "題組"];
const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const CHINESE_FALLBACK_NOTICE =
  "國語向度審核表將於國語向度模式推出，目前請暫用非國語版。";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getMajorTitle(index, questionType) {
  return `${CHINESE_NUMERALS[index] ?? index + 1}、${questionType}`;
}

function getQuestionBucket(item) {
  if (hasText(item?.groupId)) {
    return "題組";
  }

  return QUESTION_TYPE_ORDER.includes(item?.questionType) && item.questionType !== "題組"
    ? item.questionType
    : "其他";
}

function getQuestionTypeRank(questionType) {
  const index = QUESTION_TYPE_ORDER.indexOf(questionType);
  return index >= 0 ? index : QUESTION_TYPE_ORDER.indexOf("其他");
}

function getReviewQuestionPrefix(questionType) {
  if (!hasText(questionType)) {
    return "其他";
  }

  return questionType.endsWith("題") ? questionType.slice(0, -1) : questionType;
}

function getReviewQuestionNumber(item, displayNumber) {
  return `${getReviewQuestionPrefix(item?.questionType)}${displayNumber}`;
}

function createProjectInfo(project = {}) {
  return {
    schoolName: "新竹市內湖國民小學",
    schoolYear: project.schoolYear ?? "",
    semester: project.semester ?? "",
    examNumber: project.examNumber ?? "",
    grade: project.grade ?? "",
    subject: getCanonicalSubjectLabel(project.subject),
    publisher: project.publisher === "其他" && project.publisherOther
      ? project.publisherOther
      : (project.publisher ?? ""),
    scope: project.scope ?? "",
    teacher: project.teacher ?? "",
    totalScore: project.totalScore ?? 100,
  };
}

function buildObjectiveIndexes(objectives = []) {
  const objectivesByUnit = new Map();

  objectives.forEach((objective) => {
    if (!objectivesByUnit.has(objective.unitName)) {
      objectivesByUnit.set(objective.unitName, []);
    }

    objectivesByUnit.get(objective.unitName).push(objective.objectiveId);
  });

  return { objectivesByUnit };
}

function buildScoreTable(projectInfo, allocations = []) {
  const totalPeriods = allocations.reduce(
    (sum, allocation) => sum + (Number(allocation.periodCount) || 0),
    0,
  );
  const rows = allocations.map((allocation) => {
    const rawScore =
      totalPeriods > 0
        ? projectInfo.totalScore * (allocation.periodCount / totalPeriods)
        : 0;

    return {
      unitName: allocation.name,
      periodCount: allocation.periodCount,
      formula: `${allocation.periodCount} 節 ÷ ${totalPeriods} 節 × ${projectInfo.totalScore} ＝ ${rawScore.toFixed(1)} → ${allocation.suggestedScore} 分`,
      score: allocation.suggestedScore,
    };
  });

  return {
    project: projectInfo,
    rows,
    totalPeriods,
    totalScore: rows.reduce((sum, row) => sum + row.score, 0),
  };
}

function createSection(questionType, sectionIndex) {
  return {
    questionType,
    title: getMajorTitle(sectionIndex, questionType),
    items: [],
    groups: [],
  };
}

function assignNonGroupItems({ items, itemIdToDisplayNumber, itemIdToReviewNumber, sections }) {
  QUESTION_TYPE_ORDER
    .filter((questionType) => questionType !== "題組")
    .forEach((questionType) => {
      const matchingItems = items
        .map((item, originalIndex) => ({ item, originalIndex }))
        .filter(({ item }) => getQuestionBucket(item) === questionType);

      if (matchingItems.length === 0) {
        return;
      }

      const section = createSection(questionType, sections.length);
      matchingItems.forEach(({ item, originalIndex }, itemIndex) => {
        const displayNumber = itemIndex + 1;
        const displayLabel = `${section.title}第 ${displayNumber} 題`;
        const entry = {
          item,
          originalIndex,
          displayNumber,
          displayLabel,
        };

        section.items.push(entry);

        if (hasText(item.itemId)) {
          itemIdToDisplayNumber[item.itemId] = displayLabel;
          itemIdToReviewNumber[item.itemId] = getReviewQuestionNumber(
            item,
            displayNumber,
          );
        }
      });
      sections.push(section);
    });
}

function assignGroupItems({ items, itemIdToDisplayNumber, itemIdToReviewNumber, sections }) {
  const groupMap = new Map();
  const groups = [];

  items.forEach((item, originalIndex) => {
    if (getQuestionBucket(item) !== "題組") {
      return;
    }

    const groupId = item.groupId.trim();

    if (!groupMap.has(groupId)) {
      const group = {
        groupId,
        groupNumber: groups.length + 1,
        stimulusTitle: item.stimulusTitle ?? "",
        stimulus: item.stimulus ?? "",
        items: [],
      };
      groupMap.set(groupId, group);
      groups.push(group);
    }

    groupMap.get(groupId).items.push({ item, originalIndex });
  });

  if (groups.length === 0) {
    return;
  }

  const section = createSection("題組", sections.length);
  groups.forEach((group) => {
    const groupEntry = {
      ...group,
      items: group.items.map(({ item, originalIndex }, itemIndex) => {
        const displayNumber = `${group.groupNumber}-${itemIndex + 1}`;
        const displayLabel = `${section.title}第 ${displayNumber} 題`;

        if (hasText(item.itemId)) {
          itemIdToDisplayNumber[item.itemId] = displayLabel;
          itemIdToReviewNumber[item.itemId] = getReviewQuestionNumber(
            item,
            displayNumber,
          );
        }

        return {
          item,
          originalIndex,
          displayNumber,
          displayLabel,
        };
      }),
    };

    section.groups.push(groupEntry);
  });
  sections.push(section);
}

function buildPaper(projectInfo, items = []) {
  const sections = [];
  const itemIdToDisplayNumber = {};
  const itemIdToReviewNumber = {};

  assignNonGroupItems({
    items,
    itemIdToDisplayNumber,
    itemIdToReviewNumber,
    sections,
  });
  assignGroupItems({
    items,
    itemIdToDisplayNumber,
    itemIdToReviewNumber,
    sections,
  });

  return {
    project: projectInfo,
    sections,
    itemIdToDisplayNumber,
    itemIdToReviewNumber,
  };
}

function buildUnitRows(allocations = [], objectives = []) {
  const { objectivesByUnit } = buildObjectiveIndexes(objectives);

  return allocations.map((allocation) => ({
    unitName: allocation.name,
    periodCount: allocation.periodCount,
    score: allocation.suggestedScore,
    objectiveIds: objectivesByUnit.get(allocation.name) ?? [],
  }));
}

function buildChecklist(auditReport) {
  const suggestions = Array.isArray(auditReport?.checklistSuggestions)
    ? auditReport.checklistSuggestions
    : [];

  return suggestions.map((suggestion) => ({
    key: suggestion.key,
    label: suggestion.label,
    mark: suggestion.suggested === true ? "☑" : "☐",
    suggested: suggestion.suggested,
    needsHumanReview: suggestion.suggested === null,
    reason: suggestion.reason,
  }));
}

function getReviewFormat(subject) {
  const normalizedSubject = normalizeSubject(subject);

  if (normalizedSubject === "science") {
    return "science";
  }

  if (normalizedSubject === "chinese") {
    return "chinese_fallback";
  }

  return "non_chinese";
}

function getActualQuestionTypes(items = []) {
  return [...new Set(
    items
      .map((item) => (hasText(item?.questionType) ? item.questionType : getQuestionBucket(item)))
      .filter(hasText),
  )].sort((left, right) => {
    const rankDiff = getQuestionTypeRank(left) - getQuestionTypeRank(right);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.localeCompare(right, "zh-Hant");
  });
}

function createEmptyByType(questionTypes) {
  return Object.fromEntries(
    questionTypes.map((questionType) => [
      questionType,
      {
        itemNumbers: [],
        score: 0,
      },
    ]),
  );
}

function buildScienceRows({
  objectives = [],
  items = [],
  itemIdToReviewNumber = {},
}) {
  const questionTypes = getActualQuestionTypes(items);
  const rowByObjectiveId = new Map();
  const notices = [];

  objectives.forEach((objective) => {
    rowByObjectiveId.set(objective.objectiveId, {
      unitName: objective.unitName,
      lessonName: objective.lessonName,
      objectiveId: objective.objectiveId,
      objectiveText: objective.text,
      periodCount: objective.periodCount,
      byType: createEmptyByType(questionTypes),
      rowTotal: 0,
    });
  });

  items.forEach((item) => {
    const objectiveIds = Array.isArray(item?.objectiveIds) ? item.objectiveIds : [];
    const knownObjectiveIds = objectiveIds.filter((objectiveId) =>
      rowByObjectiveId.has(objectiveId),
    );

    if (knownObjectiveIds.length === 0) {
      return;
    }

    const questionType = hasText(item.questionType)
      ? item.questionType
      : getQuestionBucket(item);
    const scoreShare = (Number(item.score) || 0) / knownObjectiveIds.length;
    const itemNumber = itemIdToReviewNumber[item.itemId] ?? "";

    if (objectiveIds.length > 1) {
      notices.push(
        `題號 ${itemNumber || item.itemId || "未命名題目"} 對應多個學習目標，配分已平均分攤，請人工確認歸屬。`,
      );
    }

    knownObjectiveIds.forEach((objectiveId) => {
      const row = rowByObjectiveId.get(objectiveId);

      if (!row.byType[questionType]) {
        row.byType[questionType] = {
          itemNumbers: [],
          score: 0,
        };
      }

      if (itemNumber) {
        row.byType[questionType].itemNumbers.push(itemNumber);
      }

      row.byType[questionType].score += scoreShare;
      row.rowTotal += scoreShare;
    });
  });

  const typeTotals = Object.fromEntries(
    questionTypes.map((questionType) => [
      questionType,
      objectives.reduce((sum, objective) => {
        const row = rowByObjectiveId.get(objective.objectiveId);
        return sum + (row?.byType?.[questionType]?.score ?? 0);
      }, 0),
    ]),
  );

  return {
    questionTypes,
    rows: objectives.map((objective) => rowByObjectiveId.get(objective.objectiveId)),
    typeTotals,
    grandTotal: Object.values(typeTotals).reduce((sum, score) => sum + score, 0),
    notices: [...new Set(notices)],
  };
}

function buildReviewSheet({
  projectInfo,
  allocations,
  objectives,
  items,
  auditReport,
  itemIdToDisplayNumber,
  itemIdToReviewNumber,
}) {
  const format = getReviewFormat(projectInfo.subject);
  const science = buildScienceRows({
    objectives,
    items,
    itemIdToReviewNumber,
  });

  return {
    project: projectInfo,
    versionLabel: "114.05 版",
    format,
    chineseFallbackNotice:
      format === "chinese_fallback" ? CHINESE_FALLBACK_NOTICE : null,
    unitRows: buildUnitRows(allocations, objectives),
    scienceRows: science.rows,
    scienceQuestionTypes: science.questionTypes,
    scienceTypeTotals: science.typeTotals,
    scienceGrandTotal: science.grandTotal,
    notices: science.notices,
    checklist: buildChecklist(auditReport),
    itemIdToDisplayNumber,
    itemIdToReviewNumber,
  };
}

export function buildPrintData({ project, allocations = [], objectives = [], items = [], auditReport } = {}) {
  const projectInfo = createProjectInfo(project);
  const scoreTable = buildScoreTable(projectInfo, allocations);
  const studentPaper = buildPaper(projectInfo, items);
  const teacherPaper = {
    ...buildPaper(projectInfo, items),
    showTeacherAnnotations: true,
  };
  const reviewSheet = buildReviewSheet({
    projectInfo,
    allocations,
    objectives,
    items,
    auditReport,
    itemIdToDisplayNumber: teacherPaper.itemIdToDisplayNumber,
    itemIdToReviewNumber: teacherPaper.itemIdToReviewNumber,
  });

  return {
    scoreTable,
    studentPaper,
    teacherPaper,
    reviewSheet,
  };
}

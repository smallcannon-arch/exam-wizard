const QUESTION_TYPE_ORDER = ["選擇題", "填充題", "勾選題", "應用題", "畫圖題", "其他", "題組"];
const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

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

function createProjectInfo(project = {}) {
  return {
    schoolName: "新竹市內湖國民小學",
    schoolYear: project.schoolYear ?? "",
    semester: project.semester ?? "",
    examNumber: project.examNumber ?? "",
    grade: project.grade ?? "",
    subject: project.subject ?? "",
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

function assignNonGroupItems({ items, itemIdToDisplayNumber, sections }) {
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
        }
      });
      sections.push(section);
    });
}

function assignGroupItems({ items, itemIdToDisplayNumber, sections }) {
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

  assignNonGroupItems({ items, itemIdToDisplayNumber, sections });
  assignGroupItems({ items, itemIdToDisplayNumber, sections });

  return {
    project: projectInfo,
    sections,
    itemIdToDisplayNumber,
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

function buildReviewSheet({ projectInfo, allocations, objectives, auditReport, itemIdToDisplayNumber }) {
  return {
    project: projectInfo,
    versionLabel: "114.05 版",
    unitRows: buildUnitRows(allocations, objectives),
    checklist: buildChecklist(auditReport),
    itemIdToDisplayNumber,
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
    auditReport,
    itemIdToDisplayNumber: teacherPaper.itemIdToDisplayNumber,
  });

  return {
    scoreTable,
    studentPaper,
    teacherPaper,
    reviewSheet,
  };
}

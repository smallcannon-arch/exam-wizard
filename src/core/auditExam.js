import { auditCoverage } from "./auditCoverage.js";
import { auditScores } from "./auditScores.js";
import { auditTime } from "./auditTime.js";
import { auditQuality } from "./auditQuality.js";
import { auditChinese } from "./auditChinese.js";

const SEVERITY_ORDER = {
  pass: 0,
  warning: 1,
  error: 2,
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getSeverity(section) {
  return section?.severity ?? "error";
}

function maxSeverity(severities) {
  return severities.reduce(
    (current, next) =>
      SEVERITY_ORDER[next] > SEVERITY_ORDER[current] ? next : current,
    "pass",
  );
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTaipeiIsoString(date) {
  const taipeiTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  return [
    `${taipeiTime.getUTCFullYear()}-${pad(taipeiTime.getUTCMonth() + 1)}-${pad(taipeiTime.getUTCDate())}`,
    `T${pad(taipeiTime.getUTCHours())}:${pad(taipeiTime.getUTCMinutes())}:${pad(taipeiTime.getUTCSeconds())}+08:00`,
  ].join("");
}

function getReportTime(options) {
  if (options.now instanceof Date && !Number.isNaN(options.now.getTime())) {
    return options.now;
  }

  return new Date();
}

function createObjectiveAlignmentSuggestion(coverage, scores) {
  const suggested = coverage.severity === "pass" && scores.severity === "pass";
  const reason = suggested
    ? `覆蓋率 ${Math.round(coverage.coverageRate * 100)}%，各單元配分與節數比例計算之建議配分完全一致。`
    : `學習目標覆蓋檢核為 ${coverage.severity}，配分檢核為 ${scores.severity}，請先修正未通過項目。`;

  return {
    key: "objective_alignment",
    label: "扣緊教學目標（或學習目標）與合於節數比例之配分",
    suggested,
    reason,
  };
}

function createDiscriminationSuggestion(quality) {
  const suggested = quality.severity === "pass";
  const reason = suggested
    ? "所有題目的預估鑑別度與必要品質欄位皆通過系統檢核。"
    : `題目品質檢核為 ${quality.severity}，請依逐題檢核結果修正後再勾選。`;

  return {
    key: "discrimination",
    label: "預估試題鑑別度指數在 20 以上",
    suggested,
    reason,
  };
}

function createDurationSuggestion(time) {
  const suggested = time.severity === "pass";
  const reason = suggested
    ? `預估應試時間 ${time.estimatedMinutes} 分鐘，符合 40 至 60 分鐘規定。`
    : `預估應試時間檢核為 ${time.severity}：${time.message}`;

  return {
    key: "duration",
    label: "預估應試時間為每份卷 40 至 60 分鐘之間",
    suggested,
    reason,
  };
}

function createChecklistSuggestions(sections) {
  return [
    createObjectiveAlignmentSuggestion(sections.coverage, sections.scores),
    {
      key: "self_authored",
      label: "教師自行命題，未直接使用教科書廠商提供之試題",
      suggested: null,
      reason: "此項無法由系統判定，請命題教師自行確認。",
    },
    createDiscriminationSuggestion(sections.quality),
    createDurationSuggestion(sections.time),
    {
      key: "appropriateness",
      label: "內容符合學生能力與真實情境，無爭議性、悖於常理或違背法規",
      suggested: null,
      reason: "此項需人工審閱，系統僅檢查格式。",
    },
    {
      key: "confidentiality",
      label: "遵守迴避原則與保密原則",
      suggested: null,
      reason: "此項需人工確認。",
    },
  ];
}

function createSummary({ overallSeverity, sections }) {
  const summary = [
    `整體審題結果為 ${overallSeverity}。`,
    `學習目標覆蓋檢核為 ${sections.coverage.severity}，覆蓋率 ${Math.round(sections.coverage.coverageRate * 100)}%。`,
    `配分比例檢核為 ${sections.scores.severity}，全卷總分 ${sections.scores.totalScoreActual}/${sections.scores.totalScoreExpected}。`,
    `應試時間檢核為 ${sections.time.severity}，預估 ${sections.time.estimatedMinutes} 分鐘。`,
    `題目品質檢核為 ${sections.quality.severity}。`,
  ];

  if (sections.chinese) {
    summary.push(`國語科評量向度比例檢核為 ${sections.chinese.severity}。`);
  }

  return summary;
}

export function auditExam(input) {
  const source = isPlainObject(input) ? input : {};
  const {
    project = {},
    allocations,
    objectives,
    items,
  } = source;
  const options = isPlainObject(source.options) ? source.options : {};
  const projectTotalScore =
    isPlainObject(project) && typeof project.totalScore === "number"
      ? project.totalScore
      : 100;
  const coverage = auditCoverage({ objectives, items });
  const scores = auditScores({
    allocations,
    objectives,
    items,
    options: {
      totalScore: projectTotalScore,
      ...(isPlainObject(options.scores) ? options.scores : {}),
    },
  });
  const time = auditTime({
    items,
    options: isPlainObject(options.time) ? options.time : {},
  });
  const quality = auditQuality({
    items,
    options: isPlainObject(options.quality) ? options.quality : {},
  });
  const chinese =
    isPlainObject(project) && project.subject === "國語"
      ? auditChinese({
          grade: project.grade,
          items,
          options: isPlainObject(options.chinese) ? options.chinese : {},
        })
      : null;
  const sections = {
    coverage,
    scores,
    time,
    quality,
    chinese,
  };
  const sectionSeverities = [
    getSeverity(coverage),
    getSeverity(scores),
    getSeverity(time),
    getSeverity(quality),
  ];

  if (chinese) {
    sectionSeverities.push(getSeverity(chinese));
  }

  const overallSeverity = maxSeverity(sectionSeverities);

  return {
    generatedAt: formatTaipeiIsoString(getReportTime(options)),
    project,
    overallSeverity,
    sections,
    checklistSuggestions: createChecklistSuggestions(sections),
    summary: createSummary({ overallSeverity, sections }),
  };
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditExam } from "../src/core/auditExam.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const scienceProject = JSON.parse(
  readFileSync(join(fixtureDir, "science-project-full.json"), "utf8"),
);
const fixedNow = new Date("2026-06-13T10:00:00+08:00");

function runAudit(overrides = {}) {
  return auditExam({
    ...scienceProject,
    ...overrides,
    options: {
      now: fixedNow,
      ...(overrides.options ?? {}),
    },
  });
}

function suggestedByKey(report, key) {
  return report.checklistSuggestions.find((entry) => entry.key === key)
    .suggested;
}

function withChineseDimensions(items) {
  const dimensionsByItemId = {
    "A-01": "word_phrase",
    "A-02": "sentence_grammar",
    "B-01": "sentence_grammar",
    "B-02": "reading_writing",
    "B-03": "reading_writing",
    "C-01": "reading_writing",
  };

  return items.map((item) => ({
    ...item,
    chineseDimension: dimensionsByItemId[item.itemId],
  }));
}

describe("auditExam", () => {
  it("自然科全數通過時回傳 pass，國語 section 為 null，系統可判定三項為 true", () => {
    const result = runAudit();

    expect(result.generatedAt).toBe("2026-06-13T10:00:00+08:00");
    expect(result.project).toEqual(scienceProject.project);
    expect(result.overallSeverity).toBe("pass");
    expect(result.sections.chinese).toBeNull();
    expect(suggestedByKey(result, "objective_alignment")).toBe(true);
    expect(suggestedByKey(result, "discrimination")).toBe(true);
    expect(suggestedByKey(result, "duration")).toBe(true);
    expect(suggestedByKey(result, "self_authored")).toBeNull();
    expect(suggestedByKey(result, "appropriateness")).toBeNull();
    expect(suggestedByKey(result, "confidentiality")).toBeNull();
  });

  it("覆蓋率 error 時，整體 severity 為 error", () => {
    const items = scienceProject.items.map((item) =>
      item.itemId === "C-01"
        ? { ...item, objectiveIds: ["1-3-2"] }
        : item,
    );
    const result = runAudit({ items });

    expect(result.sections.coverage.severity).toBe("error");
    expect(result.sections.coverage.missingObjectiveIds).toEqual(["1-3-3"]);
    expect(result.overallSeverity).toBe("error");
  });

  it("時間 warning 且其餘 pass 時，整體 severity 為 warning", () => {
    const result = runAudit({
      options: {
        now: fixedNow,
        time: { minMinutes: 50, maxMinutes: 60 },
      },
    });

    expect(result.sections.coverage.severity).toBe("pass");
    expect(result.sections.scores.severity).toBe("pass");
    expect(result.sections.quality.severity).toBe("pass");
    expect(result.sections.time.severity).toBe("warning");
    expect(result.overallSeverity).toBe("warning");
  });

  it("subject 為國語時，chinese section 有內容", () => {
    const result = runAudit({
      project: {
        ...scienceProject.project,
        subject: "國語",
      },
      items: withChineseDimensions(scienceProject.items),
    });

    expect(result.sections.chinese).not.toBeNull();
    expect(result.sections.chinese.band).toBe("high");
    expect(result.sections.chinese.severity).toBe("pass");
  });

  it("傳入 options.now 時 generatedAt 為固定值", () => {
    const result = runAudit();

    expect(result.generatedAt).toBe("2026-06-13T10:00:00+08:00");
  });
});

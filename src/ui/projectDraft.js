export const VERSION_OPTIONS = ["翰林", "康軒", "南一", "自編教材", "其他"];

export function createDefaultProjectDraft() {
  return {
    schoolYear: "114",
    semester: "1",
    examNumber: "1",
    grade: "",
    subject: "",
    version: "",
    versionOther: "",
    publisher: "",
    publisherOther: "",
    scope: "",
    teacher: "",
  };
}

export function validateProjectDraftData(projectDraft = {}) {
  const errors = {};
  const requiredFields = [
    ["schoolYear", "請填寫學年度。"],
    ["semester", "請選擇學期。"],
    ["examNumber", "請選擇第幾次定期評量。"],
    ["grade", "請選擇年級。"],
    ["subject", "請選擇領域。"],
    ["version", "請選擇版本。"],
    ["scope", "請填寫考試範圍。"],
  ];

  requiredFields.forEach(([field, message]) => {
    if (!String(projectDraft[field] ?? "").trim()) {
      errors[field] = message;
    }
  });

  if (projectDraft.version === "其他" && !String(projectDraft.versionOther ?? "").trim()) {
    errors.versionOther = "請輸入版本名稱。";
  }

  return errors;
}

export function normalizeProjectDraftData(projectDraft = {}) {
  const version =
    projectDraft.version === "其他"
      ? String(projectDraft.versionOther ?? "").trim()
      : String(projectDraft.version ?? "").trim();

  return {
    schoolYear: Number(projectDraft.schoolYear),
    semester: Number(projectDraft.semester),
    examNumber: Number(projectDraft.examNumber),
    grade: Number(projectDraft.grade),
    subject: String(projectDraft.subject ?? ""),
    version,
    versionChoice: String(projectDraft.version ?? ""),
    versionOther:
      projectDraft.version === "其他"
        ? String(projectDraft.versionOther ?? "").trim()
        : "",
    publisher: version,
    publisherOther:
      projectDraft.version === "其他"
        ? String(projectDraft.versionOther ?? "").trim()
        : "",
    scope: String(projectDraft.scope ?? "").trim(),
    teacher: String(projectDraft.teacher ?? "").trim(),
    totalScore: 100,
  };
}

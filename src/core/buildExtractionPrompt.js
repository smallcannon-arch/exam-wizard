function hasText(value) {
  return typeof value === "string"
    ? value.trim() !== ""
    : value !== null && value !== undefined && String(value).trim() !== "";
}

function getGradeLabel(grade) {
  const gradeNumber = Number(grade);

  return Number.isInteger(gradeNumber) && gradeNumber >= 1 && gradeNumber <= 6
    ? `${gradeNumber}年級`
    : `${grade}年級`;
}

export const OBJECTIVE_EXTRACTION_RULES = [
  "請擷取標題為『學習目標』之段落內容；若檔案無此標題，依序改用『教學目標』『單元目標』段落，並於回覆末註明實際擷取之段落名稱。",
  "**不得**將『核心素養』『學習表現』『學習內容』『議題融入』之代碼（如 pc-III-2、INc-III-14、自-E-A1）或文字當作學習目標擷取。",
  "學習目標文字必須照教案原文擷取，不得改寫、增刪或自行歸納。",
  "目標編號一律依『小單元編號-流水號』格式編成：取小單元名稱開頭的編號（如『4-2 動物的生存之道』取 4-2），同一小單元內的目標依出現順序編為 4-2-1、4-2-2。小單元名稱無編號時，以單元順序自編（第一單元第一課為 1-1）。**不得**使用教案中的連續流水號（如 17、18、19）作為目標編號；教案若有原始編號，請於回覆末以『註：』列出新舊編號對照。",
  "若教案僅提供單元總節數而未逐目標標示，請將總節數平均分配至該單元各目標（可用小數），並於回覆末註明此為平均分配，需由教師人工核對修正。",
  "找不到的欄位請留空，不得編造內容。",
  "回覆末的『註：』需說明：學習目標擷取自檔案的哪個段落（段落標題與頁次），以利教師回查原文核對。",
];

export const OBJECTIVE_EXTRACTION_OUTPUT_FORMAT =
  "請只輸出資料列，每列一個學習目標，五個欄位依上述順序以 Tab 字元分隔；不要輸出表頭、編號清單、Markdown 表格或任何說明文字。授課節數欄只填數字（如 1 或 0.5），不要加『節』等單位文字，也不要使用中文數字。註明事項請寫在所有資料列之後，以『註：』開頭。";

export function buildObjectiveExtractionPrompt({ project } = {}) {
  const errors = [];

  if (!hasText(project?.grade)) {
    errors.push("project.grade（年級）為必填。");
  }

  if (!hasText(project?.subject)) {
    errors.push("project.subject（領域）為必填。");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const gradeLabel = getGradeLabel(project.grade);
  const subject = String(project.subject).trim();
  const scope = hasText(project.scope)
    ? `\n本次考試範圍：${String(project.scope).trim()}`
    : "";
  const publisher = hasText(project.publisher)
    ? `\n教材版本：${String(project.publisher).trim()}`
    : "";

  const prompt = [
    "## 角色與任務",
    `你是國小${gradeLabel}${subject}教材分析助手。請閱讀我上傳的教案或課本檔案，擷取本次考試範圍內的學習目標。${publisher}${scope}`,
    "",
    "## 擷取欄位說明",
    "請擷取以下五個欄位：目標編號、大單元名稱、小單元（課）名稱、學習目標文字、授課節數。",
    "",
    "## 擷取規則",
    ...OBJECTIVE_EXTRACTION_RULES,
    "",
    "## 輸出格式",
    OBJECTIVE_EXTRACTION_OUTPUT_FORMAT,
  ].join("\n");

  return {
    ok: true,
    prompt,
  };
}

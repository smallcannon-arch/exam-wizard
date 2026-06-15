import { allocateScores } from "../core/allocateScores.js";
import { auditExam } from "../core/auditExam.js";
import { buildObjectiveExtractionPrompt } from "../core/buildExtractionPrompt.js";
import { buildItemGenerationPrompt, parseItemsJson } from "../core/buildPrompt.js";
import { validateObjective } from "../core/schemas.js";
import { isApiAvailable } from "./apiConfig.js";
import {
  extractObjectivesFromFiles,
  extractObjectivesViaApi,
  generateGroupViaApi,
  generateItemsViaApi,
  planSectionsViaApi,
  suggestTypesViaApi,
} from "./apiClient.js";
import { buildPrintData } from "./buildPrintData.js";
import { replaceFieldLabels } from "./fieldLabels.js";
import { mergeItemBatches, planItemBatches } from "./generateItemsBatched.js";
import { groupItemsByGroup } from "./groupItemsByGroup.js";
import { groupObjectivesToUnits } from "./groupObjectivesToUnits.js";
import { distributeIntegerScores } from "./distributeIntegerScores.js";
import { parseObjectivesTsv } from "./parseObjectivesTsv.js";
import {
  buildSectionPlanRequest,
  convertPlanSectionsToStateSections,
} from "./planSections.js";
import {
  VERSION_OPTIONS,
  createDefaultProjectDraft,
  normalizeProjectDraftData,
  validateProjectDraftData,
} from "./projectDraft.js";
import {
  formatFileSize,
  readFileAsDataUrl,
  stripBase64DataUrl,
  validateExtractionFiles,
} from "./fileUpload.js";
import { renumberObjectives } from "./renumberObjectives.js";
import {
  applyCandidateSelection,
  summarizeCandidateSelection,
} from "./selectItemsFromCandidates.js";
import { summarizeBlueprint } from "./summarizeBlueprint.js";
import {
  buildBlueprintFromSections,
  summarizeSections,
} from "./summarizeSections.js";
import { getCanonicalSubjectLabel, isChineseSubject } from "./subjects.js";
import {
  buildDefaultObjectiveAllocations,
  legalQuestionCounts,
  validateAllocations,
} from "./validateAllocations.js";
import {
  normalizeItemsForAudit,
  validateItemForUi,
} from "./validateItemsForUi.js";
import {
  applyAction,
  createInitialState,
  deserializeState,
  serializeState,
} from "./state.js";
import { canEnterStep } from "./guards.js";
import {
  STEP_NUMERALS,
  getStepByNumber,
  renderPlaceholderStep,
  renderProgress,
  renderStepHelp,
} from "./render/steps.js";

const STORAGE_KEY = "exam-wizard-draft";
const QUESTION_TYPES = ["選擇題", "填充題", "應用題", "勾選題", "畫圖題", "其他"];
const SECTION_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const CHINESE_DIMENSION_OPTIONS = [
  ["", "請選擇"],
  ["word_phrase", "字詞短語"],
  ["sentence_grammar", "句式語法"],
  ["reading_writing", "段篇讀寫"],
];
const appRoot = document.querySelector("[data-app]");
const defaultProjectDraft = createDefaultProjectDraft();

let state = createInitialState();
let notice = "";
let pendingDraft = null;
let projectDraft = { ...defaultProjectDraft };
let projectErrors = {};
let showObjectiveErrors = false;
let pastePanelOpen = false;
let aiExtractionPanelOpen = false;
let tsvText = "";
let tsvErrors = [];
let tsvNotices = [];
let extractionMaterialText = "";
let extractionApiError = "";
let extractionSelectedFiles = [];
let extractionFileError = "";
let objectiveImportSuccess = "";
let renumberDialogOpen = false;
let renumberSuccess = "";
let renumberNotices = [];
let renumberMappingRows = [];
let allocationErrors = [];
let showBlueprintErrors = false;
let typeSuggestionError = "";
let typeSuggestionSuccess = "";
let typeSuggestionProgress = "";
let sectionPlanPreferences = {
  sectionCountHint: "",
  includeGroup: false,
  groupCountHint: "",
  preferredTypes: [],
  note: "",
};
let sectionPlanError = "";
let sectionPlanSuccess = "";
let sectionPlanProgress = "";
let copyStatus = "";
let extractionCopyStatus = "";
let generationApiError = "";
let generationApiSuccess = "";
let generationApiProgress = "";
let itemsJsonText = "";
let itemImportMessage = "";
let itemImportErrors = [];
let editingItemIndex = null;
let itemEditErrors = [];
let activePrintView = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatUserFacingError(message) {
  return replaceFieldLabels(message);
}

function formatUpdatedAt(value) {
  if (!value) {
    return "未記錄";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-TW", {
    hour12: false,
  });
}

function syncProjectDraftFromState() {
  const project = state.project ?? {};
  const savedVersion = project.version ?? project.publisher ?? "";
  const isKnownVersion = VERSION_OPTIONS.includes(savedVersion);

  projectDraft = {
    ...defaultProjectDraft,
    ...project,
    schoolYear: String(project.schoolYear ?? defaultProjectDraft.schoolYear),
    semester: String(project.semester ?? defaultProjectDraft.semester),
    examNumber: String(project.examNumber ?? defaultProjectDraft.examNumber),
    grade: project.grade ? String(project.grade) : "",
    version:
      savedVersion === ""
        ? defaultProjectDraft.version
        : isKnownVersion
          ? savedVersion
          : "其他",
    versionOther:
      savedVersion !== "" && !isKnownVersion
        ? savedVersion
        : (project.versionOther ?? project.publisherOther ?? ""),
  };
}

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return;
    }

    const result = deserializeState(saved);

    if (result.warning) {
      notice = result.warning;
      return;
    }

    if (result.state.updatedAt) {
      pendingDraft = result.state;
    }
  } catch {
    notice = "無法讀取瀏覽器暫存資料。";
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    notice = "無法寫入瀏覽器暫存資料，請確認瀏覽器儲存空間設定。";
  }
}

function applyAndSave(action) {
  state = applyAction(state, {
    ...action,
    updatedAt: new Date().toISOString(),
  });
  saveState();
}

function dispatch(action) {
  const shouldScroll = action?.type === "GO_TO_STEP";
  applyAndSave(action);
  render();
  if (shouldScroll) {
    scrollToCurrentStepTop();
  }
}

function dispatchMany(actions) {
  const shouldScroll = actions.some((action) => action?.type === "GO_TO_STEP");
  actions.forEach((action) => applyAndSave(action));
  render();
  if (shouldScroll) {
    scrollToCurrentStepTop();
  }
}

function scrollToCurrentStepTop() {
  window.requestAnimationFrame(() => {
    const target = appRoot.querySelector(".step-panel") ?? appRoot;
    target.scrollIntoView({ block: "start" });
  });
}

function setApiBusy(apiBusy) {
  state = applyAction(state, {
    type: "SET_API_BUSY",
    payload: apiBusy,
    updatedAt: new Date().toISOString(),
  });
  saveState();
}

function markPromptGenerated() {
  state = applyAction(state, {
    type: "SET_PROMPT_GENERATED_AT",
    payload: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveState();
}

function clearDraftAndReload() {
  const firstConfirm = window.confirm("確定要清除本機暫存資料嗎？");

  if (!firstConfirm) {
    return;
  }

  const secondConfirm = window.confirm("清除後無法復原，請再次確認。");

  if (!secondConfirm) {
    return;
  }

  localStorage.clear();
  window.location.reload();
}

function renderDraftPanel() {
  if (!pendingDraft) {
    return "";
  }

  return `
    <section class="draft-panel" aria-label="草稿續編">
      <strong>偵測到上次未完成的試卷草稿（最後編輯：${formatUpdatedAt(pendingDraft.updatedAt)}），是否續編？</strong>
      <div class="draft-panel__actions">
        <button class="button" type="button" data-action="resume-draft">續編</button>
        <button class="button button--secondary" type="button" data-action="discard-draft">捨棄</button>
      </div>
    </section>
  `;
}

function renderNotice() {
  if (!notice) {
    return "";
  }

  return `<div class="notice" role="status">${escapeHtml(notice)}</div>`;
}

function renderFieldError(fieldName) {
  if (!projectErrors[fieldName]) {
    return "";
  }

  return `<p class="field-error">${escapeHtml(projectErrors[fieldName])}</p>`;
}

function isSelected(value, expected) {
  return value === expected ? "selected" : "";
}

function renderProjectForm() {
  const isChinese = isChineseSubject(projectDraft.subject);
  const isOtherVersion = projectDraft.version === "其他";

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">①建立試卷</h2>
      <form class="form-grid" data-form="project" novalidate>
        <label>
          <span>學年度＊</span>
          <input name="schoolYear" data-project-field value="${escapeHtml(projectDraft.schoolYear)}" inputmode="numeric">
          ${renderFieldError("schoolYear")}
        </label>
        <label>
          <span>學期＊</span>
          <select name="semester" data-project-field>
            <option value="1" ${isSelected(projectDraft.semester, "1")}>1</option>
            <option value="2" ${isSelected(projectDraft.semester, "2")}>2</option>
          </select>
          ${renderFieldError("semester")}
        </label>
        <label>
          <span>第幾次＊</span>
          <select name="examNumber" data-project-field>
            <option value="1" ${isSelected(projectDraft.examNumber, "1")}>1</option>
            <option value="2" ${isSelected(projectDraft.examNumber, "2")}>2</option>
          </select>
          ${renderFieldError("examNumber")}
        </label>
        <label>
          <span>年級＊</span>
          <select name="grade" data-project-field>
            <option value="">請選擇</option>
            ${[1, 2, 3, 4, 5, 6].map((grade) => `<option value="${grade}" ${isSelected(projectDraft.grade, String(grade))}>${grade}</option>`).join("")}
          </select>
          ${renderFieldError("grade")}
        </label>
        <label>
          <span>領域＊</span>
          <select name="subject" data-project-field>
            <option value="">請選擇</option>
            ${["國語", "數學", "自然", "社會", "英語"].map((subject) => `<option value="${subject}" ${isSelected(projectDraft.subject, subject)}>${subject}</option>`).join("")}
          </select>
          ${renderFieldError("subject")}
        </label>
        <label>
          <span>版本＊</span>
          <select name="version" data-project-field>
            <option value="" ${isSelected(projectDraft.version, "")}>請選擇</option>
            ${VERSION_OPTIONS.map((version) => `<option value="${version}" ${isSelected(projectDraft.version, version)}>${version}</option>`).join("")}
          </select>
          ${renderFieldError("version")}
        </label>
        <label class="${isOtherVersion ? "" : "is-hidden"}">
          <span>請輸入版本名稱＊</span>
          <input name="versionOther" data-project-field value="${escapeHtml(projectDraft.versionOther)}">
          ${renderFieldError("versionOther")}
        </label>
        <label class="form-grid__wide">
          <span>考試範圍＊</span>
          <textarea name="scope" data-project-field rows="3" placeholder="例：第一單元到第四單元">${escapeHtml(projectDraft.scope)}</textarea>
          ${renderFieldError("scope")}
        </label>
        <label class="form-grid__wide">
          <span>命題教師</span>
          <input name="teacher" data-project-field value="${escapeHtml(projectDraft.teacher)}">
        </label>
        ${isChinese ? `<div class="info-box form-grid__wide">國語科採評量向度檢核（許育健教授架構），配分依向度比例而非授課節數，後續步驟將以向度模式進行。</div>` : ""}
        <div class="step-actions form-grid__wide">
          <button class="button" type="submit">下一步</button>
        </div>
      </form>
    </section>
  `;
}

function createBlankObjective() {
  return {
    objectiveId: "",
    unitName: "",
    lessonName: "",
    text: "",
    periodCount: "",
  };
}

function isBlankObjective(objective) {
  return ["objectiveId", "unitName", "lessonName", "text", "periodCount"].every(
    (field) => String(objective?.[field] ?? "").trim() === "",
  );
}

function objectiveForValidation(objective) {
  return {
    ...objective,
    periodCount:
      typeof objective.periodCount === "number"
        ? objective.periodCount
        : Number(objective.periodCount),
  };
}

function getObjectiveRows() {
  return state.objectives.length > 0 ? state.objectives : [createBlankObjective()];
}

function renderObjectiveErrors(objective) {
  if (!showObjectiveErrors || isBlankObjective(objective)) {
    return "";
  }

  const result = validateObjective(objectiveForValidation(objective));

  if (result.valid) {
    return "";
  }

  return `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>`;
}

function renderRenumberFeedback() {
  const noticesHtml =
    renumberNotices.length > 0
      ? `<div class="notice notice--inline"><strong>重新編號提醒</strong><ul>${renumberNotices.map((noticeItem) => `<li>${escapeHtml(noticeItem)}</li>`).join("")}</ul></div>`
      : "";
  const mappingHtml =
    renumberMappingRows.length > 0
      ? `
        <details class="mapping-details">
          <summary>查看舊新編號對照</summary>
          <div class="table-scroll">
            <table class="data-table data-table--compact">
              <thead>
                <tr>
                  <th>舊編號</th>
                  <th>新編號</th>
                </tr>
              </thead>
              <tbody>
                ${renumberMappingRows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.oldId)}</td>
                    <td>${escapeHtml(row.newId)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </details>
      `
      : "";

  return `
    ${renumberSuccess ? `<div class="success-notice">${escapeHtml(renumberSuccess)}</div>` : ""}
    ${noticesHtml}
    ${mappingHtml}
  `;
}

function renderObjectiveImportNotices() {
  if (tsvNotices.length === 0) {
    return "";
  }

  return `
    <div class="notice notice--inline">
      <strong>AI 註記</strong>
      <ul>
        ${tsvNotices.map((noticeItem) => `<li>${escapeHtml(noticeItem)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderRenumberDialog() {
  if (!renumberDialogOpen) {
    return "";
  }

  return `
    <dialog class="modal-dialog" data-renumber-dialog aria-labelledby="renumber-objectives-title">
      <header class="modal-dialog__header">
        <h3 id="renumber-objectives-title">依小單元自動重新編號</h3>
        <button class="icon-button" type="button" data-action="close-renumber-dialog" aria-label="關閉">✕</button>
      </header>
      <div class="modal-dialog__body">
        <p>將依小單元編號重編所有目標編號（例：4-2 的第 1 條 → 4-2-1）。已規劃的藍圖與題庫會同步更新編號。是否繼續？</p>
        <div class="step-actions">
          <button class="button button--secondary" type="button" data-action="close-renumber-dialog">取消</button>
          <button class="button" type="button" data-action="confirm-renumber-objectives">繼續重新編號</button>
        </div>
      </div>
    </dialog>
  `;
}

function renderObjectivesStep() {
  const rows = getObjectiveRows();

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">②匯入學習目標</h2>
      <div class="toolbar">
        <button class="button" type="button" data-action="add-objective-row">新增列</button>
        <button class="button button--secondary" type="button" data-action="open-objective-dialog" data-dialog="paste">貼上匯入</button>
        <button class="button button--secondary" type="button" data-action="open-objective-dialog" data-dialog="ai-extraction">AI 擷取（從教案／課本）</button>
        <button class="button button--secondary" type="button" data-action="open-renumber-dialog">依小單元自動重新編號</button>
      </div>
      ${aiExtractionPanelOpen ? renderAiExtractionPanel() : ""}
      ${pastePanelOpen ? renderPastePanel() : ""}
      ${renderRenumberDialog()}
      ${objectiveImportSuccess ? `<div class="success-notice">${escapeHtml(objectiveImportSuccess)}</div>` : ""}
      ${renderObjectiveImportNotices()}
      ${renderRenumberFeedback()}
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>目標編號</th>
              <th>大單元名稱</th>
              <th>小單元（課）名稱</th>
              <th>學習目標文字</th>
              <th>授課節數</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((objective, index) => `
              <tr data-objective-row="${index}">
                <td><input data-objective-field="objectiveId" value="${escapeHtml(objective.objectiveId)}"></td>
                <td><input data-objective-field="unitName" value="${escapeHtml(objective.unitName)}"></td>
                <td><input data-objective-field="lessonName" value="${escapeHtml(objective.lessonName)}"></td>
                <td><textarea data-objective-field="text" rows="2">${escapeHtml(objective.text)}</textarea></td>
                <td><input data-objective-field="periodCount" type="number" min="0" step="0.5" value="${escapeHtml(objective.periodCount)}"></td>
                <td><button class="button button--secondary" type="button" data-action="delete-objective-row" data-row="${index}">刪除</button></td>
              </tr>
              ${renderObjectiveErrors(objective) ? `<tr><td colspan="6">${renderObjectiveErrors(objective)}</td></tr>` : ""}
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="1">上一步</button>
        <button class="button" type="button" data-action="objectives-next">下一步</button>
      </div>
    </section>
  `;
}

function getExtractionPromptResult() {
  const result = buildObjectiveExtractionPrompt({
    project: state.project ?? {},
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    prompt: [
      result.prompt,
      "",
      "補充提醒：可在 Claude / Gemini 等 AI 直接上傳課本或教案 PDF，貼上本指令擷取學習目標。",
      "學習目標文字請照課本／教案原文逐字擷取，不得改寫、潤飾或自行歸納。",
    ].join("\n"),
  };
}

function renderAiExtractionPanelLegacy() {
  const result = getExtractionPromptResult();

  return `
    <dialog class="modal-dialog ai-extraction-panel" data-objective-dialog="ai-extraction" aria-labelledby="ai-extraction-title">
      <header class="modal-dialog__header">
        <h3 id="ai-extraction-title">AI 擷取（從教案／課本）</h3>
        <button class="icon-button" type="button" data-action="close-objective-dialog" aria-label="關閉">✕</button>
      </header>
      <div class="modal-dialog__body">
      <ol class="instruction-list">
        <li>複製下方指令。</li>
        <li>開啟 Claude 或 Gemini，上傳教案 PDF 並貼上指令。</li>
        <li>將 AI 回覆整段貼回左側「貼上匯入」框。</li>
      </ol>
      ${result.ok ? `
        <div class="prompt-toolbar">
          <button class="button" type="button" data-action="copy-extraction-prompt">複製指令</button>
          <span class="copy-status" data-extraction-copy-status>${escapeHtml(extractionCopyStatus)}</span>
        </div>
        <pre class="prompt-output" data-extraction-prompt-output tabindex="0">${escapeHtml(result.prompt)}</pre>
      ` : `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
      <p class="notice notice--inline">AI 擷取結果僅為草稿，匯入後請逐筆核對目標文字與節數，特別是標註「平均分配」的節數。</p>
      </div>
    </dialog>
  `;
}

function renderAiExtractionPanel() {
  const result = getExtractionPromptResult();
  const apiAvailable = isApiAvailable();
  const apiBusy = state.apiBusy === true;
  const totalFileBytes = extractionSelectedFiles.reduce(
    (sum, file) => sum + (Number(file.size) || 0),
    0,
  );
  const fileValidation = extractionSelectedFiles.length > 0
    ? validateExtractionFiles(extractionSelectedFiles)
    : null;
  const fileStatus = extractionFileError ||
    (fileValidation?.ok === false
      ? fileValidation.error
      : extractionSelectedFiles.length > 0
        ? `已選 ${extractionSelectedFiles.length} 個檔案，總大小 ${formatFileSize(totalFileBytes)}。`
        : "尚未選擇檔案");
  const fileListHtml =
    extractionSelectedFiles.length > 0
      ? `
        <ul class="file-list" aria-label="已選檔案">
          ${extractionSelectedFiles.map((file, index) => `
            <li>
              <span>${escapeHtml(file.name || `檔案 ${index + 1}`)}（${escapeHtml(formatFileSize(file.size))}）</span>
              <button class="button button--secondary button--small" type="button" data-action="remove-extraction-file" data-file-index="${index}" ${apiBusy ? "disabled" : ""}>移除</button>
            </li>
          `).join("")}
        </ul>
      `
      : "";

  return `
    <dialog class="modal-dialog ai-extraction-panel" data-objective-dialog="ai-extraction" aria-labelledby="ai-extraction-title">
      <header class="modal-dialog__header">
        <h3 id="ai-extraction-title">AI 擷取學習目標</h3>
        <button class="icon-button" type="button" data-action="close-objective-dialog" aria-label="關閉">×</button>
      </header>
      <div class="modal-dialog__body">
        ${apiAvailable ? `
          <section class="api-mode-block">
            <h4>上傳檔案（預設）</h4>
            <p class="hint-text">可直接上傳課本或教案的 PDF，或拍照／截圖（JPG、PNG、WebP）。系統會讀取內容並擷取學習目標。結果僅為草稿，匯入後請逐筆核對。</p>
            <label class="file-drop-zone" data-extraction-file-drop>
              <span>選擇或拖放 PDF / JPG / PNG / WebP（可多選）</span>
              <input type="file" data-extraction-file multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">
            </label>
            ${fileListHtml}
            <p class="${fileValidation?.ok === false || extractionFileError ? "field-error" : "hint-text"}">
              ${escapeHtml(fileStatus)}
            </p>
            ${extractionApiError ? `<p class="field-error">${escapeHtml(extractionApiError)} 可改用下方其他方式。</p>` : ""}
            ${apiBusy ? `<p class="notice notice--inline">讀取檔案並擷取中，請稍候…</p>` : ""}
            <div class="step-actions">
              <button class="button" type="button" data-action="start-file-extraction" ${apiBusy ? "disabled" : ""}>開始擷取</button>
            </div>
          </section>
          <details class="manual-fallback">
            <summary>或：貼上純文字一鍵擷取（不支援 PDF）</summary>
            <p class="hint-text">這條路徑只適合貼入純文字教案或課文重點；若資料在 PDF 或圖片中，請使用上方檔案上傳。</p>
            <label>
              <span>教材文字</span>
              <textarea data-extraction-material-text rows="8" placeholder="可貼入教案中的學習目標段落、課文重點或教師整理摘要。">${escapeHtml(extractionMaterialText)}</textarea>
            </label>
            <div class="step-actions">
              <button class="button button--secondary" type="button" data-action="start-api-extraction" ${apiBusy ? "disabled" : ""}>用文字擷取</button>
            </div>
          </details>
        ` : `<p class="notice notice--inline">目前一鍵擷取未啟用，請使用下方手動貼回。</p>`}
        <details class="manual-fallback" ${apiAvailable ? "" : "open"}>
          <summary>或：手動貼回（備援）</summary>
          <p class="hint-text">可在 Claude / Gemini 等 AI 直接上傳課本或教案 PDF，貼上本指令擷取學習目標，再把 AI 回覆貼回本系統。</p>
          <ol class="instruction-list">
            <li>複製下方指令。</li>
            <li>開啟 Claude 或 Gemini，上傳教案 PDF 並貼上指令。</li>
            <li>將 AI 回覆整段貼回下方欄位，再按「匯入」。</li>
          </ol>
          ${result.ok ? `
            <div class="prompt-toolbar">
              <button class="button button--secondary" type="button" data-action="copy-extraction-prompt">複製指令</button>
              <span class="copy-status" data-extraction-copy-status>${escapeHtml(extractionCopyStatus)}</span>
            </div>
            <pre class="prompt-output" data-extraction-prompt-output tabindex="0">${escapeHtml(result.prompt)}</pre>
          ` : `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
          <label>
            <span>貼上 AI 回覆或試算表資料</span>
            <textarea data-tsv-input rows="6" placeholder="目標編號&#9;大單元名稱&#9;小單元（課）名稱&#9;學習目標&#9;授課節數">${escapeHtml(tsvText)}</textarea>
          </label>
          ${tsvErrors.length > 0 ? `<ul class="row-errors">${tsvErrors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>` : ""}
          ${tsvNotices.length > 0 ? `<div class="notice notice--inline"><strong>AI 註記</strong><ul>${tsvNotices.map((noticeItem) => `<li>${escapeHtml(noticeItem)}</li>`).join("")}</ul></div>` : ""}
          <p class="notice notice--inline">AI 擷取結果僅為草稿，匯入後請逐筆核對目標文字與節數，特別是標註「平均分配」的節數。</p>
          <div class="step-actions">
            <button class="button button--secondary" type="button" data-action="import-objectives">匯入貼回資料</button>
          </div>
        </details>
      </div>
    </dialog>
  `;
}

function renderPastePanel() {
  return `
    <dialog class="modal-dialog" data-objective-dialog="paste" aria-labelledby="paste-objectives-title">
      <header class="modal-dialog__header">
        <h3 id="paste-objectives-title">貼上匯入學習目標</h3>
        <button class="icon-button" type="button" data-action="close-objective-dialog" aria-label="關閉">✕</button>
      </header>
      <div class="modal-dialog__body">
      <label>
        <span>貼上 TSV 資料</span>
        <textarea data-tsv-input rows="6" placeholder="目標編號	大單元名稱	小單元名稱	學習目標文字	授課節數">${escapeHtml(tsvText)}</textarea>
      </label>
      ${tsvErrors.length > 0 ? `<ul class="row-errors">${tsvErrors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>` : ""}
      ${tsvNotices.length > 0 ? `<div class="notice notice--inline"><strong>AI 註明事項</strong><ul>${tsvNotices.map((noticeItem) => `<li>${escapeHtml(noticeItem)}</li>`).join("")}</ul></div>` : ""}
      <button class="button" type="button" data-action="import-objectives">匯入貼上資料</button>
      </div>
    </dialog>
  `;
}

function collectObjectivesFromDom() {
  return [...appRoot.querySelectorAll("[data-objective-row]")].map((row) => {
    const getValue = (field) => row.querySelector(`[data-objective-field="${field}"]`)?.value.trim() ?? "";

    return {
      objectiveId: getValue("objectiveId"),
      unitName: getValue("unitName"),
      lessonName: getValue("lessonName"),
      text: getValue("text"),
      periodCount: getValue("periodCount"),
    };
  });
}

function normalizeObjectives(objectives) {
  return objectives
    .filter((objective) => !isBlankObjective(objective))
    .map((objective) => ({
      ...objective,
      periodCount: Number(objective.periodCount),
    }));
}

function validateObjectivesForNext(objectives) {
  if (objectives.length === 0) {
    return ["至少需要 1 筆學習目標。"];
  }

  return objectives.flatMap((objective, index) =>
    validateObjective(objective).errors.map((error) => `第 ${index + 1} 筆 ${formatUserFacingError(error)}`),
  );
}

function getAllocationPlan(objectives) {
  const grouped = groupObjectivesToUnits(objectives);

  if (!grouped.ok) {
    return {
      ok: false,
      units: [],
      allocations: [],
      errors: grouped.errors,
    };
  }

  const allocated = allocateScores({
    totalScore: 100,
    units: grouped.units,
  });

  if (!allocated.ok) {
    return {
      ok: false,
      units: grouped.units,
      allocations: [],
      errors: allocated.errors,
    };
  }

  return {
    ok: true,
    units: grouped.units,
    allocations: allocated.allocations,
    errors: [],
  };
}

function getEffectiveObjectiveAllocations(objectives = state.objectives) {
  const existingByObjectiveId = new Map(
    state.objectiveAllocations.map((allocation) => [
      allocation.objectiveId,
      allocation,
    ]),
  );
  const defaults = buildDefaultObjectiveAllocations({
    objectives,
    totalScore: 100,
  });

  return defaults.map((allocation) => {
    const existing = existingByObjectiveId.get(allocation.objectiveId);

    return {
      ...allocation,
      actualScore:
        existing?.actualScore !== undefined
          ? existing.actualScore
          : allocation.actualScore,
    };
  });
}

function getObjectiveAllocationValidation(extraAllocations = null) {
  return validateAllocations({
    objectives: state.objectives,
    allocations: extraAllocations ?? getEffectiveObjectiveAllocations(),
    totalScore: 100,
  });
}

function getActualUnitAllocations() {
  const validation = getObjectiveAllocationValidation();
  const unitMap = new Map();

  state.objectives.forEach((objective) => {
    const row = validation.rows.find(
      (entry) => entry.objectiveId === objective.objectiveId,
    );
    const unitName = objective.unitName;
    const entry =
      unitMap.get(unitName) ??
      {
        id: unitName,
        name: unitName,
        periodCount: 0,
        suggestedScore: 0,
      };

    entry.periodCount += Number(objective.periodCount) || 0;
    entry.suggestedScore += Number(row?.actualScore) || 0;
    unitMap.set(unitName, entry);
  });

  return [...unitMap.values()];
}

function formatFormula(unit, allocation, totalPeriods) {
  const rawScore = 100 * (unit.periodCount / totalPeriods);

  return `${unit.periodCount} 節 ÷ ${totalPeriods} 節 × 100 ＝ ${rawScore.toFixed(1)} → ${allocation.suggestedScore} 分`;
}

function formatLegalQuestionCountHint(score) {
  const counts = legalQuestionCounts({ objectiveScore: score });

  if (counts.length === 0) {
    return "此配分目前沒有合法題數，請調整為正整數配分。";
  }

  return `每題≤3分下可出：${counts
    .map((count) => `${count} 題（每題 ${Number(score) / count} 分）`)
    .join("、")}`;
}

function renderAllocationsStep() {
  const plan = getAllocationPlan(state.objectives);
  const totalPeriods = plan.units.reduce((sum, unit) => sum + unit.periodCount, 0);
  const totalScore = plan.allocations.reduce(
    (sum, allocation) => sum + allocation.suggestedScore,
    0,
  );
  const objectiveAllocations = getEffectiveObjectiveAllocations();
  const objectiveValidation = validateAllocations({
    objectives: state.objectives,
    allocations: objectiveAllocations,
    totalScore: 100,
  });

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">③節數配分</h2>
      ${allocationErrors.length > 0 ? `<ul class="row-errors">${allocationErrors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>` : ""}
      <p class="notice notice--inline">系統仍依授課節數計算「建議配分」供參考；實際配分由教師調整，但全卷合計必須為 100 分。</p>
      ${plan.ok ? `
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>單元名稱</th>
                <th>節數</th>
                <th>計算式</th>
                <th>建議配分</th>
              </tr>
            </thead>
            <tbody>
              ${plan.allocations.map((allocation) => {
                const unit = plan.units.find((entry) => entry.name === allocation.name);

                return `
                  <tr>
                    <td>${escapeHtml(allocation.name)}</td>
                    <td>${allocation.periodCount}</td>
                    <td>${escapeHtml(formatFormula(unit, allocation, totalPeriods))}</td>
                    <td><output>${allocation.suggestedScore} 分</output></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <th>總計</th>
                <th>${totalPeriods} 節</th>
                <th></th>
                <th>${totalScore} 分</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <h3>目標實際配分</h3>
        <p class="${objectiveValidation.totalMatches ? "success-notice" : "field-error"}">
          全卷實際配分合計 ${formatPrintScore(objectiveValidation.totalActualScore)}／100 分。
        </p>
        <div class="table-scroll">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>目標編號</th>
                <th>授課節數</th>
                <th>建議配分</th>
                <th>實際配分</th>
                <th>提醒</th>
              </tr>
            </thead>
            <tbody>
              ${objectiveValidation.rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.objectiveId)}</td>
                  <td class="print-number">${escapeHtml(row.periodCount)}</td>
                  <td class="print-number">${escapeHtml(formatPrintScore(row.suggestedScore))}</td>
                  <td>
                    <input
                      class="score-input"
                      type="number"
                      min="1"
                      step="1"
                      data-objective-allocation
                      data-objective-id="${escapeHtml(row.objectiveId)}"
                      value="${escapeHtml(row.actualScore)}"
                    >
                  </td>
                  <td>
                    ${row.errors.length > 0 ? `<span class="text-error">${escapeHtml(row.errors.join(" "))}</span>` : ""}
                    ${row.warnings.length > 0 ? `<span class="text-warning">${escapeHtml(row.warnings.join(" "))}</span>` : ""}
                    <span class="hint-text">${escapeHtml(formatLegalQuestionCountHint(row.actualScore))}</span>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<ul class="row-errors">${plan.errors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>`}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="2">上一步</button>
        <button class="button" type="button" data-action="allocations-next" ${plan.ok && objectiveValidation.ok ? "" : "disabled"}>下一步</button>
      </div>
    </section>
  `;
}

function getBlueprintRows() {
  const existingByObjectiveId = new Map(
    state.blueprint.map((entry) => [entry.objectiveId, entry]),
  );

  return state.objectives.map((objective) => {
    const existing = existingByObjectiveId.get(objective.objectiveId);

    return {
      objectiveId: objective.objectiveId,
      unitName: objective.unitName,
      text: objective.text,
      questionTypes: Array.isArray(existing?.questionTypes)
        ? existing.questionTypes
        : [],
      plannedScore:
        existing?.plannedScore === undefined || existing?.plannedScore === null
          ? ""
          : existing.plannedScore,
      groupHint: typeof existing?.groupHint === "string" ? existing.groupHint : "",
      typeReason: typeof existing?.typeReason === "string" ? existing.typeReason : "",
    };
  });
}

function collectBlueprintFromDom() {
  return [...appRoot.querySelectorAll("[data-blueprint-row]")].map((row) => {
    const checkedTypes = [...row.querySelectorAll("[data-blueprint-type]:checked")]
      .map((input) => input.value);
    const plannedScore =
      row.querySelector("[data-blueprint-field='plannedScore']")?.value ?? "";
    const groupHint =
      row.querySelector("[data-blueprint-field='groupHint']")?.value.trim() ?? "";

    return {
      objectiveId: row.dataset.objectiveId,
      unitName: row.dataset.unitName,
      questionTypes: checkedTypes,
      plannedScore,
      groupHint,
      typeReason: row.dataset.typeReason ?? "",
    };
  });
}

function normalizeBlueprintForSubmit(rows) {
  return rows.map((row) => ({
    objectiveId: row.objectiveId,
    unitName: row.unitName,
    questionTypes: [...row.questionTypes],
    plannedScore: Number(row.plannedScore),
    groupHint: row.groupHint.trim(),
    typeReason: typeof row.typeReason === "string" ? row.typeReason : "",
  }));
}

function isValidPlannedScore(value) {
  return /^[1-9]\d?$/.test(String(value ?? "").trim());
}

function getBlueprintEntryIssues(row) {
  const issues = [];
  const plannedScore = Number(row.plannedScore);

  if (!Array.isArray(row.questionTypes) || row.questionTypes.length === 0) {
    issues.push("請至少勾選一種題型。");
  }

  if (!isValidPlannedScore(row.plannedScore)) {
    issues.push("本目標總配分需為 1～99 的正整數。");
  }

  return issues;
}

function renderQuestionTypeControls(row, rowIndex) {
  return `
    <div class="checkbox-group" role="group" aria-label="題型">
      ${QUESTION_TYPES.map((questionType) => `
        <label>
          <input
            type="checkbox"
            value="${escapeHtml(questionType)}"
            data-blueprint-type
            data-row="${rowIndex}"
            ${row.questionTypes.includes(questionType) ? "checked" : ""}
          >
          <span>${questionType}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function updateBlueprintInlineValidation() {
  [...appRoot.querySelectorAll("[data-blueprint-row]")].forEach((row) => {
    const scoreInput = row.querySelector("[data-blueprint-field='plannedScore']");
    const scoreInvalid = scoreInput && !isValidPlannedScore(scoreInput.value);
    const noQuestionType = row.querySelectorAll("[data-blueprint-type]:checked").length === 0;
    const invalid = scoreInvalid || noQuestionType;

    row.classList.toggle("blueprint-row--invalid", invalid);

    if (scoreInput) {
      scoreInput.classList.toggle("input-invalid", scoreInvalid);
      scoreInput.setAttribute("aria-invalid", scoreInvalid ? "true" : "false");
    }
  });
}

function renderUnitSummary(summary) {
  const isMatched = summary.status === "pass";
  const diffText =
    summary.diff === 0
      ? ""
      : `，差額 ${Math.abs(summary.diff)} 分（${summary.diff > 0 ? "超出" : "不足"}）`;

  return `
    <p class="unit-summary ${isMatched ? "unit-summary--pass" : "unit-summary--error"}">
      ${isMatched ? "✅" : "❌"} 本單元已配 ${summary.actualScore} 分／應配 ${summary.expectedScore} 分${diffText}
    </p>
  `;
}

function renderTypePlanModeSelector() {
  const selectedMode = state.typePlanMode ?? "ai";
  const apiAvailable = isApiAvailable();
  const apiBusy = state.apiBusy === true;

  return `
    <section class="mode-selector" aria-label="題型規劃模式">
      <button
        class="mode-card ${selectedMode === "ai" ? "mode-card--selected" : ""}"
        type="button"
        data-action="set-type-plan-mode"
        data-mode="ai"
      >
        <strong>AI 分析題型</strong>
        <span>推薦。系統先依學習目標建議題型，教師可再微調。</span>
      </button>
      <button
        class="mode-card ${selectedMode === "manual" ? "mode-card--selected" : ""}"
        type="button"
        data-action="set-type-plan-mode"
        data-mode="manual"
      >
        <strong>自行指定題型</strong>
        <span>不呼叫 AI，由教師逐目標勾選題型與規劃配分。</span>
      </button>
    </section>
    ${
      selectedMode === "ai"
        ? `
          <div class="api-mode-block">
            <p class="hint-text">AI 會依每個學習目標的動詞與內容，先建議 1～2 種題型；教師仍可在下方手動微調。</p>
            ${apiAvailable ? `
              ${typeSuggestionError ? `<p class="field-error">${escapeHtml(typeSuggestionError)} 可改用「自行指定題型」。</p>` : ""}
              ${typeSuggestionSuccess ? `<p class="success-notice">${escapeHtml(typeSuggestionSuccess)}</p>` : ""}
              ${typeSuggestionProgress ? `<p class="notice notice--inline">${escapeHtml(typeSuggestionProgress)}</p>` : ""}
              <button class="button" type="button" data-action="suggest-types-api" ${apiBusy ? "disabled" : ""}>開始 AI 分析</button>
            ` : `<p class="notice notice--inline">目前已關閉 API 模式，請改用自行指定題型。</p>`}
          </div>
        `
        : ""
    }
  `;
}

function renderAiSectionPlanningPanel() {
  const apiAvailable = isApiAvailable();
  const apiBusy = state.apiBusy === true;

  return `
    <section class="api-mode-block section-plan-panel" aria-label="AI 整卷規劃">
      <h3>AI 整卷規劃</h3>
      <p class="hint-text">可先給少量偏好，讓 AI 產生大題結構草案；填入後仍可在下方原地微調、增刪或重新排序。</p>
      <div class="form-grid">
        <label>
          <span>期望大題數（選填）</span>
          <input type="number" min="1" max="8" step="1" data-section-plan-field="sectionCountHint" value="${escapeHtml(sectionPlanPreferences.sectionCountHint)}">
        </label>
        <label>
          <span>期望題組數（選填）</span>
          <input type="number" min="0" max="3" step="1" data-section-plan-field="groupCountHint" value="${escapeHtml(sectionPlanPreferences.groupCountHint)}">
        </label>
        <label class="checkbox-line">
          <input type="checkbox" data-section-plan-field="includeGroup" ${sectionPlanPreferences.includeGroup ? "checked" : ""}>
          <span>希望包含題組</span>
        </label>
        <label class="form-grid__wide">
          <span>補充說明（選填）</span>
          <input type="text" data-section-plan-field="note" value="${escapeHtml(sectionPlanPreferences.note)}" placeholder="例：題組以觀察紀錄為主，低階題不要太多">
        </label>
      </div>
      <fieldset class="checkbox-fieldset">
        <legend>偏好題型（選填）</legend>
        <div class="checkbox-grid">
          ${QUESTION_TYPES.map((questionType) => `
            <label>
              <input
                type="checkbox"
                data-section-plan-type
                value="${escapeHtml(questionType)}"
                ${sectionPlanPreferences.preferredTypes.includes(questionType) ? "checked" : ""}
              >
              <span>${escapeHtml(questionType)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      ${sectionPlanError ? `<p class="field-error">${escapeHtml(sectionPlanError)} 不影響手動排大題。</p>` : ""}
      ${sectionPlanSuccess ? `<p class="success-notice">${escapeHtml(sectionPlanSuccess)}</p>` : ""}
      ${sectionPlanProgress ? `<p class="notice notice--inline">${escapeHtml(sectionPlanProgress)}</p>` : ""}
      ${apiAvailable ? `
        <div class="step-actions">
          <button class="button" type="button" data-action="plan-sections-api" ${apiBusy ? "disabled" : ""}>產生規劃草案</button>
        </div>
      ` : `<p class="notice notice--inline">目前已關閉 API 模式，請手動新增大題。</p>`}
    </section>
  `;
}

function renderBlueprintStep() {
  const sections = getSectionsWithDisplayTitles();
  const summary = summarizeSections({
    sections,
    objectives: state.objectives,
    allocations: state.allocations,
    objectiveAllocations: getEffectiveObjectiveAllocations(),
  });
  const canProceed = summary.allMatched;
  const warningClass = showBlueprintErrors ? "row-errors" : "hint-text";
  const sectionProblemCount = summary.sectionSummaries.filter(
    (section) => section.issues.length > 0,
  ).length;
  const summaryMessage =
    summary.errors.length > 0
      ? `尚有 ${summary.errors.length} 項大題結構需確認，其中 ${sectionProblemCount} 個大題需要就地修正。`
      : "";

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">④卷結構規劃</h2>
      <p class="notice notice--inline">先排大題，再把已配分的學習目標歸入大題。大題配分由系統依目標配分自動加總，不需手動填分。</p>
      ${renderAiSectionPlanningPanel()}
      ${summary.errors.length > 0 ? `
        <div class="${warningClass} blueprint-error-summary">
          <p>${escapeHtml(summaryMessage)}</p>
          ${sectionProblemCount > 0 ? `<button class="button button--secondary" type="button" data-action="scroll-first-section-error">查看第一個問題大題</button>` : ""}
        </div>
      ` : `<p class="success-notice">大題結構已完整，總計 ${formatPrintScore(summary.totalSectionScore)} 分。</p>`}
      <div class="step-actions">
        <button class="button" type="button" data-action="add-section">新增大題</button>
      </div>
      ${state.sections.length === 0 ? `<p class="hint-text">尚未建立大題。請先新增一個大題，再指派學習目標。</p>` : ""}
      ${sections.map((section, index) => {
        const sectionSummary = summary.sectionSummaries.find(
          (entry) => entry.sectionId === section.sectionId,
        );
        const showSectionIssues = sectionSummary?.issues.length > 0;

        return `
          <section class="blueprint-unit section-planner ${showSectionIssues ? "section-planner--error" : ""}" data-section-id="${escapeHtml(section.sectionId)}" ${showSectionIssues ? "data-section-has-error=\"true\"" : ""}>
            <div class="section-planner__header">
              <h3>${escapeHtml(section.title)}</h3>
              <div class="section-planner__tools">
                <button class="button button--secondary" type="button" data-action="reorder-section" data-section-id="${escapeHtml(section.sectionId)}" data-direction="up" ${index === 0 ? "disabled" : ""}>上移</button>
                <button class="button button--secondary" type="button" data-action="reorder-section" data-section-id="${escapeHtml(section.sectionId)}" data-direction="down" ${index === state.sections.length - 1 ? "disabled" : ""}>下移</button>
                <button class="button button--secondary" type="button" data-action="remove-section" data-section-id="${escapeHtml(section.sectionId)}">刪除</button>
              </div>
            </div>
            ${section.rationale ? `
              <details class="ai-rationale">
                <summary>AI 規劃理由</summary>
                <p>${escapeHtml(section.rationale)}</p>
              </details>
            ` : ""}
            <div class="form-grid">
              <label>
                <span>大題類型</span>
                <select data-section-field="kind" data-section-id="${escapeHtml(section.sectionId)}">
                  <option value="normal" ${section.kind === "normal" ? "selected" : ""}>一般大題</option>
                  <option value="group" ${section.kind === "group" ? "selected" : ""}>題組大題</option>
                </select>
              </label>
              ${section.kind === "group" ? `
                <label>
                  <span>文本來源</span>
                  <select data-section-field="textMode" data-section-id="${escapeHtml(section.sectionId)}">
                    <option value="ai" ${section.textMode !== "provided" ? "selected" : ""}>AI 生成文本</option>
                    <option value="provided" ${section.textMode === "provided" ? "selected" : ""}>自行提供文本</option>
                  </select>
                </label>
                <label>
                  <span>小題數</span>
                  <input type="number" min="1" max="8" step="1" data-section-field="subCount" data-section-id="${escapeHtml(section.sectionId)}" value="${escapeHtml(section.subCount ?? section.plannedCount)}">
                </label>
                ${section.textMode === "provided" ? `
                  <label class="form-grid__wide">
                    <span>自行提供文本</span>
                    <textarea rows="5" data-section-field="providedText" data-section-id="${escapeHtml(section.sectionId)}" placeholder="請貼入要作為題組載體的文本，系統只依此文本生成小題，不改寫文本。">${escapeHtml(section.providedText ?? "")}</textarea>
                  </label>
                ` : `
                  <label class="form-grid__wide">
                    <span>主題方向（選填）</span>
                    <input type="text" data-section-field="topicHint" data-section-id="${escapeHtml(section.sectionId)}" value="${escapeHtml(section.topicHint ?? "")}" placeholder="例：動物夜間活動觀察紀錄、星空觀測資料表">
                  </label>
                `}
              ` : `
              <label>
                <span>題型</span>
                <select data-section-field="questionType" data-section-id="${escapeHtml(section.sectionId)}">
                  ${QUESTION_TYPES.map((questionType) => `<option value="${escapeHtml(questionType)}" ${section.questionType === questionType ? "selected" : ""}>${escapeHtml(questionType)}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>預計題數</span>
                <input type="number" min="1" step="1" data-section-field="plannedCount" data-section-id="${escapeHtml(section.sectionId)}" value="${escapeHtml(section.plannedCount)}">
              </label>
              `}
            </div>
            <div class="objective-assignment">
              <h4>歸入此大題的學習目標</h4>
              ${state.objectives.map((objective) => `
                <label class="objective-assignment__item">
                  <input
                    type="checkbox"
                    data-section-objective
                    data-section-id="${escapeHtml(section.sectionId)}"
                    value="${escapeHtml(objective.objectiveId)}"
                    ${section.objectiveIds.includes(objective.objectiveId) ? "checked" : ""}
                  >
                  <span>${escapeHtml(objective.objectiveId)}｜${escapeHtml(objective.text)}</span>
                </label>
              `).join("")}
            </div>
            ${showSectionIssues ? `<ul class="row-errors">${sectionSummary.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
          </section>
        `;
      }).join("")}
      ${renderSectionOverview(summary)}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="3">上一步</button>
        <button class="button" type="button" data-action="blueprint-next" ${canProceed ? "" : "disabled"}>下一步</button>
      </div>
    </section>
  `;
}

function getSectionDisplayTitle(section, index) {
  return `${SECTION_NUMERALS[index] ?? index + 1}、${section?.kind === "group" ? "題組" : section?.questionType || "選擇題"}`;
}

function getSectionsWithDisplayTitles() {
  return [...state.sections]
    .sort((left, right) => Number(left.order) - Number(right.order))
    .map((section, index) => ({
      ...section,
      title: getSectionDisplayTitle(section, index),
    }));
}

function getCurrentSectionSummary() {
  return summarizeSections({
    sections: getSectionsWithDisplayTitles(),
    objectives: state.objectives,
    allocations: state.allocations,
    objectiveAllocations: getEffectiveObjectiveAllocations(),
  });
}

function renderSectionOverview(summary) {
  const missingClass = showBlueprintErrors ? "text-error" : "hint-text";

  return `
    <section class="section-overview">
      <h3>整卷總覽</h3>
      <div class="overview-grid">
        <section>
          <h4>大題視角</h4>
          <div class="table-scroll">
            <table class="data-table data-table--compact">
              <thead>
                <tr>
                  <th>大題</th>
                  <th>題型</th>
                  <th>目標</th>
                  <th>預計題數</th>
                  <th>自動配分</th>
                  <th>佔比</th>
                </tr>
              </thead>
              <tbody>
                ${summary.sectionSummaries.map((section) => `
                  <tr>
                    <td>${escapeHtml(section.title)}</td>
                    <td>${escapeHtml(section.kind === "group" ? "題組" : section.questionType)}</td>
                    <td>${section.objectiveIds.length > 0 ? escapeHtml(section.objectiveIds.join("、")) : "尚未指派"}</td>
                    <td class="print-number">${escapeHtml(section.kind === "group" ? section.subCount : section.plannedCount)}</td>
                    <td class="print-number">${escapeHtml(formatPrintScore(section.score))}</td>
                    <td class="print-number">${escapeHtml(formatPercent(section.ratio))}</td>
                  </tr>
                `).join("")}
                <tr class="print-total-row">
                  <th colspan="4">合計</th>
                  <th>${escapeHtml(formatPrintScore(summary.totalSectionScore))}</th>
                  <th>${escapeHtml(formatPercent(summary.totalObjectiveScore > 0 ? summary.totalSectionScore / summary.totalObjectiveScore : 0))}</th>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h4>目標視角</h4>
          <p class="${summary.missingObjectiveIds.length > 0 ? missingClass : "success-notice"}">
            ${summary.missingObjectiveIds.length > 0
              ? `尚有 ${summary.missingObjectiveIds.length} 個學習目標未被任何大題涵蓋。`
              : `學習目標覆蓋率 ${formatPercent(summary.coverageRate)}。`}
          </p>
          <div class="table-scroll">
            <table class="data-table data-table--compact">
              <thead>
                <tr>
                  <th>目標編號</th>
                  <th>應配分</th>
                  <th>規劃題數</th>
                  <th>涵蓋大題數</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                ${summary.objectiveSummaries.map((objective) => `
                  <tr>
                    <td>${escapeHtml(objective.objectiveId)}</td>
                    <td class="print-number">${escapeHtml(formatPrintScore(objective.score))}</td>
                    <td class="print-number">${escapeHtml(objective.plannedCount)}</td>
                    <td class="print-number">${escapeHtml(objective.coverageCount)}</td>
                    <td>${objective.covered ? "已涵蓋" : "未涵蓋"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;
}

function getPromptResult() {
  return buildItemGenerationPrompt({
    project: state.project ?? {},
    allocations: getActualUnitAllocations(),
    objectives: state.objectives,
    blueprint: state.blueprint,
    materialText: state.materialText,
  });
}

function renderPromptStepLegacy() {
  const result = getPromptResult();

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑤產生出題指令</h2>
      <label class="prompt-material">
        <span>教材摘要（選填）</span>
        <textarea data-material-text rows="5" placeholder="可貼入課文重點或補充教材摘要，幫助 AI 貼近教學內容。請勿貼入整課課文。">${escapeHtml(state.materialText)}</textarea>
      </label>
      ${result.ok ? `
        <div class="prompt-toolbar">
          <button class="button" type="button" data-action="copy-prompt">複製指令</button>
          <span class="copy-status" data-copy-status>${escapeHtml(copyStatus)}</span>
        </div>
        <pre class="prompt-output" data-prompt-output tabindex="0">${escapeHtml(result.prompt)}</pre>
      ` : `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="4">上一步</button>
        <button class="button" type="button" data-action="prompt-next" ${result.ok ? "" : "disabled"}>下一步</button>
      </div>
    </section>
  `;
}

function renderPromptStep() {
  const result = getPromptResult();
  const apiAvailable = isApiAvailable();
  const apiBusy = state.apiBusy === true;

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑤生成備選題</h2>
      <label class="compact-field">
        <span>每個目標每種題型生成幾題備選</span>
        <input type="number" min="2" max="10" step="1" data-candidates-per-objective value="${escapeHtml(state.candidatesPerObjective)}">
      </label>
      ${apiAvailable ? `
        <section class="api-mode-block">
          <h3>一鍵生成備選題</h3>
          <p class="hint-text">按「生成備選題」，系統會依命題藍圖產生超量題目草稿，再到步驟 6 勾選正式試卷題目。AI 產出僅為草稿，務必逐題修改定稿。</p>
          ${generationApiError ? `<p class="field-error">${escapeHtml(generationApiError)} 可改用下方「手動出題指令」。</p>` : ""}
          ${generationApiSuccess ? `<p class="success-notice">${escapeHtml(generationApiSuccess)}</p>` : ""}
          ${generationApiProgress ? `<p class="notice notice--inline">${escapeHtml(generationApiProgress)}</p>` : ""}
          ${apiBusy && !generationApiProgress ? `<p class="notice notice--inline">題目生成中，約需 10～30 秒…</p>` : ""}
          <div class="step-actions">
            <button class="button" type="button" data-action="generate-items-api" ${apiBusy ? "disabled" : ""}>生成備選題</button>
          </div>
        </section>
      ` : ""}
      <details class="manual-fallback" ${apiAvailable ? "" : "open"}>
        <summary>或手動出題指令</summary>
        <p class="hint-text">按「複製指令」，貼到 Gemini、ChatGPT、Claude 等 AI 工具送出；AI 回覆題庫資料後，請到步驟 7 整段貼入。</p>
        ${result.ok ? `
          <div class="prompt-toolbar">
            <button class="button" type="button" data-action="copy-prompt">複製指令</button>
            <span class="copy-status" data-copy-status>${escapeHtml(copyStatus)}</span>
          </div>
          <pre class="prompt-output" data-prompt-output tabindex="0">${escapeHtml(result.prompt)}</pre>
        ` : `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
      </details>
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="4">上一步</button>
        <button class="button" type="button" data-action="prompt-next" ${result.ok ? "" : "disabled"}>前往步驟 7 手動貼入</button>
      </div>
    </section>
  `;
}

function getCandidatesForObjective(objectiveId) {
  return state.candidatePool.filter((item) =>
    Array.isArray(item.objectiveIds) && item.objectiveIds.includes(objectiveId),
  );
}

function renderCandidateOption(item) {
  const optionText = Array.isArray(item.options) && item.options.length > 0
    ? item.options.join("／")
    : "無選項";

  return `
    <article class="candidate-card ${item.selected ? "candidate-card--selected" : ""}">
      <label class="candidate-select">
        <input
          type="checkbox"
          data-action="toggle-candidate-selection"
          data-candidate-id="${escapeHtml(item.itemId)}"
          ${item.selected ? "checked" : ""}
        >
        <span>選入試卷</span>
      </label>
      <p><strong>${escapeHtml(item.questionType || "未填題型")}</strong>｜選入後依目標配分自動計分</p>
      <p>${escapeHtml(item.question || "未填題幹")}</p>
      <p class="hint-text">選項：${escapeHtml(optionText)}</p>
      <p class="hint-text">答案：${escapeHtml(item.answer || "未填")}｜目標：${escapeHtml((item.objectiveIds ?? []).join("、"))}</p>
    </article>
  `;
}

function renderGroupCandidateCard(groupItems, summary) {
  const firstItem = groupItems[0] ?? {};
  const isSelected = groupItems.every((item) => item.selected === true);
  const groupSectionId = firstItem.sectionId ?? "";
  const cognitiveLevels = [...new Set(
    groupItems
      .map((item) => item.cognitiveLevel)
      .filter((level) => typeof level === "string" && level.trim() !== ""),
  )];
  const groupObjectiveResults = (summary?.groupObjectiveResults ?? []).filter(
    (result) => result.sectionId === groupSectionId,
  );

  return `
    <article class="candidate-card candidate-card--group ${isSelected ? "candidate-card--selected" : ""}">
      <label class="candidate-select">
        <input
          type="checkbox"
          data-action="toggle-candidate-selection"
          data-candidate-id="${escapeHtml(firstItem.itemId)}"
          ${isSelected ? "checked" : ""}
        >
        <span>整組選入試卷</span>
      </label>
      <p><strong>題組</strong>｜${groupItems.length} 小題｜選入後依目標配分自動計分</p>
      ${firstItem.stimulus ? `<div class="stimulus">${escapeHtml(firstItem.stimulus)}</div>` : ""}
      ${cognitiveLevels.length > 0 ? `<p class="hint-text">認知層次：${escapeHtml(cognitiveLevels.join("、"))}</p>` : ""}
      ${isSelected && groupObjectiveResults.length > 0 ? `
        <ul class="selection-score-list">
          ${groupObjectiveResults.map((result) => `
            <li class="${result.status === "pass" ? "success-notice" : "field-error"}">
              目標 ${escapeHtml(result.objectiveId)}：小題合計 ${escapeHtml(formatPrintScore(result.actualScore))}/${escapeHtml(formatPrintScore(result.expectedScore))} ${result.status === "pass" ? "✅" : "❌"}
            </li>
          `).join("")}
        </ul>
      ` : ""}
      <ol class="candidate-subitems">
        ${groupItems.map((item) => `
          <li>
            <strong>${escapeHtml(item.questionType || "小題")}</strong>
            ${escapeHtml(item.question || "未填題幹")}
            <span class="hint-text">（目標：${escapeHtml((item.objectiveIds ?? []).join("、"))}${item.cognitiveLevel ? `｜${escapeHtml(item.cognitiveLevel)}` : ""}）</span>
            ${isSelected ? `
              <label class="compact-field compact-field--inline">
                <span>小題配分</span>
                <input
                  class="score-input"
                  type="number"
                  min="1"
                  step="1"
                  data-group-item-score
                  data-candidate-id="${escapeHtml(item.itemId)}"
                  value="${escapeHtml(summary?.scoreByItemId?.get(item.itemId) ?? item.score ?? 1)}"
                >
              </label>
            ` : ""}
          </li>
        `).join("")}
      </ol>
    </article>
  `;
}

function renderGroupCandidates(candidates, summary) {
  const groups = [];
  const groupMap = new Map();

  candidates.forEach((item) => {
    const groupId = typeof item.groupId === "string" && item.groupId.trim() !== ""
      ? item.groupId.trim()
      : item.itemId;

    if (!groupMap.has(groupId)) {
      const entries = [];
      groupMap.set(groupId, entries);
      groups.push(entries);
    }

    groupMap.get(groupId).push(item);
  });

  return `
    <div class="candidate-list">
      ${groups.map((groupItems) => renderGroupCandidateCard(groupItems, summary)).join("")}
    </div>
  `;
}

function renderCandidatesByType(candidates) {
  const grouped = new Map();

  candidates.forEach((item) => {
    const questionType = item.questionType || "其他";
    const entries = grouped.get(questionType) ?? [];
    entries.push(item);
    grouped.set(questionType, entries);
  });

  return [...grouped.entries()].map(([questionType, items]) => `
    <section class="candidate-type-group">
      <h4>${escapeHtml(questionType)}</h4>
      <div class="candidate-list">
        ${items.map(renderCandidateOption).join("")}
      </div>
    </section>
  `).join("");
}

function getCandidatesForSection(section) {
  const sectionObjectiveIds = new Set(section.objectiveIds ?? []);

  return state.candidatePool.filter((item) => {
    if (item.sectionId === section.sectionId) {
      return true;
    }

    if (item.sectionId) {
      return false;
    }

    return Array.isArray(item.objectiveIds) &&
      item.objectiveIds.some((objectiveId) => sectionObjectiveIds.has(objectiveId));
  });
}

function renderSelectionObjectiveSummary(summary) {
  return `
    <details class="mapping-details">
      <summary>查看目標配分檢查</summary>
      <ul class="selection-score-list">
        ${summary.objectiveSummaries.map((objective) => {
          const statusIcon = objective.status === "pass" ? "✅" : "❌";
          const perItemScore =
            objective.groupSelectedCount > 0 && objective.normalExpectedScore === 0
              ? "題組小題各自給分"
              : objective.perItemScore === null || objective.perItemScore === undefined
              ? "無法平分"
              : `${formatPrintScore(objective.perItemScore)} 分`;

          return `
            <li class="${objective.status === "pass" ? "success-notice" : "field-error"}">
              目標 ${escapeHtml(objective.objectiveId)}｜共 ${escapeHtml(formatPrintScore(objective.expectedScore))} 分｜已選 ${escapeHtml(objective.selectedCount)} 題｜每題 ${escapeHtml(perItemScore)}｜合計 ${escapeHtml(formatPrintScore(objective.selectedScore))} ${statusIcon}
              ${objective.status === "pass" ? "" : `<br><small>${escapeHtml(objective.message)}</small>`}
            </li>
          `;
        }).join("")}
      </ul>
    </details>
  `;
}

function renderSelectionStep() {
  const summary = summarizeCandidateSelection({
    objectives: state.objectives,
    blueprint: state.blueprint,
    candidatePool: state.candidatePool,
    sections: state.sections,
  });
  const candidateCount = Array.isArray(state.candidatePool)
    ? state.candidatePool.length
    : 0;

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑥選題組卷</h2>
      <p class="notice notice--inline">請從備選題中自由勾選要放入正式試卷的題目。系統會依每個目標總配分平均分給該目標已選題目；若無法整除為正整數，需調整選題數或回步驟 ③ 調整配分。</p>
      <p>目前共有 ${candidateCount} 題備選題，已選 ${summary.selectedItems.length} 題，已選總分 ${formatPrintScore(summary.totalSelectedScore)}／應選 ${formatPrintScore(summary.totalExpectedScore)} 分。</p>
      ${summary.errors.length > 0 ? `<ul class="row-errors">${summary.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : `<p class="success-notice">已選題目配分與藍圖完全一致。</p>`}
      ${renderSelectionObjectiveSummary(summary)}
      ${getSectionsWithDisplayTitles().map((section) => {
        const candidates = getCandidatesForSection(section);
        const selectedCandidates = candidates.filter((item) => item.selected);

        return `
          <section class="selection-objective">
            <h3>${escapeHtml(section.title)}</h3>
            <p class="unit-summary">
              已選 ${selectedCandidates.length} 題／預計 ${escapeHtml(section.kind === "group" ? section.subCount : section.plannedCount)} 題；${section.kind === "group" ? "題組小題可各自給分，分目標合計需符合應配分。" : "題分會依目標配分於確認選題時自動均分。"}
            </p>
            <p class="hint-text">涵蓋目標：${escapeHtml((section.objectiveIds ?? []).join("、"))}</p>
            ${candidates.length > 0 ? (section.kind === "group" ? renderGroupCandidates(candidates, summary) : renderCandidatesByType(candidates)) : `<p class="field-error">此大題目前沒有備選題，請回步驟 5 重新生成或改用手動出題。</p>`}
          </section>
        `;
      }).join("")}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="5">上一步</button>
        <button class="button" type="button" data-action="confirm-selection" ${summary.allMatched ? "" : "disabled"}>確認選題並前往審題檢核</button>
      </div>
    </section>
  `;
}

function isChineseProject() {
  return isChineseSubject(state.project?.subject);
}

function getItemValidationErrors(items) {
  const errors = [];

  items.forEach((item, index) => {
    const result = validateItemForUi(item, { isChinese: isChineseProject() });

    result.errors.forEach((error) => {
      errors.push(`第 ${index + 1} 題 ${formatUserFacingError(error)}`);
    });
  });

  return errors;
}

function countInvalidItems(errors) {
  return new Set(
    errors
      .map((error) => error.match(/第\s*(\d+)\s*題/)?.[1])
      .filter(Boolean),
  ).size;
}

function getSeverityIcon(severity) {
  if (severity === "pass") {
    return "✅";
  }

  if (severity === "warning") {
    return "⚠️";
  }

  return "❌";
}

function getSeverityLabel(severity) {
  return `${getSeverityIcon(severity)} ${severity}`;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatSignedNumber(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function renderImportResult() {
  if (!itemImportMessage && itemImportErrors.length === 0) {
    return "";
  }

  return `
    <section class="import-result">
      ${itemImportMessage ? `<p>${escapeHtml(itemImportMessage)}</p>` : ""}
      ${itemImportErrors.length > 0 ? `<ul class="row-errors">${itemImportErrors.map((error) => `<li>${escapeHtml(toTeacherFacingImportText(error))}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function toTeacherFacingImportText(message) {
  return formatUserFacingError(message)
    .replaceAll("JSON 解析失敗", "題庫資料讀取失敗")
    .replaceAll("解析結果不是 JSON 陣列", "讀取結果不是題庫資料陣列")
    .replaceAll("JSON", "題庫資料")
    .replaceAll("json", "題庫資料")
    .replaceAll("parse", "讀取");
}

function renderItemSummary(item) {
  const objectiveIds = Array.isArray(item.objectiveIds)
    ? item.objectiveIds.join("、")
    : "";
  const options = Array.isArray(item.options) ? item.options : [];

  return `
    <dl class="item-details">
      <div><dt>題型</dt><dd>${escapeHtml(item.questionType)}</dd></div>
      <div><dt>配分</dt><dd>${escapeHtml(item.score)} 分</dd></div>
      <div><dt>對應目標</dt><dd>${escapeHtml(objectiveIds)}</dd></div>
      ${isChineseProject() ? `<div><dt>國語向度</dt><dd>${escapeHtml(item.chineseDimension ?? "")}</dd></div>` : ""}
    </dl>
    <p class="item-question">${escapeHtml(item.question)}</p>
    ${options.length > 0 ? `<ol class="item-options">${options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ol>` : ""}
    <p><strong>答案：</strong>${escapeHtml(item.answer)}</p>
    <p><strong>說明：</strong>${escapeHtml(item.explanation)}</p>
  `;
}

function renderChineseDimensionSelect(value) {
  return `
    <label>
      <span>國語向度</span>
      <select data-edit-field="chineseDimension">
        ${CHINESE_DIMENSION_OPTIONS.map(([optionValue, label]) => `
          <option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${label}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderItemEditForm(item, itemIndex) {
  return `
    <form class="item-edit-form" data-item-edit-form="${itemIndex}" novalidate>
      ${itemEditErrors.length > 0 ? `<ul class="row-errors">${itemEditErrors.map((error) => `<li>${escapeHtml(toTeacherFacingImportText(error))}</li>`).join("")}</ul>` : ""}
      <label>
        <span>題幹</span>
        <textarea data-edit-field="question" rows="3">${escapeHtml(item.question)}</textarea>
      </label>
      <label>
        <span>選項（逐行一個選項）</span>
        <textarea data-edit-field="options" rows="4">${escapeHtml(Array.isArray(item.options) ? item.options.join("\n") : "")}</textarea>
      </label>
      <label>
        <span>答案</span>
        <input data-edit-field="answer" value="${escapeHtml(item.answer)}">
      </label>
      <label>
        <span>說明</span>
        <textarea data-edit-field="explanation" rows="3">${escapeHtml(item.explanation)}</textarea>
      </label>
      <label>
        <span>配分</span>
        <input type="number" min="0" step="0.5" data-edit-field="score" value="${escapeHtml(item.score)}">
      </label>
      <label>
        <span>對應目標編號（逗號分隔）</span>
        <input data-edit-field="objectiveIds" value="${escapeHtml(Array.isArray(item.objectiveIds) ? item.objectiveIds.join(", ") : "")}">
      </label>
      <label>
        <span>預估作答秒數</span>
        <input type="number" min="0" step="1" data-edit-field="estimatedTimeSeconds" value="${escapeHtml(item.estimatedTimeSeconds)}">
      </label>
      <label>
        <span>預估鑑別度</span>
        <input type="number" min="0" max="1" step="0.01" data-edit-field="discriminationPrediction" value="${escapeHtml(item.discriminationPrediction ?? "")}">
      </label>
      ${isChineseProject() ? renderChineseDimensionSelect(item.chineseDimension ?? "") : ""}
      <div class="step-actions">
        <button class="button" type="submit">儲存</button>
        <button class="button button--secondary" type="button" data-action="cancel-edit-item">取消</button>
      </div>
    </form>
  `;
}

function renderItemCard(item, itemIndex) {
  return `
    <article class="item-card" data-item-card="${itemIndex}">
      <header class="item-card__header">
        <h4>${escapeHtml(item.itemId || `第 ${itemIndex + 1} 題`)}</h4>
        <div class="item-card__actions">
          <button class="button button--secondary" type="button" data-action="edit-item" data-item-index="${itemIndex}">編輯</button>
          <button class="button button--secondary" type="button" data-action="delete-item" data-item-index="${itemIndex}">刪除</button>
        </div>
      </header>
      ${editingItemIndex === itemIndex ? renderItemEditForm(item, itemIndex) : renderItemSummary(item)}
    </article>
  `;
}

function renderGroupedItems() {
  if (state.items.length === 0) {
    return `<p class="empty-state">尚未匯入題庫。</p>`;
  }

  const grouped = groupItemsByGroup(state.items);

  return grouped.groups.map((group) => `
    <section class="item-group-card">
      <header>
        <h3>${group.groupId ? `題組 ${escapeHtml(group.groupId)}` : "單題"}</h3>
        ${group.stimulus ? `<p class="stimulus">${escapeHtml(group.stimulus)}</p>` : ""}
      </header>
      ${group.items.map(({ item, index }) => renderItemCard(item, index)).join("")}
    </section>
  `).join("");
}

function renderCoverageReport(coverage) {
  return `
    <p>覆蓋率：<strong>${formatPercent(coverage.coverageRate)}</strong></p>
    ${coverage.missingObjectiveIds.length > 0 ? `<p class="text-error">未入題目標：${escapeHtml(coverage.missingObjectiveIds.join("、"))}</p>` : ""}
    <div class="table-scroll">
      <table class="data-table compact-table">
        <thead><tr><th>學習目標</th><th>題號</th></tr></thead>
        <tbody>
          ${coverage.objectiveItemMatrix.map((entry) => `
            <tr>
              <td>${escapeHtml(entry.objectiveId)}</td>
              <td>${escapeHtml(entry.itemIds.join("、") || "未入題")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderScoresReport(scores) {
  return `
    <div class="table-scroll">
      <table class="data-table compact-table">
        <thead><tr><th>單元</th><th>建議</th><th>實際</th><th>差額</th><th>狀態</th></tr></thead>
        <tbody>
          ${scores.unitResults.map((result) => `
            <tr>
              <td>${escapeHtml(result.unitName)}</td>
              <td>${result.suggestedScore}</td>
              <td>${result.actualScore}</td>
              <td>${formatSignedNumber(result.diff)}</td>
              <td>${getSeverityLabel(result.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${scores.crossUnitItemIds.length > 0 ? `<p class="text-warning">跨單元題：${escapeHtml(scores.crossUnitItemIds.join("、"))}，請人工確認配分歸屬。</p>` : ""}
    <ul>${scores.messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>
  `;
}

function renderTimeReport(time) {
  return `
    <p>預估應試時間：<strong>${time.estimatedMinutes} 分鐘</strong></p>
    <p>${escapeHtml(time.message)}</p>
    ${time.suggestedAdjustment ? `<p class="text-warning">${escapeHtml(time.suggestedAdjustment)}</p>` : ""}
  `;
}

function renderQualityReport(quality) {
  const problemItems = quality.itemResults.filter((result) => result.status !== "pass");

  return problemItems.length === 0
    ? `<p>${escapeHtml(quality.messages[0] ?? "所有題目品質檢核通過。")}</p>`
    : `
      <ul class="issue-list">
        ${problemItems.map((result) => `
          <li>
            <strong>${escapeHtml(result.itemId)}｜${getSeverityLabel(result.status)}</strong>
            <ul>${result.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
          </li>
        `).join("")}
      </ul>
    `;
}

function renderChineseReport(chinese) {
  if (!chinese) {
    return "";
  }

  return `
    <div class="table-scroll">
      <table class="data-table compact-table">
        <thead><tr><th>向度</th><th>應占比</th><th>實占比</th><th>差距</th><th>狀態</th></tr></thead>
        <tbody>
          ${chinese.dimensionResults.map((result) => `
            <tr>
              <td>${escapeHtml(result.label)}</td>
              <td>${formatPercent(result.expectedRatio)}</td>
              <td>${formatPercent(result.actualRatio)}</td>
              <td>${formatSignedNumber(result.diffPercentagePoints)} 個百分點</td>
              <td>${getSeverityLabel(result.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <ul>${chinese.messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>
  `;
}

function renderChecklistSuggestions(report) {
  return `
    <section class="checklist-suggestions">
      <h3>審核表自評建議</h3>
      <ul>
        ${report.checklistSuggestions.map((suggestion) => {
          const marker =
            suggestion.suggested === null
              ? "⬜ 需人工確認"
              : suggestion.suggested
                ? "✅ 建議勾選"
                : "❌ 暫不建議勾選";

          return `<li><strong>${marker}｜${escapeHtml(suggestion.label)}</strong><br>${escapeHtml(suggestion.reason)}</li>`;
        }).join("")}
      </ul>
    </section>
  `;
}

function renderReportCard(title, section, bodyHtml) {
  return `
    <section class="audit-card audit-card--${section.severity}">
      <header>
        <h3>${escapeHtml(title)}</h3>
        <span>${getSeverityLabel(section.severity)}</span>
      </header>
      ${bodyHtml}
    </section>
  `;
}

function getStepSevenBlockReason() {
  if (!state.auditReport) {
    return "尚未產生審題報告。";
  }

  if (state.auditStale) {
    return "題庫已變更，請重新檢核。";
  }

  if (state.auditReport.overallSeverity === "error") {
    return state.auditReport.summary?.[0] ?? "審題報告仍有 error，請先修正題庫。";
  }

  return "";
}

function renderAuditReport() {
  if (!state.auditReport) {
    return "";
  }

  const report = state.auditReport;
  const sections = report.sections;
  const blockReason = getStepSevenBlockReason();

  return `
    <section class="audit-report ${state.auditStale ? "audit-report--stale" : ""}" data-audit-report tabindex="-1">
      <header class="audit-report__header">
        <h3>審題報告</h3>
        <span>${getSeverityLabel(report.overallSeverity)}</span>
      </header>
      ${state.auditStale ? `<p class="stale-notice">題庫已變更，請重新檢核。</p>` : ""}
      <div class="audit-card-grid">
        ${renderReportCard("目標覆蓋率", sections.coverage, renderCoverageReport(sections.coverage))}
        ${renderReportCard("配分檢核", sections.scores, renderScoresReport(sections.scores))}
        ${renderReportCard("應試時間", sections.time, renderTimeReport(sections.time))}
        ${renderReportCard("題目品質", sections.quality, renderQualityReport(sections.quality))}
        ${sections.chinese ? renderReportCard("國語向度", sections.chinese, renderChineseReport(sections.chinese)) : ""}
      </div>
      ${renderChecklistSuggestions(report)}
      ${report.overallSeverity === "warning" && !state.auditStale ? `<p class="text-warning">尚有警告事項，請確認後再輸出。</p>` : ""}
      ${blockReason ? `<p class="text-error">無法進入步驟 8：${escapeHtml(blockReason)}</p>` : ""}
      <div class="step-actions">
        <button class="button" type="button" data-action="go-step" data-target-step="8" ${blockReason ? "disabled" : ""}>前往步驟 8</button>
      </div>
    </section>
  `;
}

function renderItemsStep() {
  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑦審題檢核</h2>
      <section class="paste-panel" aria-label="貼入題庫資料">
        <label>
          <span>題庫資料</span>
          <textarea data-items-json rows="8" placeholder="請貼上 AI 回覆的題庫資料。">${escapeHtml(itemsJsonText)}</textarea>
        </label>
        <div class="step-actions">
          <button class="button" type="button" data-action="parse-items">${state.items.length > 0 ? "重新貼入並覆蓋" : "讀取題庫"}</button>
        </div>
        ${renderImportResult()}
      </section>
      <section class="items-editor" aria-label="逐題編修">
        <div class="section-heading">
          <h3>逐題編修</h3>
          <p class="hint-text">請逐一確認題目後，於下方執行審核。</p>
        </div>
        ${renderGroupedItems()}
        <div class="step-actions">
          <button class="button" type="button" data-action="run-audit" ${state.items.length > 0 ? "" : "disabled"}>執行試題審核</button>
        </div>
      </section>
      ${renderAuditReport()}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="6">上一步</button>
      </div>
    </section>
  `;
}

function getPrintData() {
  return buildPrintData({
    project: state.project,
    allocations: getActualUnitAllocations(),
    objectives: state.objectives,
    items: state.items,
    auditReport: state.auditReport,
  });
}

function renderPrintOutputStep() {
  const hasReport = Boolean(state.auditReport);

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑧輸出送審表件</h2>
      ${hasReport ? `
        <div class="output-actions" aria-label="送審表件輸出">
          <button class="button" type="button" data-action="open-print-view" data-print-view="scoreTable">配分表</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="studentPaper">試題（學生卷）</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="teacherPaper">試題（教師卷）</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="reviewSheet">審核表</button>
        </div>
        <p class="empty-state">各視圖開啟後，可按右上角「列印／另存 PDF」輸出。簽名欄請保留紙本親簽。</p>
      ` : `
        <p class="text-error">尚未完成審題檢核，請回步驟 7 執行檢核後再輸出送審表件。</p>
      `}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="7">上一步</button>
      </div>
    </section>
  `;
}

function renderPrintOverlay() {
  if (!activePrintView) {
    return "";
  }

  const data = getPrintData();
  const viewRenderers = {
    scoreTable: () => renderScoreTablePrint(data.scoreTable),
    studentPaper: () => renderPaperPrint(data.studentPaper, { teacher: false }),
    teacherPaper: () => renderPaperPrint(data.teacherPaper, { teacher: true }),
    reviewSheet: () => renderReviewSheetPrint(data.reviewSheet),
  };
  const renderer = viewRenderers[activePrintView];

  if (!renderer) {
    return "";
  }

  return `
    <section class="print-overlay" aria-label="列印視圖">
      <div class="print-toolbar">
        <button class="button" type="button" data-action="print-current-view">🖨 列印／另存 PDF</button>
        <button class="button button--secondary" type="button" data-action="close-print-view">返回</button>
      </div>
      <div class="print-page">
        ${renderer()}
      </div>
    </section>
  `;
}

function renderProjectLine(project) {
  const parts = [
    `${project.schoolYear || ""} 學年度`,
    `第 ${project.semester || ""} 學期`,
    `第 ${project.examNumber || ""} 次定期評量`,
  ];

  return parts.join("　");
}

function renderExamHeader(project, title) {
  return `
    <header class="paper-header">
      <h1>${escapeHtml(project.schoolName)}</h1>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(renderProjectLine(project))}</p>
      <table class="print-meta-table">
        <tbody>
          <tr>
            <th>年級領域</th>
            <td>${escapeHtml(project.grade)} 年級　${escapeHtml(project.subject)}</td>
            <th>版本</th>
            <td>${escapeHtml(project.publisher)}</td>
          </tr>
          <tr>
            <th>範圍</th>
            <td colspan="3">${escapeHtml(project.scope)}</td>
          </tr>
          <tr>
            <th>姓名</th>
            <td></td>
            <th>座號</th>
            <td></td>
          </tr>
        </tbody>
      </table>
    </header>
  `;
}

function renderScoreTablePrint(scoreTable) {
  return `
    <article class="print-document print-document--score-table">
      <header class="paper-header">
        <h1>${escapeHtml(scoreTable.project.schoolName)}</h1>
        <h2>配分表</h2>
        <p>${escapeHtml(renderProjectLine(scoreTable.project))}</p>
      </header>
      <table class="print-table">
        <thead>
          <tr>
            <th>單元名稱</th>
            <th>授課節數</th>
            <th>計算式</th>
            <th>配分</th>
          </tr>
        </thead>
        <tbody>
          ${scoreTable.rows.map((row) => `
            <tr class="print-unit-row">
              <td>${escapeHtml(row.unitName)}</td>
              <td class="print-number">${escapeHtml(row.periodCount)}</td>
              <td>${escapeHtml(row.formula)}</td>
              <td class="print-number">${escapeHtml(row.score)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <th>總計</th>
            <th>${escapeHtml(scoreTable.totalPeriods)} 節</th>
            <th></th>
            <th>${escapeHtml(scoreTable.totalScore)} 分</th>
          </tr>
        </tfoot>
      </table>
    </article>
  `;
}

function renderOptionsForPrint(options = []) {
  if (!Array.isArray(options) || options.length === 0) {
    return "";
  }

  return `
    <ol class="print-options">
      ${options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}
    </ol>
  `;
}

function renderTeacherNote(item) {
  return `
    <div class="teacher-note">
      <span>【答案】${escapeHtml(item.answer ?? "")}</span>
      <span>【解析】${escapeHtml(item.explanation ?? "")}</span>
      <span>【對應目標：${escapeHtml((item.objectiveIds ?? []).join("、"))}】</span>
      ${item.cognitiveLevel ? `<span>【認知層次】${escapeHtml(item.cognitiveLevel)}</span>` : ""}
      <span>【配分】${escapeHtml(item.score ?? "")} 分</span>
    </div>
  `;
}

function renderPrintItem(entry, { teacher }) {
  const item = entry.item;

  return `
    <section class="print-question">
      <h3>${escapeHtml(entry.displayNumber)}. ${escapeHtml(item.question ?? "")}</h3>
      ${renderOptionsForPrint(item.options)}
      ${teacher ? renderTeacherNote(item) : ""}
    </section>
  `;
}

function renderPrintGroup(group, { teacher }) {
  return `
    <section class="print-group">
      <h3>${escapeHtml(group.stimulusTitle || `題組 ${group.groupNumber}`)}</h3>
      ${group.stimulus ? `<div class="print-stimulus">${escapeHtml(group.stimulus)}</div>` : ""}
      ${group.items.map((entry) => renderPrintItem(entry, { teacher })).join("")}
    </section>
  `;
}

function renderPaperSections(paper, { teacher }) {
  return paper.sections.map((section) => `
    <section class="print-section">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.items.map((entry) => renderPrintItem(entry, { teacher })).join("")}
      ${section.groups.map((group) => renderPrintGroup(group, { teacher })).join("")}
    </section>
  `).join("");
}

function renderPaperPrint(paper, { teacher }) {
  return `
    <article class="print-document print-document--paper">
      ${renderExamHeader(paper.project, teacher ? "試題（教師卷）" : "試題（學生卷）")}
      ${renderPaperSections(paper, { teacher })}
    </article>
  `;
}

function renderCheckedList(options, selectedValue) {
  return options.map((option) => {
    const value = String(option.value);
    const checked = String(selectedValue) === value ? "☑" : "☐";

    return `${checked} ${escapeHtml(option.label)}`;
  }).join("　");
}

function renderReviewHeader(project) {
  const gradeOptions = [1, 2, 3, 4, 5, 6].map((grade) => ({
    value: grade,
    label: `${grade} 年級`,
  }));
  const subjectOptions = ["國語", "數學", "自然", "社會", "英語"].map((subject) => ({
    value: subject,
    label: subject,
  }));

  return `
    <table class="print-table review-meta-table">
      <tbody>
        <tr>
          <th>學年度</th>
          <td>${escapeHtml(project.schoolYear)}</td>
          <th>學期</th>
          <td>${escapeHtml(project.semester)}</td>
          <th>次別</th>
          <td>${escapeHtml(project.examNumber)}</td>
        </tr>
        <tr>
          <th>年級</th>
          <td colspan="2">${renderCheckedList(gradeOptions, project.grade)}</td>
          <th>領域</th>
          <td colspan="2">${renderCheckedList(subjectOptions, project.subject)}</td>
        </tr>
        <tr>
          <th>命題教師</th>
          <td colspan="2">${escapeHtml(project.teacher)}</td>
          <th>版本</th>
          <td colspan="2">${escapeHtml(project.publisher)}</td>
        </tr>
        <tr>
          <th>範圍</th>
          <td colspan="5">${escapeHtml(project.scope)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderReviewChecklist(checklist) {
  return `
    <section class="review-section">
      <h2>命題者自評區</h2>
      <table class="print-table review-checklist-table">
        <tbody>
          ${checklist.map((entry, index) => {
            const note = entry.suggested === false
              ? `系統檢核未通過：${entry.reason ?? ""}`
              : entry.needsHumanReview
                ? `由教師人工判斷後手勾：${entry.reason ?? ""}`
                : entry.reason ?? "";

            return `
              <tr>
                <td class="review-check-mark">${escapeHtml(entry.mark)}</td>
                <td>
                  <strong>${index + 1}. ${escapeHtml(entry.label)}</strong>
                  ${note ? `<div class="review-note">${escapeHtml(note)}</div>` : ""}
                </td>
              </tr>
            `;
          }).join("")}
          <tr>
            <th>自評簽名</th>
            <td class="signature-cell"></td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderReviewStages() {
  const stages = ["一審", "二審", "三審"];

  return `
    <section class="review-section">
      <h2>審題流程紀錄</h2>
      <table class="print-table review-stage-table">
        <thead>
          <tr>
            <th>階段</th>
            <th>審題方式</th>
            <th>審題教師簽名</th>
            <th>審題意見</th>
          </tr>
        </thead>
        <tbody>
          ${stages.map((stage) => `
            <tr>
              <td>${stage}</td>
              <td>☐ 傳閱　☐ 共同討論</td>
              <td class="signature-cell"></td>
              <td class="review-comment-cell"></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function formatPrintScore(value) {
  const number = Number(value) || 0;

  if (Math.abs(number - Math.round(number)) < 1e-9) {
    return String(Math.round(number));
  }

  return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function renderScienceScoreCell(typeResult) {
  if (!typeResult || typeResult.score === 0) {
    return "";
  }

  const itemNumbers = Array.isArray(typeResult.itemNumbers)
    ? typeResult.itemNumbers
    : [];
  const label = itemNumbers.length > 0 ? itemNumbers.join("、") : "未列題號";

  return `${escapeHtml(label)}(${escapeHtml(formatPrintScore(typeResult.score))})`;
}

function renderScienceReviewBody(reviewSheet) {
  return `
    <section class="review-section">
      <h2>教學目標與配分總覽</h2>
      ${reviewSheet.notices?.length > 0 ? `
        <ul class="print-notices">
          ${reviewSheet.notices.map((notice) => `<li>${escapeHtml(notice)}</li>`).join("")}
        </ul>
      ` : ""}
      <table class="print-table review-science-table">
        <thead>
          <tr>
            <th>大單元</th>
            <th>小單元</th>
            <th>目標編號</th>
            <th>學習目標</th>
            <th>節數</th>
            <th>配分</th>
          </tr>
        </thead>
        <tbody>
          ${reviewSheet.scienceRows.map((row) => `
            <tr class="print-unit-row">
              <td>${escapeHtml(row.unitName)}</td>
              <td>${escapeHtml(row.lessonName)}</td>
              <td>${escapeHtml(row.objectiveId)}</td>
              <td>${escapeHtml(row.objectiveText)}</td>
              <td class="print-number">${escapeHtml(row.periodCount)}</td>
              <td class="print-number">${escapeHtml(formatPrintScore(row.rowTotal))}</td>
            </tr>
          `).join("")}
          <tr class="print-total-row">
            <th colspan="5">合計</th>
            <th>${escapeHtml(formatPrintScore(reviewSheet.scienceGrandTotal))}</th>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderNonChineseReviewBody(reviewSheet) {
  return `
    <section class="review-section">
      ${reviewSheet.format === "chinese_fallback" ? `
        <p class="print-notice">${escapeHtml(reviewSheet.chineseFallbackNotice)}</p>
      ` : ""}
      <h2>單元與教學目標配分</h2>
      <table class="print-table">
        <thead>
          <tr>
            <th>大單元名稱</th>
            <th>授課節數</th>
            <th>出題佔分</th>
            <th>教學目標</th>
          </tr>
        </thead>
        <tbody>
          ${reviewSheet.unitRows.map((row) => `
            <tr class="print-unit-row">
              <td>${escapeHtml(row.unitName)}</td>
              <td class="print-number">${escapeHtml(row.periodCount)}</td>
              <td class="print-number">${escapeHtml(row.score)}</td>
              <td>${escapeHtml(row.objectiveIds.join("、"))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderReviewSheetBody(reviewSheet) {
  if (reviewSheet.format === "science") {
    return renderScienceReviewBody(reviewSheet);
  }

  return renderNonChineseReviewBody(reviewSheet);
}

function renderReviewSheetPrint(reviewSheet) {
  return `
    <article class="print-document print-document--review-sheet">
      <header class="paper-header review-sheet-header">
        <h1>${escapeHtml(reviewSheet.project.schoolName)}學習評量試題審核表</h1>
        <p>${escapeHtml(reviewSheet.versionLabel)}</p>
      </header>
      ${renderReviewHeader(reviewSheet.project)}
      ${renderReviewSheetBody(reviewSheet)}
      ${renderReviewChecklist(reviewSheet.checklist)}
      ${renderReviewStages()}
    </article>
  `;
}

function renderCurrentStep() {
  if (state.currentStep === 1) {
    return renderProjectForm();
  }

  if (state.currentStep === 2) {
    return renderObjectivesStep();
  }

  if (state.currentStep === 3) {
    return renderAllocationsStep();
  }

  if (state.currentStep === 4) {
    return renderBlueprintStep();
  }

  if (state.currentStep === 5) {
    return renderPromptStep();
  }

  if (state.currentStep === 6) {
    return renderSelectionStep();
  }

  if (state.currentStep === 7) {
    return renderItemsStep();
  }

  if (state.currentStep === 8) {
    return renderPrintOutputStep();
  }

  return renderPlaceholderStep(state);
}

function render() {
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header__inner">
          <div>
            <h1 class="brand-title">內湖國小命題與審題輔助系統</h1>
            <p class="brand-subtitle">exam-wizard</p>
          </div>
          <button class="button button--secondary" type="button" data-action="clear-data">清除資料</button>
        </div>
      </header>
      <main class="app-main">
        ${renderDraftPanel()}
        ${renderNotice()}
        ${renderProgress(state)}
        ${renderStepHelp(state)}
        ${renderCurrentStep()}
      </main>
      <footer class="app-footer">
        <div class="app-footer__inner">
          <p>試題資料屬機密，請勿於公用電腦留存；離開前可按右上角「清除資料」。</p>
        </div>
      </footer>
    </div>
    ${renderPrintOverlay()}
  `;
  syncObjectiveDialogs();
}

function syncObjectiveDialogs() {
  const dialogs = [
    ...appRoot.querySelectorAll("[data-objective-dialog], [data-renumber-dialog]"),
  ];

  dialogs.forEach((dialog) => {
    if (!dialog.open) {
      dialog.showModal();
    }
  });
}

function closeObjectiveDialog(dialogName) {
  if (dialogName === "paste") {
    pastePanelOpen = false;
  }

  if (dialogName === "ai-extraction") {
    aiExtractionPanelOpen = false;
    extractionCopyStatus = "";
    extractionApiError = "";
    extractionFileError = "";
    extractionSelectedFiles = [];
  }
}

function closeRenumberDialog() {
  renumberDialogOpen = false;
}

function clearRenumberFeedback() {
  renumberSuccess = "";
  renumberNotices = [];
  renumberMappingRows = [];
}

function validateProjectDraft() {
  return validateProjectDraftData(projectDraft);
}

function normalizeProjectDraft() {
  return normalizeProjectDraftData(projectDraft);
}

function enterStep(stepNumber) {
  const guard = canEnterStep(state, stepNumber);

  if (!guard.allowed) {
    notice = guard.reason;
    render();
    return;
  }

  if (stepNumber === 3) {
    const plan = getAllocationPlan(state.objectives);

    if (!plan.ok) {
      allocationErrors = plan.errors;
      notice = "節數配分無法計算，請回步驟 2 修正授課節數。";
      render();
      return;
    }

    allocationErrors = [];
    dispatchMany([
      { type: "SET_ALLOCATIONS", payload: plan.allocations },
      { type: "GO_TO_STEP", payload: 3 },
    ]);
    return;
  }

  notice = "";
  dispatch({ type: "GO_TO_STEP", payload: stepNumber });
}

function handleProjectSubmit(event) {
  event.preventDefault();
  projectErrors = validateProjectDraft();

  if (Object.keys(projectErrors).length > 0) {
    notice = "請先補齊必填欄位。";
    render();
    return;
  }

  notice = "";
  dispatchMany([
    { type: "SET_PROJECT", payload: normalizeProjectDraft() },
    { type: "GO_TO_STEP", payload: 2 },
  ]);
}

function handleObjectivesNext() {
  const objectives = normalizeObjectives(collectObjectivesFromDom());
  const errors = validateObjectivesForNext(objectives);

  showObjectiveErrors = true;

  if (errors.length > 0) {
    notice = errors[0];
    state = applyAction(state, {
      type: "SET_OBJECTIVES",
      payload: objectives,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    render();
    return;
  }

  const plan = getAllocationPlan(objectives);

  if (!plan.ok) {
    allocationErrors = plan.errors;
    notice = formatUserFacingError(plan.errors[0]);
    state = applyAction(state, {
      type: "SET_OBJECTIVES",
      payload: objectives,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    render();
    return;
  }

  showObjectiveErrors = false;
  allocationErrors = [];
  notice = "";
  const objectiveAllocations = buildDefaultObjectiveAllocations({
    objectives,
    totalScore: 100,
  });
  dispatchMany([
    { type: "SET_OBJECTIVES", payload: objectives },
    { type: "SET_ALLOCATIONS", payload: plan.allocations },
    { type: "SET_OBJECTIVE_ALLOCATIONS", payload: objectiveAllocations },
    { type: "GO_TO_STEP", payload: 3 },
  ]);
}

function handleAllocationsNext() {
  const plan = getAllocationPlan(state.objectives);
  const objectiveAllocations = getEffectiveObjectiveAllocations();
  const validation = validateAllocations({
    objectives: state.objectives,
    allocations: objectiveAllocations,
    totalScore: 100,
  });

  if (!plan.ok) {
    allocationErrors = plan.errors;
    notice = formatUserFacingError(plan.errors[0]);
    render();
    return;
  }

  if (!validation.ok) {
    allocationErrors = validation.errors;
    notice = validation.errors[0];
    render();
    return;
  }

  allocationErrors = [];
  notice = "";
  dispatchMany([
    { type: "SET_ALLOCATIONS", payload: plan.allocations },
    { type: "SET_OBJECTIVE_ALLOCATIONS", payload: objectiveAllocations },
    { type: "GO_TO_STEP", payload: 4 },
  ]);
}

function handleBlueprintNext() {
  const summary = getCurrentSectionSummary();
  const rows = buildBlueprintFromSections(summary);

  showBlueprintErrors = true;

  if (!summary.allMatched) {
    notice =
      summary.errors[0] ??
      "請確認每個大題皆有題型、題數與學習目標，且所有目標都已涵蓋。";
    render();
    return;
  }

  showBlueprintErrors = false;
  notice = "";
  dispatchMany([
    { type: "SET_BLUEPRINT", payload: rows },
    { type: "GO_TO_STEP", payload: 5 },
  ]);
}

function updatePromptPreview() {
  const result = getPromptResult();
  const output = appRoot.querySelector("[data-prompt-output]");
  const status = appRoot.querySelector("[data-copy-status]");

  if (output && result.ok) {
    output.textContent = result.prompt;
  }

  if (status) {
    status.textContent = copyStatus;
  }
}

function updateExtractionPromptPreview() {
  const result = getExtractionPromptResult();
  const output = appRoot.querySelector("[data-extraction-prompt-output]");
  const status = appRoot.querySelector("[data-extraction-copy-status]");

  if (output && result.ok) {
    output.textContent = result.prompt;
  }

  if (status) {
    status.textContent = extractionCopyStatus;
  }
}

async function handleCopyExtractionPrompt() {
  const result = getExtractionPromptResult();

  if (!result.ok) {
    extractionCopyStatus = "擷取指令尚未產生，請先完成試卷基本資料。";
    render();
    return;
  }

  try {
    await navigator.clipboard.writeText(result.prompt);
    extractionCopyStatus = "已複製，請貼到 Claude 或 Gemini。";
  } catch {
    const helper = document.createElement("textarea");
    helper.value = result.prompt;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.inset = "0 auto auto 0";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.focus();
    helper.select();

    const copied = document.execCommand("copy");
    helper.remove();

    extractionCopyStatus = copied
      ? "已複製，請貼到 Claude 或 Gemini。"
      : "無法自動複製，請手動全選複製。";
  }

  updateExtractionPromptPreview();
}

async function handleCopyPrompt() {
  const result = getPromptResult();

  if (!result.ok) {
    copyStatus = "指令尚未產生，請先確認藍圖內容。";
    render();
    return;
  }

  try {
    await navigator.clipboard.writeText(result.prompt);
    copyStatus = "已複製，請貼到外部 AI";
  } catch {
    const helper = document.createElement("textarea");
    helper.value = result.prompt;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.inset = "0 auto auto 0";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.focus();
    helper.select();

    const copied = document.execCommand("copy");
    helper.remove();

    copyStatus = copied
      ? "已複製，請貼到外部 AI"
      : "無法自動複製，請在指令框內手動全選複製。";
  }

  updatePromptPreview();
}

function handlePromptNext() {
  const result = getPromptResult();

  if (!result.ok) {
    notice = formatUserFacingError(result.errors[0] ?? "出題指令尚未產生。");
    render();
    return;
  }

  dispatchMany([
    { type: "SET_PROMPT_GENERATED_AT", payload: new Date().toISOString() },
    { type: "GO_TO_STEP", payload: 7 },
  ]);
}

async function handleStartApiExtraction() {
  if (state.apiBusy) {
    return;
  }

  extractionApiError = "";
  objectiveImportSuccess = "";
  setApiBusy(true);
  render();

  const result = await extractObjectivesViaApi({
    project: state.project,
    materialText: extractionMaterialText,
  });

  if (!result.ok) {
    extractionApiError = result.error;
    setApiBusy(false);
    render();
    return;
  }

  const validationErrors = validateObjectivesForNext(result.objectives);

  if (validationErrors.length > 0) {
    extractionApiError = validationErrors[0];
    setApiBusy(false);
    render();
    return;
  }

  const existing = state.objectives.filter((objective) => !isBlankObjective(objective));
  tsvErrors = [];
  tsvNotices = result.notices ?? [];
  showObjectiveErrors = false;
  objectiveImportSuccess = `已擷取並匯入 ${result.objectives.length} 筆`;
  extractionApiError = "";
  aiExtractionPanelOpen = false;
  clearRenumberFeedback();
  setApiBusy(false);
  dispatch({
    type: "SET_OBJECTIVES",
    payload: [...existing, ...result.objectives],
  });
}

function addExtractionFiles(files) {
  const nextFiles = Array.from(files ?? []);

  if (nextFiles.length === 0) {
    return;
  }

  extractionSelectedFiles = [...extractionSelectedFiles, ...nextFiles];
  extractionFileError = "";
  extractionApiError = "";
  const validation = validateExtractionFiles(extractionSelectedFiles);

  if (!validation.ok) {
    extractionFileError = validation.error;
  }
}

function removeExtractionFile(index) {
  extractionSelectedFiles = extractionSelectedFiles.filter(
    (_file, fileIndex) => fileIndex !== index,
  );
  extractionFileError = "";
  extractionApiError = "";

  if (extractionSelectedFiles.length === 0) {
    return;
  }

  const validation = validateExtractionFiles(extractionSelectedFiles);

  if (!validation.ok) {
    extractionFileError = validation.error;
  }
}

function applyApiObjectivesResult(result, successMessage) {
  const validationErrors = validateObjectivesForNext(result.objectives);

  if (validationErrors.length > 0) {
    extractionApiError = validationErrors[0];
    return false;
  }

  const existing = state.objectives.filter((objective) => !isBlankObjective(objective));
  tsvErrors = [];
  tsvNotices = result.notices ?? [];
  showObjectiveErrors = false;
  objectiveImportSuccess = successMessage;
  extractionApiError = "";
  extractionFileError = "";
  extractionSelectedFiles = [];
  aiExtractionPanelOpen = false;
  clearRenumberFeedback();
  setApiBusy(false);
  dispatch({
    type: "SET_OBJECTIVES",
    payload: [...existing, ...result.objectives],
  });
  return true;
}

async function handleStartFileExtraction() {
  if (state.apiBusy) {
    return;
  }

  const validation = validateExtractionFiles(extractionSelectedFiles);

  if (!validation.ok) {
    extractionFileError = validation.error;
    extractionApiError = "";
    render();
    return;
  }

  extractionFileError = "";
  extractionApiError = "";
  objectiveImportSuccess = "";
  setApiBusy(true);
  render();

  const filesPayload = [];

  try {
    for (const fileEntry of validation.files) {
      const dataUrl = await readFileAsDataUrl(fileEntry.file);
      const fileData = stripBase64DataUrl(dataUrl);
      filesPayload.push({
        mimeType: fileEntry.mimeType,
        data: fileData.data,
      });
    }
  } catch {
    extractionFileError = "無法讀取檔案，請重新選擇後再試。";
    setApiBusy(false);
    render();
    return;
  }

  const result = await extractObjectivesFromFiles({
    project: state.project,
    files: filesPayload,
  });

  if (!result.ok) {
    extractionApiError = result.error;
    setApiBusy(false);
    render();
    return;
  }

  if (!applyApiObjectivesResult(
    result,
    `已擷取並匯入 ${result.objectives.length} 筆`,
  )) {
    setApiBusy(false);
    render();
  }
}

function mergeTypeSuggestionsIntoBlueprintRows(suggestions) {
  const suggestionByObjectiveId = new Map(
    suggestions.map((suggestion) => [suggestion.objectiveId, suggestion]),
  );

  return getBlueprintRows().map((row) => {
    const suggestion = suggestionByObjectiveId.get(row.objectiveId);

    if (!suggestion) {
      return row;
    }

    const recommendedTypes = suggestion.recommendedTypes.filter((questionType) =>
      QUESTION_TYPES.includes(questionType),
    );

    return {
      ...row,
      questionTypes: recommendedTypes.length > 0 ? recommendedTypes : row.questionTypes,
      typeReason: suggestion.reason,
    };
  });
}

async function handleSuggestTypesViaApi() {
  if (state.apiBusy) {
    return;
  }

  typeSuggestionError = "";
  typeSuggestionSuccess = "";
  typeSuggestionProgress = "AI 題型分析中，請稍候…";
  setApiBusy(true);
  render();

  const result = await suggestTypesViaApi({
    project: state.project,
    objectives: state.objectives,
  });

  if (!result.ok) {
    typeSuggestionError = result.error;
    typeSuggestionProgress = "";
    setApiBusy(false);
    render();
    return;
  }

  const rows = mergeTypeSuggestionsIntoBlueprintRows(result.suggestions);
  typeSuggestionProgress = "";
  typeSuggestionSuccess = `已完成 ${result.suggestions.length} 筆題型建議，可依需要微調。`;
  showBlueprintErrors = false;
  setApiBusy(false);
  dispatchMany([
    { type: "SET_TYPE_PLAN_MODE", payload: "ai" },
    { type: "SET_BLUEPRINT", payload: rows },
  ]);
}

async function handlePlanSectionsViaApi() {
  if (state.apiBusy) {
    return;
  }

  if (state.sections.length > 0) {
    const confirmed = window.confirm(
      "這會以 AI 草案取代目前的大題結構，是否繼續？",
    );

    if (!confirmed) {
      return;
    }
  }

  sectionPlanError = "";
  sectionPlanSuccess = "";
  sectionPlanProgress = "AI 規劃中，請稍候…";
  setApiBusy(true);
  render();

  const request = buildSectionPlanRequest({
    project: state.project,
    objectives: state.objectives,
    objectiveAllocations: getEffectiveObjectiveAllocations(),
    preferences: sectionPlanPreferences,
  });
  const result = await planSectionsViaApi(request);

  if (!result.ok) {
    sectionPlanError = result.error;
    sectionPlanProgress = "";
    setApiBusy(false);
    render();
    return;
  }

  const plannedSections = convertPlanSectionsToStateSections({
    planSections: result.plan.sections,
    objectives: state.objectives,
    objectiveAllocations: getEffectiveObjectiveAllocations(),
  });

  if (plannedSections.length === 0) {
    sectionPlanError = "AI 沒有產生可用的大題草案，請重試或手動排大題。";
    sectionPlanProgress = "";
    setApiBusy(false);
    render();
    return;
  }

  sectionPlanProgress = "";
  sectionPlanSuccess = `已產生 ${plannedSections.length} 個大題草案，可在下方微調。`;
  showBlueprintErrors = false;
  setApiBusy(false);
  dispatchMany([
    { type: "SET_TYPE_PLAN_MODE", payload: "ai" },
    { type: "SET_SECTIONS", payload: plannedSections },
  ]);
}

async function handleGenerateItemsViaApiLegacy() {
  if (state.apiBusy) {
    return;
  }

  const promptResult = getPromptResult();

  if (!promptResult.ok) {
    generationApiError = formatUserFacingError(
      promptResult.errors[0] ?? "出題資料尚未完整，請回前一步確認命題藍圖。",
    );
    render();
    return;
  }

  generationApiError = "";
  generationApiSuccess = "";
  setApiBusy(true);
  render();

  const result = await generateItemsViaApi({
    project: state.project,
    objectives: state.objectives,
    blueprint: state.blueprint,
    materialText: state.materialText,
  });

  if (!result.ok) {
    generationApiError = result.error;
    setApiBusy(false);
    render();
    return;
  }

  const validationErrors = getItemValidationErrors(result.items);
  const invalidCount = countInvalidItems(validationErrors);
  itemImportMessage = `已生成 ${result.items.length} 題，請至步驟 6 檢核與編修。`;
  itemImportErrors = validationErrors.map(toTeacherFacingImportText);
  generationApiSuccess = itemImportMessage;
  editingItemIndex = null;
  itemEditErrors = [];
  setApiBusy(false);
  dispatchMany([
    { type: "SET_ITEMS", payload: result.items },
    { type: "SET_PROMPT_GENERATED_AT", payload: new Date().toISOString() },
    { type: "GO_TO_STEP", payload: 6 },
  ]);

  if (invalidCount > 0) {
    notice = `已生成 ${result.items.length} 題，其中 ${invalidCount} 題需要修正。`;
    render();
  }
}

function getObjectivesForSection(section) {
  const objectiveIds = new Set(section.objectiveIds ?? []);

  return state.objectives.filter((objective) => objectiveIds.has(objective.objectiveId));
}

function getPlannedScoreByObjectiveForSection(blueprint, sectionId) {
  const map = new Map();

  blueprint
    .filter((entry) => entry.sectionId === sectionId)
    .forEach((entry) => {
      map.set(
        entry.objectiveId,
        (map.get(entry.objectiveId) ?? 0) + (Number(entry.plannedScore) || 0),
      );
    });

  return map;
}

function normalizeGroupSubItemsForSection(group, section) {
  const allowedObjectiveIds = section.objectiveIds ?? [];

  return group.subItems.map((subItem, index) => {
    const objectiveId = allowedObjectiveIds.includes(subItem.objectiveId)
      ? subItem.objectiveId
      : allowedObjectiveIds[index % Math.max(allowedObjectiveIds.length, 1)] ?? "";

    return {
      ...subItem,
      objectiveId,
      cognitiveLevel: ["提取", "推論", "整合", "評估"].includes(subItem.cognitiveLevel)
        ? subItem.cognitiveLevel
        : ["提取", "推論", "整合", "評估"][index % 4],
    };
  });
}

function convertGeneratedGroupToItems({
  group,
  section,
  generationBlueprint,
  groupIndex,
}) {
  const subItems = normalizeGroupSubItemsForSection(group, section);
  const plannedScoreByObjective = getPlannedScoreByObjectiveForSection(
    generationBlueprint,
    section.sectionId,
  );
  const countByObjective = new Map();

  subItems.forEach((subItem) => {
    countByObjective.set(
      subItem.objectiveId,
      (countByObjective.get(subItem.objectiveId) ?? 0) + 1,
    );
  });
  const scoreQueuesByObjective = new Map();
  const usedScoreCountByObjective = new Map();

  countByObjective.forEach((count, objectiveId) => {
    const targetScore = plannedScoreByObjective.get(objectiveId) ?? 0;
    scoreQueuesByObjective.set(
      objectiveId,
      distributeIntegerScores(targetScore, count),
    );
  });

  const groupId = `G-${String(groupIndex + 1).padStart(2, "0")}-${section.sectionId}`;
  const stimulus = group.stimulus ?? "";

  return subItems.map((subItem, index) => {
    const targetScore = plannedScoreByObjective.get(subItem.objectiveId) ?? 0;
    const count = countByObjective.get(subItem.objectiveId) ?? 1;
    const usedCount = usedScoreCountByObjective.get(subItem.objectiveId) ?? 0;
    const scoreQueue = scoreQueuesByObjective.get(subItem.objectiveId) ?? [];
    const score = scoreQueue[usedCount] ?? targetScore / count;

    usedScoreCountByObjective.set(subItem.objectiveId, usedCount + 1);

    return {
      itemId: `${groupId}-${index + 1}`,
      groupId,
      sectionId: section.sectionId,
      questionType: subItem.questionType || "選擇題",
      competencyType: "素養題組",
      stimulus,
      stimulusTitle: group.stimulusTitle ?? "",
      question: subItem.question ?? "",
      options: Array.isArray(subItem.options) ? subItem.options : [],
      answer: subItem.answer ?? "",
      explanation: subItem.explanation ?? "",
      objectiveIds: subItem.objectiveId ? [subItem.objectiveId] : [],
      score,
      estimatedTimeSeconds: 90,
      discriminationPrediction: 0.3,
      chineseDimension: null,
      cognitiveLevel: subItem.cognitiveLevel,
      reviewFlags: [],
    };
  });
}

async function handleGenerateItemsViaApi() {
  if (state.apiBusy) {
    return;
  }

  const sectionSummary = getCurrentSectionSummary();
  const generationBlueprint = buildBlueprintFromSections(sectionSummary);

  if (!sectionSummary.allMatched || generationBlueprint.length === 0) {
    generationApiError =
      sectionSummary.errors[0] ?? "請先完成步驟 4 的卷結構規劃。";
    render();
    return;
  }

  const batchPlan = planItemBatches({
    objectives: state.objectives,
    blueprint: generationBlueprint,
    sections: sectionSummary.sectionSummaries,
    perObjective: state.candidatesPerObjective,
  });

  if (!batchPlan.ok) {
    generationApiError = formatUserFacingError(
      batchPlan.errors[0] ?? "無法規劃生成批次，請先檢查題型規劃。",
    );
    render();
    return;
  }

  generationApiError = "";
  generationApiSuccess = "";
  generationApiProgress = "";
  setApiBusy(true);
  render();

  const successfulBatchResults = [];
  const totalBatches = batchPlan.batches.length;
  const groupSections = sectionSummary.sectionSummaries.filter(
    (section) => section.kind === "group",
  );
  const totalWorkCount = totalBatches + groupSections.length;
  let workIndex = 0;

  for (const [groupIndex, section] of groupSections.entries()) {
    generationApiProgress = `正在生成第 ${workIndex + 1}／共 ${totalWorkCount} 批（題組：${section.title}）`;
    render();

    const result = await generateGroupViaApi({
      project: state.project,
      textMode: section.textMode,
      providedText: section.providedText,
      topicHint: section.topicHint,
      objectives: getObjectivesForSection(section),
      subCount: section.subCount,
    });

    if (!result.ok) {
      const partialMerge = mergeItemBatches(successfulBatchResults);
      const completedItems = partialMerge.ok ? partialMerge.items : [];

      if (completedItems.length > 0) {
        state = applyAction(state, {
          type: "SET_CANDIDATE_POOL",
          payload: completedItems,
          updatedAt: new Date().toISOString(),
        });
        saveState();
      }

      generationApiError = `題組「${section.title}」生成失敗：${result.error}。已完成 ${completedItems.length} 題，可重試或改用手動補齊。`;
      generationApiProgress = "";
      setApiBusy(false);
      render();
      return;
    }

    successfulBatchResults.push({
      items: convertGeneratedGroupToItems({
        group: result.group,
        section,
        generationBlueprint,
        groupIndex,
      }),
    });
    workIndex += 1;
  }

  for (const [index, batch] of batchPlan.batches.entries()) {
    generationApiProgress = `正在生成第 ${workIndex + 1}／共 ${totalWorkCount} 批（大題：${batch.sectionTitle || batch.unitName}）`;
    render();

    const result = await generateItemsViaApi({
      project: state.project,
      objectives: batch.objectives,
      blueprint: batch.blueprint,
      materialText: "",
      perObjective: batch.perObjective,
      requestedItemCount: batch.requestedItemCount,
    });

    if (!result.ok) {
      const partialMerge = mergeItemBatches(successfulBatchResults);
      const completedItems = partialMerge.ok ? partialMerge.items : [];

      if (completedItems.length > 0) {
        state = applyAction(state, {
          type: "SET_CANDIDATE_POOL",
          payload: completedItems,
          updatedAt: new Date().toISOString(),
        });
        saveState();
      }

      generationApiError = `第 ${index + 1} 批（大題：${batch.sectionTitle || batch.unitName}）失敗：${result.error}。已完成 ${completedItems.length} 題，可改用手動補齊。`;
      generationApiProgress = "";
      setApiBusy(false);
      render();
      return;
    }

    successfulBatchResults.push({
      items: result.items.map((item) => ({
        ...item,
        sectionId: batch.sectionId,
      })),
    });
    workIndex += 1;
  }

  const merged = mergeItemBatches(successfulBatchResults);

  if (!merged.ok) {
    generationApiError = merged.errors[0] ?? "備選題合併失敗，請改用手動出題指令。";
    generationApiProgress = "";
    setApiBusy(false);
    render();
    return;
  }

  const validationErrors = getItemValidationErrors(merged.items);
  const invalidCount = countInvalidItems(validationErrors);
  itemImportMessage = `已生成 ${merged.items.length} 題備選題，請至步驟 6 選題組卷。`;
  itemImportErrors = validationErrors.map(toTeacherFacingImportText);
  generationApiSuccess = itemImportMessage;
  notice = `已生成 ${merged.items.length} 題備選題。`;
  generationApiProgress = "";
  editingItemIndex = null;
  itemEditErrors = [];
  setApiBusy(false);
  dispatchMany([
    { type: "SET_BLUEPRINT", payload: generationBlueprint },
    { type: "SET_CANDIDATE_POOL", payload: merged.items },
    { type: "GO_TO_STEP", payload: 6 },
  ]);

  if (invalidCount > 0) {
    notice = `已生成 ${merged.items.length} 題，其中 ${invalidCount} 題需要修正。`;
    render();
  }
}

function handleToggleCandidateSelection(candidateId, selected) {
  const nextPool = applyCandidateSelection(state.candidatePool, candidateId, selected);

  dispatch({
    type: "SET_CANDIDATE_POOL",
    payload: nextPool,
  });
}

function handleConfirmSelection() {
  const summary = summarizeCandidateSelection({
    objectives: state.objectives,
    blueprint: state.blueprint,
    candidatePool: state.candidatePool,
    sections: state.sections,
  });

  if (!summary.allMatched) {
    notice = summary.errors[0] ?? "請先完成選題配分。";
    render();
    return;
  }

  itemImportMessage = `已選入 ${summary.selectedItems.length} 題，請執行審題檢核。`;
  itemImportErrors = getItemValidationErrors(summary.selectedItems).map(
    toTeacherFacingImportText,
  );
  notice = `已選入 ${summary.selectedItems.length} 題，請執行審題檢核。`;
  dispatchMany([
    { type: "SET_ITEMS", payload: summary.selectedItems },
    { type: "GO_TO_STEP", payload: 7 },
  ]);
}

function handleParseItems() {
  const input = appRoot.querySelector("[data-items-json]");
  itemsJsonText = input?.value ?? "";

  if (state.items.length > 0) {
    const firstConfirm = window.confirm("重新貼入會覆蓋目前題庫，確定要繼續嗎？");

    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm("覆蓋後原本編修內容將被取代，請再次確認。");

    if (!secondConfirm) {
      return;
    }
  }

  const result = parseItemsJson(itemsJsonText);

  if (result.items.length === 0) {
    itemImportMessage = "讀不到題庫資料，可能是複製不完整。請回到 AI 對話，將回覆全部選取複製後重貼。";
    itemImportErrors = result.errors.map(toTeacherFacingImportText);
    render();
    return;
  }

  const validationErrors = getItemValidationErrors(result.items);
  const invalidCount = countInvalidItems(validationErrors);
  itemImportMessage = `成功讀入 ${result.items.length} 題（其中 ${invalidCount} 題需要修正）。`;
  itemImportErrors = validationErrors.map(toTeacherFacingImportText);
  editingItemIndex = null;
  itemEditErrors = [];
  dispatch({ type: "SET_ITEMS", payload: result.items });
}

function parseNumberField(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

function collectEditedItem(form, originalItem) {
  const optionsText = form.querySelector("[data-edit-field='options']")?.value ?? "";
  const objectiveIdsText =
    form.querySelector("[data-edit-field='objectiveIds']")?.value ?? "";
  const discriminationValue =
    form.querySelector("[data-edit-field='discriminationPrediction']")?.value ?? "";

  return {
    ...originalItem,
    question: form.querySelector("[data-edit-field='question']")?.value.trim() ?? "",
    options: optionsText
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean),
    answer: form.querySelector("[data-edit-field='answer']")?.value.trim() ?? "",
    explanation:
      form.querySelector("[data-edit-field='explanation']")?.value.trim() ?? "",
    score: parseNumberField(form.querySelector("[data-edit-field='score']")?.value),
    objectiveIds: objectiveIdsText
      .split(/[,，]/)
      .map((objectiveId) => objectiveId.trim())
      .filter(Boolean),
    estimatedTimeSeconds: parseNumberField(
      form.querySelector("[data-edit-field='estimatedTimeSeconds']")?.value,
    ),
    discriminationPrediction:
      String(discriminationValue).trim() === ""
        ? undefined
        : Number(discriminationValue),
    chineseDimension: isChineseProject()
      ? form.querySelector("[data-edit-field='chineseDimension']")?.value ?? ""
      : (originalItem.chineseDimension ?? null),
  };
}

function handleItemEditSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const itemIndex = Number(form.dataset.itemEditForm);
  const originalItem = state.items[itemIndex];
  const editedItem = collectEditedItem(form, originalItem);
  const result = validateItemForUi(editedItem, { isChinese: isChineseProject() });

  if (!result.valid) {
    itemEditErrors = result.errors;
    render();
    return;
  }

  const nextItems = state.items.map((item, index) =>
    index === itemIndex ? editedItem : item,
  );
  itemEditErrors = [];
  editingItemIndex = null;
  dispatch({ type: "SET_ITEMS", payload: nextItems });
}

function handleDeleteItem(itemIndex) {
  const item = state.items[itemIndex];
  const firstConfirm = window.confirm(`確定要刪除 ${item?.itemId ?? `第 ${itemIndex + 1} 題`} 嗎？`);

  if (!firstConfirm) {
    return;
  }

  dispatch({
    type: "SET_ITEMS",
    payload: state.items.filter((_, index) => index !== itemIndex),
  });
}

function handleRunAudit() {
  notice = "檢核中…";
  render();

  const auditProject = state.project
    ? {
        ...state.project,
        subject: getCanonicalSubjectLabel(state.project.subject),
      }
    : state.project;
  const report = adaptFlexibleScoringReport(auditExam({
    project: auditProject,
    allocations: getActualUnitAllocations(),
    objectives: state.objectives,
    items: normalizeItemsForAudit(state.items),
  }));
  const sectionCount = Object.values(report.sections ?? {}).filter(
    (section) => section?.severity === "warning",
  ).length;
  const errorCount = Object.values(report.sections ?? {}).filter(
    (section) => section?.severity === "error",
  ).length;

  notice = `✅ 檢核完成：${sectionCount} 項警告、${errorCount} 項錯誤。`;
  dispatch({ type: "SET_AUDIT_REPORT", payload: report });
  requestAnimationFrame(() => {
    appRoot.querySelector("[data-audit-report]")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function adaptFlexibleScoringReport(report) {
  if (!report || typeof report !== "object") {
    return report;
  }

  const sections = report.sections ?? {};
  const coveragePass = sections.coverage?.severity === "pass";
  const scoresPass = sections.scores?.severity === "pass";
  const nextChecklist = Array.isArray(report.checklistSuggestions)
    ? report.checklistSuggestions.map((item) =>
        item.key === "objective_alignment" && coveragePass && scoresPass
          ? {
              ...item,
              suggested: true,
              reason:
                "學習目標已完成覆蓋，且 UI 層實際配分合計為 100；節數比例建議已作為參考提醒呈現。",
            }
          : item,
      )
    : report.checklistSuggestions;

  return {
    ...report,
    checklistSuggestions: nextChecklist,
  };
}

function handleConfirmRenumberObjectives() {
  const objectives = normalizeObjectives(collectObjectivesFromDom());
  const result = renumberObjectives(objectives);

  if ((result.errors ?? []).length > 0) {
    notice = formatUserFacingError(result.errors[0]);
    renumberDialogOpen = false;
    clearRenumberFeedback();
    render();
    return;
  }

  state = applyAction(state, {
    type: "RENUMBER_OBJECTIVES",
    payload: result,
    updatedAt: new Date().toISOString(),
  });
  saveState();
  notice = "";
  showObjectiveErrors = false;
  renumberDialogOpen = false;
  objectiveImportSuccess = "";
  renumberSuccess = `已重新編號 ${result.objectives.length} 筆`;
  renumberNotices = result.notices ?? [];
  renumberMappingRows = Object.entries(result.mapping ?? {}).map(([oldId, newId]) => ({
    oldId,
    newId,
  }));
  render();
}

async function handleClick(event) {
  const stepButton = event.target.closest("[data-step]");
  const actionButton = event.target.closest("[data-action]");

  if (stepButton) {
    enterStep(Number(stepButton.dataset.step));
    return;
  }

  if (!actionButton) {
    if (event.target.matches("[data-objective-dialog]")) {
      closeObjectiveDialog(event.target.dataset.objectiveDialog);
      render();
    }
    if (event.target.matches("[data-renumber-dialog]")) {
      closeRenumberDialog();
      render();
    }
    return;
  }

  const action = actionButton.dataset.action;

  if (action === "resume-draft") {
    state = pendingDraft;
    pendingDraft = null;
    syncProjectDraftFromState();
    notice = "已載入上次未完成的試卷草稿。";
    saveState();
    render();
    return;
  }

  if (action === "discard-draft") {
    localStorage.removeItem(STORAGE_KEY);
    pendingDraft = null;
    state = createInitialState();
    syncProjectDraftFromState();
    notice = "已捨棄上次未完成的試卷草稿。";
    render();
    return;
  }

  if (action === "clear-data") {
    clearDraftAndReload();
    return;
  }

  if (action === "open-print-view") {
    activePrintView = actionButton.dataset.printView;
    render();
    return;
  }

  if (action === "close-print-view") {
    activePrintView = null;
    render();
    return;
  }

  if (action === "print-current-view") {
    window.print();
    return;
  }

  if (action === "go-step") {
    enterStep(Number(actionButton.dataset.targetStep));
    return;
  }

  if (action === "add-objective-row") {
    clearRenumberFeedback();
    dispatch({
      type: "SET_OBJECTIVES",
      payload: [...state.objectives, createBlankObjective()],
    });
    return;
  }

  if (action === "delete-objective-row") {
    const rowIndex = Number(actionButton.dataset.row);
    clearRenumberFeedback();
    dispatch({
      type: "SET_OBJECTIVES",
      payload: state.objectives.filter((_, index) => index !== rowIndex),
    });
    return;
  }

  if (action === "open-objective-dialog") {
    const dialogName = actionButton.dataset.dialog;
    pastePanelOpen = dialogName === "paste";
    aiExtractionPanelOpen = dialogName === "ai-extraction";
    tsvErrors = [];
    extractionApiError = "";
    extractionFileError = "";
    extractionCopyStatus = "";
    render();
    return;
  }

  if (action === "close-objective-dialog") {
    const dialog = actionButton.closest("[data-objective-dialog]");
    closeObjectiveDialog(dialog?.dataset.objectiveDialog);
    render();
    return;
  }

  if (action === "open-renumber-dialog") {
    renumberDialogOpen = true;
    render();
    return;
  }

  if (action === "close-renumber-dialog") {
    closeRenumberDialog();
    render();
    return;
  }

  if (action === "confirm-renumber-objectives") {
    handleConfirmRenumberObjectives();
    return;
  }

  if (action === "import-objectives") {
    const input = appRoot.querySelector("[data-tsv-input]");
    tsvText = input?.value ?? "";
    const result = parseObjectivesTsv(tsvText);
    tsvErrors = result.errors;
    tsvNotices = result.notices ?? [];

    if (result.objectives.length > 0) {
      const existing = state.objectives.filter((objective) => !isBlankObjective(objective));
      state = applyAction(state, {
        type: "SET_OBJECTIVES",
        payload: [...existing, ...result.objectives],
        updatedAt: new Date().toISOString(),
      });
      saveState();
    }

    notice =
      result.objectives.length > 0
        ? `已匯入 ${result.objectives.length} 筆學習目標。`
        : "未匯入任何學習目標。";
    if (result.errors.length === 0 && result.objectives.length > 0) {
      objectiveImportSuccess = `已匯入 ${result.objectives.length} 筆`;
      clearRenumberFeedback();
      pastePanelOpen = false;
      aiExtractionPanelOpen = false;
      notice = "";
    } else {
      objectiveImportSuccess = "";
      pastePanelOpen = pastePanelOpen || !aiExtractionPanelOpen;
    }
    showObjectiveErrors = result.errors.length > 0;
    render();
    return;
  }

  if (action === "objectives-next") {
    handleObjectivesNext();
    return;
  }

  if (action === "allocations-next") {
    handleAllocationsNext();
    return;
  }

  if (action === "set-type-plan-mode") {
    typeSuggestionError = "";
    typeSuggestionSuccess = "";
    typeSuggestionProgress = "";
    dispatch({
      type: "SET_TYPE_PLAN_MODE",
      payload: actionButton.dataset.mode,
    });
    return;
  }

  if (action === "add-section") {
    showBlueprintErrors = false;
    dispatch({ type: "ADD_SECTION" });
    return;
  }

  if (action === "remove-section") {
    const confirmed = window.confirm("確定要刪除此大題嗎？已生成的備選題也會需要重新產生。");

    if (!confirmed) {
      return;
    }

    dispatch({
      type: "REMOVE_SECTION",
      payload: actionButton.dataset.sectionId,
    });
    return;
  }

  if (action === "reorder-section") {
    dispatch({
      type: "REORDER_SECTION",
      payload: {
        sectionId: actionButton.dataset.sectionId,
        direction: actionButton.dataset.direction,
      },
    });
    return;
  }

  if (action === "blueprint-next") {
    handleBlueprintNext();
    return;
  }

  if (action === "scroll-first-section-error") {
    const target = appRoot.querySelector("[data-section-has-error=\"true\"]");
    target?.scrollIntoView({ block: "center" });
    return;
  }

  if (action === "copy-prompt") {
    await handleCopyPrompt();
    return;
  }

  if (action === "copy-extraction-prompt") {
    await handleCopyExtractionPrompt();
    return;
  }

  if (action === "start-api-extraction") {
    await handleStartApiExtraction();
    return;
  }

  if (action === "start-file-extraction") {
    await handleStartFileExtraction();
    return;
  }

  if (action === "remove-extraction-file") {
    removeExtractionFile(Number(actionButton.dataset.fileIndex));
    render();
    return;
  }

  if (action === "suggest-types-api") {
    await handleSuggestTypesViaApi();
    return;
  }

  if (action === "plan-sections-api") {
    await handlePlanSectionsViaApi();
    return;
  }

  if (action === "generate-items-api") {
    await handleGenerateItemsViaApi();
    return;
  }

  if (action === "toggle-candidate-selection") {
    handleToggleCandidateSelection(
      actionButton.dataset.candidateId,
      actionButton.checked === true,
    );
    return;
  }

  if (action === "confirm-selection") {
    handleConfirmSelection();
    return;
  }

  if (action === "prompt-next") {
    handlePromptNext();
    return;
  }

  if (action === "parse-items") {
    handleParseItems();
    return;
  }

  if (action === "edit-item") {
    editingItemIndex = Number(actionButton.dataset.itemIndex);
    itemEditErrors = [];
    render();
    return;
  }

  if (action === "cancel-edit-item") {
    editingItemIndex = null;
    itemEditErrors = [];
    render();
    return;
  }

  if (action === "delete-item") {
    handleDeleteItem(Number(actionButton.dataset.itemIndex));
    return;
  }

  if (action === "run-audit") {
    handleRunAudit();
  }
}

function handleInput(event) {
  const projectField = event.target.closest("[data-project-field]");
  const objectiveField = event.target.closest("[data-objective-field]");
  const objectiveAllocationField = event.target.closest("[data-objective-allocation]");
  const sectionField = event.target.closest("[data-section-field]");
  const sectionObjectiveField = event.target.closest("[data-section-objective]");
  const sectionPlanField = event.target.closest("[data-section-plan-field]");
  const sectionPlanType = event.target.closest("[data-section-plan-type]");
  const blueprintField = event.target.closest("[data-blueprint-field], [data-blueprint-type]");
  const tsvInput = event.target.closest("[data-tsv-input]");
  const extractionFileInput = event.target.closest("[data-extraction-file]");
  const extractionMaterialInput = event.target.closest("[data-extraction-material-text]");
  const materialTextInput = event.target.closest("[data-material-text]");
  const candidatesPerObjectiveInput = event.target.closest("[data-candidates-per-objective]");
  const groupItemScoreInput = event.target.closest("[data-group-item-score]");
  const itemsJsonInput = event.target.closest("[data-items-json]");

  if (projectField) {
    projectDraft[projectField.name] = projectField.value;

    if (projectField.name === "subject" || projectField.name === "version") {
      if (projectField.name === "version" && projectField.value !== "其他") {
        projectDraft.versionOther = "";
        projectDraft.publisherOther = "";
      }
      render();
    }
    return;
  }

  if (objectiveField) {
    const row = objectiveField.closest("[data-objective-row]");
    const rowIndex = Number(row.dataset.objectiveRow);
    const nextObjectives = [...getObjectiveRows()];
    nextObjectives[rowIndex] = {
      ...nextObjectives[rowIndex],
      [objectiveField.dataset.objectiveField]: objectiveField.value,
    };
    state = applyAction(state, {
      type: "SET_OBJECTIVES",
      payload: nextObjectives,
      updatedAt: new Date().toISOString(),
    });
    clearRenumberFeedback();
    saveState();
    return;
  }

  if (objectiveAllocationField) {
    const objectiveId = objectiveAllocationField.dataset.objectiveId;
    const nextAllocations = getEffectiveObjectiveAllocations().map((allocation) =>
      allocation.objectiveId === objectiveId
        ? {
            ...allocation,
            actualScore: Number(objectiveAllocationField.value),
          }
        : allocation,
    );

    allocationErrors = [];
    state = applyAction(state, {
      type: "SET_OBJECTIVE_ALLOCATIONS",
      payload: nextAllocations,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    render();
    return;
  }

  if (sectionField) {
    const field = sectionField.dataset.sectionField;
    const numericFields = new Set(["plannedCount", "subCount"]);
    const value = numericFields.has(field) ? Number(sectionField.value) : sectionField.value;
    const payload = {
      sectionId: sectionField.dataset.sectionId,
      [field]: value,
    };

    if (field === "kind" && value === "group") {
      payload.questionType = "題組";
      payload.subCount = 3;
      payload.plannedCount = 3;
    }

    if (field === "kind" && value === "normal") {
      payload.questionType = "選擇題";
      payload.textMode = "ai";
    }

    if (field === "subCount") {
      payload.plannedCount = value;
    }

    const action = {
      type: "UPDATE_SECTION",
      payload,
      updatedAt: new Date().toISOString(),
    };

    showBlueprintErrors = false;

    if (
      ["plannedCount", "subCount", "providedText", "topicHint"].includes(field) &&
      event.type === "input"
    ) {
      state = applyAction(state, action);
      saveState();
      return;
    }

    dispatch(action);
    return;
  }

  if (sectionObjectiveField) {
    const sectionId = sectionObjectiveField.dataset.sectionId;
    const section = state.sections.find((entry) => entry.sectionId === sectionId);

    if (!section) {
      return;
    }

    const objectiveId = sectionObjectiveField.value;
    const objectiveIds = new Set(section.objectiveIds ?? []);

    if (sectionObjectiveField.checked) {
      objectiveIds.add(objectiveId);
    } else {
      objectiveIds.delete(objectiveId);
    }

    showBlueprintErrors = false;
    dispatch({
      type: "UPDATE_SECTION",
      payload: {
        sectionId,
        objectiveIds: [...objectiveIds],
      },
    });
    return;
  }

  if (sectionPlanField) {
    const field = sectionPlanField.dataset.sectionPlanField;
    sectionPlanPreferences = {
      ...sectionPlanPreferences,
      [field]:
        sectionPlanField.type === "checkbox"
          ? sectionPlanField.checked
          : sectionPlanField.value,
    };
    sectionPlanError = "";
    sectionPlanSuccess = "";
    return;
  }

  if (sectionPlanType) {
    const preferredTypes = new Set(sectionPlanPreferences.preferredTypes);

    if (sectionPlanType.checked) {
      preferredTypes.add(sectionPlanType.value);
    } else {
      preferredTypes.delete(sectionPlanType.value);
    }

    sectionPlanPreferences = {
      ...sectionPlanPreferences,
      preferredTypes: [...preferredTypes],
    };
    sectionPlanError = "";
    sectionPlanSuccess = "";
    return;
  }

  if (blueprintField) {
    const rows = collectBlueprintFromDom();
    state = applyAction(state, {
      type: "SET_BLUEPRINT",
      payload: rows,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    copyStatus = "";
    if (blueprintField.matches("[data-blueprint-type]") || event.type === "change") {
      render();
    } else {
      updateBlueprintInlineValidation();
    }
    return;
  }

  if (tsvInput) {
    tsvText = tsvInput.value;
    tsvNotices = [];
    return;
  }

  if (extractionFileInput) {
    addExtractionFiles(extractionFileInput.files);
    render();
    return;
  }

  if (extractionMaterialInput) {
    extractionMaterialText = extractionMaterialInput.value;
    extractionApiError = "";
    return;
  }

  if (materialTextInput) {
    copyStatus = "";
    state = applyAction(state, {
      type: "SET_MATERIAL_TEXT",
      payload: materialTextInput.value,
      updatedAt: new Date().toISOString(),
    });
    state = applyAction(state, {
      type: "SET_PROMPT_GENERATED_AT",
      payload: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    saveState();
    updatePromptPreview();
    return;
  }

  if (candidatesPerObjectiveInput) {
    state = applyAction(state, {
      type: "SET_CANDIDATES_PER_OBJECTIVE",
      payload: candidatesPerObjectiveInput.value,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    return;
  }

  if (groupItemScoreInput) {
    const candidateId = groupItemScoreInput.dataset.candidateId;
    const nextPool = state.candidatePool.map((item) =>
      item.itemId === candidateId
        ? {
            ...item,
            score: Number(groupItemScoreInput.value),
            scoreManual: true,
          }
        : item,
    );

    state = applyAction(state, {
      type: "SET_CANDIDATE_POOL",
      payload: nextPool,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    render();
    return;
  }

  if (itemsJsonInput) {
    itemsJsonText = itemsJsonInput.value;
  }
}

function handleSubmit(event) {
  if (event.target.matches('[data-form="project"]')) {
    handleProjectSubmit(event);
    return;
  }

  if (event.target.matches("[data-item-edit-form]")) {
    handleItemEditSubmit(event);
  }
}

function handleDialogClose(event) {
  if (event.target.matches("[data-objective-dialog]")) {
    closeObjectiveDialog(event.target.dataset.objectiveDialog);
    render();
    return;
  }

  if (event.target.matches("[data-renumber-dialog]")) {
    closeRenumberDialog();
    render();
  }
}

function handleDragOver(event) {
  if (!event.target.closest("[data-extraction-file-drop]")) {
    return;
  }

  event.preventDefault();
}

function handleDrop(event) {
  if (!event.target.closest("[data-extraction-file-drop]")) {
    return;
  }

  event.preventDefault();
  addExtractionFiles(event.dataTransfer?.files);
  render();
}

loadDraft();
syncProjectDraftFromState();
render();
appRoot.addEventListener("click", handleClick);
appRoot.addEventListener("input", handleInput);
appRoot.addEventListener("change", handleInput);
appRoot.addEventListener("submit", handleSubmit);
appRoot.addEventListener("close", handleDialogClose, true);
appRoot.addEventListener("dragover", handleDragOver);
appRoot.addEventListener("drop", handleDrop);

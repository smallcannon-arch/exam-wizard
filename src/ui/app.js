import { allocateScores } from "../core/allocateScores.js";
import { auditExam } from "../core/auditExam.js";
import { buildObjectiveExtractionPrompt } from "../core/buildExtractionPrompt.js";
import { buildItemGenerationPrompt, parseItemsJson } from "../core/buildPrompt.js";
import { validateItem, validateObjective } from "../core/schemas.js";
import { isApiAvailable } from "./apiConfig.js";
import { extractObjectivesViaApi, generateItemsViaApi } from "./apiClient.js";
import { buildPrintData } from "./buildPrintData.js";
import { replaceFieldLabels } from "./fieldLabels.js";
import { groupItemsByGroup } from "./groupItemsByGroup.js";
import { groupObjectivesToUnits } from "./groupObjectivesToUnits.js";
import { parseObjectivesTsv } from "./parseObjectivesTsv.js";
import { renumberObjectives } from "./renumberObjectives.js";
import { summarizeBlueprint } from "./summarizeBlueprint.js";
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
const VERSION_OPTIONS = ["翰林", "康軒", "南一", "自編教材", "其他"];
const CHINESE_DIMENSION_OPTIONS = [
  ["", "請選擇"],
  ["word_phrase", "字詞短語"],
  ["sentence_grammar", "句式語法"],
  ["reading_writing", "段篇讀寫"],
];
const appRoot = document.querySelector("[data-app]");
const defaultProjectDraft = {
  schoolYear: "114",
  semester: "1",
  examNumber: "1",
  grade: "",
  subject: "",
  version: "翰林",
  versionOther: "",
  publisher: "",
  publisherOther: "",
  scope: "",
  teacher: "",
};

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
let objectiveImportSuccess = "";
let renumberDialogOpen = false;
let renumberSuccess = "";
let renumberNotices = [];
let renumberMappingRows = [];
let allocationErrors = [];
let showBlueprintErrors = false;
let copyStatus = "";
let extractionCopyStatus = "";
let generationApiError = "";
let generationApiSuccess = "";
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
  applyAndSave(action);
  render();
}

function dispatchMany(actions) {
  actions.forEach((action) => applyAndSave(action));
  render();
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
  const isChinese = projectDraft.subject === "國語";
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
  return buildObjectiveExtractionPrompt({
    project: state.project ?? {},
  });
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

  return `
    <dialog class="modal-dialog ai-extraction-panel" data-objective-dialog="ai-extraction" aria-labelledby="ai-extraction-title">
      <header class="modal-dialog__header">
        <h3 id="ai-extraction-title">AI 擷取學習目標</h3>
        <button class="icon-button" type="button" data-action="close-objective-dialog" aria-label="關閉">×</button>
      </header>
      <div class="modal-dialog__body">
        ${apiAvailable ? `
          <section class="api-mode-block">
            <h4>一鍵擷取</h4>
            <p class="hint-text">貼入教案或課文重點，按「開始擷取」，系統會自動整理出學習目標。擷取結果僅供參考，匯入後請逐筆核對。</p>
            <label>
              <span>教材文字</span>
              <textarea data-extraction-material-text rows="8" placeholder="可貼入教案中的學習目標段落、課文重點或教師整理摘要。">${escapeHtml(extractionMaterialText)}</textarea>
            </label>
            ${extractionApiError ? `<p class="field-error">${escapeHtml(extractionApiError)} 可改用下方「手動貼回」。</p>` : ""}
            ${apiBusy ? `<p class="notice notice--inline">擷取中，請稍候…</p>` : ""}
            <div class="step-actions">
              <button class="button" type="button" data-action="start-api-extraction" ${apiBusy ? "disabled" : ""}>開始擷取</button>
            </div>
          </section>
        ` : ""}
        <section class="api-mode-block">
          <h4>手動貼回</h4>
          <ol class="instruction-list">
            <li>複製下方指令。</li>
            <li>開啟 Claude 或 Gemini，上傳教案 PDF 並貼上指令。</li>
            <li>將 AI 回覆整段貼回下方欄位，再按「匯入」。</li>
          </ol>
          ${result.ok ? `
            <div class="prompt-toolbar">
              <button class="button" type="button" data-action="copy-extraction-prompt">複製指令</button>
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
            <button class="button" type="button" data-action="import-objectives">匯入</button>
          </div>
        </section>
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

function formatFormula(unit, allocation, totalPeriods) {
  const rawScore = 100 * (unit.periodCount / totalPeriods);

  return `${unit.periodCount} 節 ÷ ${totalPeriods} 節 × 100 ＝ ${rawScore.toFixed(1)} → ${allocation.suggestedScore} 分`;
}

function renderAllocationsStep() {
  const plan = getAllocationPlan(state.objectives);
  const totalPeriods = plan.units.reduce((sum, unit) => sum + unit.periodCount, 0);
  const totalScore = plan.allocations.reduce(
    (sum, allocation) => sum + allocation.suggestedScore,
    0,
  );

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">③節數配分</h2>
      ${allocationErrors.length > 0 ? `<ul class="row-errors">${allocationErrors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>` : ""}
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
      ` : `<ul class="row-errors">${plan.errors.map((error) => `<li>${escapeHtml(formatUserFacingError(error))}</li>`).join("")}</ul>`}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="2">上一步</button>
        <button class="button" type="button" data-action="allocations-next" ${plan.ok ? "" : "disabled"}>下一步</button>
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

function renderBlueprintStep() {
  const rows = getBlueprintRows();
  const summary = summarizeBlueprint(state.allocations, normalizeBlueprintForSubmit(rows));
  const rowsByObjectiveId = new Map(rows.map((row, index) => [row.objectiveId, { row, index }]));

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">④命題藍圖</h2>
      ${summary.errors.length > 0 ? `<ul class="row-errors">${summary.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""}
      ${state.allocations.map((allocation) => {
        const unitObjectives = state.objectives.filter(
          (objective) => objective.unitName === allocation.name,
        );
        const unitSummary = summary.unitSummaries.find(
          (entry) => entry.unitName === allocation.name,
        );

        return `
          <section class="blueprint-unit" aria-label="${escapeHtml(allocation.name)}">
            <h3>${escapeHtml(allocation.name)}</h3>
            <div class="table-scroll">
              <table class="data-table blueprint-table">
                <colgroup>
                  <col>
                  <col>
                  <col class="blueprint-table__type">
                  <col class="blueprint-table__score">
                  <col>
                </colgroup>
                <thead>
                  <tr>
                    <th>目標編號</th>
                    <th>目標文字</th>
                    <th>題型</th>
                    <th>本目標總配分</th>
                    <th>
                      題組規劃（選填）
                      <span class="help-tip" tabindex="0" data-tooltip="想讓 AI 把多個目標出成同一個情境題組時，在相關目標的此欄寫下說明。內容會放進步驟 5 的出題指令，AI 會依此設計題組。留空則由 AI 自行決定是否使用題組。">?</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${unitObjectives.map((objective) => {
                    const entry = rowsByObjectiveId.get(objective.objectiveId);
                    const row = entry.row;
                    const rowIssues = getBlueprintEntryIssues(row);
                    const showIssues = showBlueprintErrors || rowIssues.length > 0;

                    return `
                      <tr
                        class="${showIssues && rowIssues.length > 0 ? "blueprint-row--invalid" : ""}"
                        data-blueprint-row="${entry.index}"
                        data-objective-id="${escapeHtml(row.objectiveId)}"
                        data-unit-name="${escapeHtml(row.unitName)}"
                      >
                        <td>${escapeHtml(objective.objectiveId)}</td>
                        <td>
                          <span class="objective-preview" title="${escapeHtml(objective.text)}">${escapeHtml(objective.text)}</span>
                          ${showIssues && rowIssues.length > 0 ? `<ul class="row-errors">${rowIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
                        </td>
                        <td>${renderQuestionTypeControls(row, entry.index)}</td>
                        <td><input class="blueprint-score-input" type="text" inputmode="numeric" data-blueprint-field="plannedScore" value="${escapeHtml(row.plannedScore)}"></td>
                        <td><input data-blueprint-field="groupHint" value="${escapeHtml(row.groupHint)}" placeholder="例：與 1-2-4、1-2-5 併入同一觀星情境題組"></td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
            ${unitSummary ? renderUnitSummary(unitSummary) : ""}
          </section>
        `;
      }).join("")}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="3">上一步</button>
        <button class="button" type="button" data-action="blueprint-next" ${summary.allMatched ? "" : "disabled"}>下一步</button>
      </div>
    </section>
  `;
}

function getPromptResult() {
  return buildItemGenerationPrompt({
    project: state.project ?? {},
    allocations: state.allocations,
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
      <h2 id="current-step-title">產生出題指令</h2>
      <label class="prompt-material">
        <span>教材摘要（選填）</span>
        <textarea data-material-text rows="5" placeholder="可自行輸入課文重點；也可以把課本內容請 AI 整理成摘要後貼入。">${escapeHtml(state.materialText)}</textarea>
      </label>
      ${apiAvailable ? `
        <section class="api-mode-block">
          <h3>一鍵生成題庫</h3>
          <p class="hint-text">按「生成題庫」，系統會依命題藍圖自動產生題目草稿，直接進入下一步檢核。AI 產出僅為草稿，務必逐題修改定稿。</p>
          ${generationApiError ? `<p class="field-error">${escapeHtml(generationApiError)} 可改用下方「手動出題指令」。</p>` : ""}
          ${generationApiSuccess ? `<p class="success-notice">${escapeHtml(generationApiSuccess)}</p>` : ""}
          ${apiBusy ? `<p class="notice notice--inline">題目生成中，約需 10～30 秒…</p>` : ""}
          <div class="step-actions">
            <button class="button" type="button" data-action="generate-items-api" ${apiBusy ? "disabled" : ""}>生成題庫</button>
          </div>
        </section>
      ` : ""}
      <section class="api-mode-block">
        <h3>手動出題指令</h3>
        <p class="hint-text">按「複製指令」，貼到 Gemini、ChatGPT、Claude 等 AI 工具送出；AI 回覆題庫資料後，請到步驟 6 整段貼入。</p>
        ${result.ok ? `
          <div class="prompt-toolbar">
            <button class="button" type="button" data-action="copy-prompt">複製指令</button>
            <span class="copy-status" data-copy-status>${escapeHtml(copyStatus)}</span>
          </div>
          <pre class="prompt-output" data-prompt-output tabindex="0">${escapeHtml(result.prompt)}</pre>
        ` : `<ul class="row-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
      </section>
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="4">上一步</button>
        <button class="button" type="button" data-action="prompt-next" ${result.ok ? "" : "disabled"}>前往步驟 6 手動貼入</button>
      </div>
    </section>
  `;
}

function isChineseProject() {
  return state.project?.subject === "國語";
}

function getItemValidationErrors(items) {
  const errors = [];

  items.forEach((item, index) => {
    const result = validateItem(item, { isChinese: isChineseProject() });

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
    <section class="audit-report ${state.auditStale ? "audit-report--stale" : ""}">
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
      ${blockReason ? `<p class="text-error">無法進入步驟 7：${escapeHtml(blockReason)}</p>` : ""}
      <div class="step-actions">
        <button class="button" type="button" data-action="go-step" data-target-step="7" ${blockReason ? "disabled" : ""}>前往步驟 7</button>
      </div>
    </section>
  `;
}

function renderItemsStep() {
  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">⑥匯入題庫與檢核</h2>
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
          <button class="button" type="button" data-action="run-audit" ${state.items.length > 0 ? "" : "disabled"}>執行審題檢核</button>
        </div>
        ${renderGroupedItems()}
      </section>
      ${renderAuditReport()}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="5">上一步</button>
      </div>
    </section>
  `;
}

function getPrintData() {
  return buildPrintData({
    project: state.project,
    allocations: state.allocations,
    objectives: state.objectives,
    items: state.items,
    auditReport: state.auditReport,
  });
}

function renderPrintOutputStep() {
  const hasReport = Boolean(state.auditReport);

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">七、輸出送審表件</h2>
      ${hasReport ? `
        <div class="output-actions" aria-label="送審表件輸出">
          <button class="button" type="button" data-action="open-print-view" data-print-view="scoreTable">配分表</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="studentPaper">試題（學生卷）</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="teacherPaper">試題（教師卷）</button>
          <button class="button" type="button" data-action="open-print-view" data-print-view="reviewSheet">審核表</button>
        </div>
        <p class="empty-state">各視圖開啟後，可按右上角「列印／另存 PDF」輸出。簽名欄請保留紙本親簽。</p>
      ` : `
        <p class="text-error">尚未完成審題檢核，請回步驟 6 執行檢核後再輸出送審表件。</p>
      `}
      <div class="step-actions">
        <button class="button button--secondary" type="button" data-action="go-step" data-target-step="6">上一步</button>
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
      <h3>題組 ${escapeHtml(group.groupNumber)}</h3>
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

function renderReviewSheetPrint(reviewSheet) {
  return `
    <article class="print-document print-document--review-sheet">
      <header class="paper-header review-sheet-header">
        <h1>${escapeHtml(reviewSheet.project.schoolName)}學習評量試題審核表</h1>
        <p>${escapeHtml(reviewSheet.versionLabel)}</p>
      </header>
      ${renderReviewHeader(reviewSheet.project)}
      <section class="review-section">
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
    return renderItemsStep();
  }

  if (state.currentStep === 7) {
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

  if (projectDraft.version === "其他" && !projectDraft.versionOther.trim()) {
    errors.versionOther = "請輸入版本名稱。";
  }

  return errors;
}

function normalizeProjectDraft() {
  const version =
    projectDraft.version === "其他"
      ? projectDraft.versionOther.trim()
      : projectDraft.version;

  return {
    schoolYear: Number(projectDraft.schoolYear),
    semester: Number(projectDraft.semester),
    examNumber: Number(projectDraft.examNumber),
    grade: Number(projectDraft.grade),
    subject: projectDraft.subject,
    version,
    versionChoice: projectDraft.version,
    versionOther: projectDraft.version === "其他" ? projectDraft.versionOther.trim() : "",
    publisher: version,
    publisherOther: projectDraft.version === "其他" ? projectDraft.versionOther.trim() : "",
    scope: projectDraft.scope.trim(),
    teacher: projectDraft.teacher.trim(),
    totalScore: 100,
  };
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

  if (stepNumber === 5) {
    markPromptGenerated();
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
  dispatchMany([
    { type: "SET_OBJECTIVES", payload: objectives },
    { type: "SET_ALLOCATIONS", payload: plan.allocations },
    { type: "GO_TO_STEP", payload: 3 },
  ]);
}

function handleAllocationsNext() {
  const plan = getAllocationPlan(state.objectives);

  if (!plan.ok) {
    allocationErrors = plan.errors;
    notice = formatUserFacingError(plan.errors[0]);
    render();
    return;
  }

  dispatchMany([
    { type: "SET_ALLOCATIONS", payload: plan.allocations },
    { type: "GO_TO_STEP", payload: 4 },
  ]);
}

function handleBlueprintNext() {
  const rows = normalizeBlueprintForSubmit(collectBlueprintFromDom());
  const summary = summarizeBlueprint(state.allocations, rows);

  showBlueprintErrors = true;

  if (!summary.allMatched) {
    const firstInvalidEntry = summary.invalidEntries[0];
    notice =
      firstInvalidEntry?.issues[0] ??
      summary.errors[0] ??
      "請確認每個單元配分與題型規劃皆已完成。";
    state = applyAction(state, {
      type: "SET_BLUEPRINT",
      payload: rows,
      updatedAt: new Date().toISOString(),
    });
    saveState();
    render();
    return;
  }

  showBlueprintErrors = false;
  notice = "";
  dispatchMany([
    { type: "SET_BLUEPRINT", payload: rows },
    { type: "SET_PROMPT_GENERATED_AT", payload: new Date().toISOString() },
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
    { type: "GO_TO_STEP", payload: 6 },
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

async function handleGenerateItemsViaApi() {
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
  const result = validateItem(editedItem, { isChinese: isChineseProject() });

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
  const report = auditExam({
    project: state.project,
    allocations: state.allocations,
    objectives: state.objectives,
    items: state.items,
  });

  notice = "";
  dispatch({ type: "SET_AUDIT_REPORT", payload: report });
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

  if (action === "blueprint-next") {
    handleBlueprintNext();
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

  if (action === "generate-items-api") {
    await handleGenerateItemsViaApi();
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
  const blueprintField = event.target.closest("[data-blueprint-field], [data-blueprint-type]");
  const tsvInput = event.target.closest("[data-tsv-input]");
  const extractionMaterialInput = event.target.closest("[data-extraction-material-text]");
  const materialTextInput = event.target.closest("[data-material-text]");
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

loadDraft();
syncProjectDraftFromState();
render();
appRoot.addEventListener("click", handleClick);
appRoot.addEventListener("input", handleInput);
appRoot.addEventListener("change", handleInput);
appRoot.addEventListener("submit", handleSubmit);
appRoot.addEventListener("close", handleDialogClose, true);

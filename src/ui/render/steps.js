export const STEPS = [
  {
    number: 1,
    label: "建立試卷",
    description:
      "請填寫本次定期評量的基本資料。標示＊者為必填，完成後按「下一步」。",
  },
  {
    number: 2,
    label: "匯入學習目標",
    description:
      "請輸入本次考試範圍內的單元、學習目標與授課節數。可逐筆新增，也可從試算表或 AI 擷取結果匯入。",
  },
  {
    number: 3,
    label: "節數配分",
    descriptionHtml:
      "系統已依各單元授課節數比例算出配分，<strong>此配分為全卷鐵律，不可手動修改</strong>。若配分不符預期，請回步驟 2 調整授課節數後重算。",
  },
  {
    number: 4,
    label: "題型規劃",
    descriptionHtml:
      "請為每個學習目標規劃題型與配分。<strong>每個單元內各目標配分加總，必須恰好等於步驟 3 的單元建議配分</strong>，全數吻合才能前進。",
  },
  {
    number: 5,
    label: "生成備選題",
    description:
      "系統會依命題藍圖分批生成備選題，避免一次生成整卷造成服務中斷。AI 產出僅為草稿，仍需教師逐題修改定稿。",
  },
  {
    number: 6,
    label: "選題組卷",
    description:
      "選題功能即將推出。本版會先將步驟 5 生成的備選題全數帶入正式題庫，讓流程可以完整進入審題檢核。",
  },
  {
    number: 7,
    label: "審題檢核",
    description:
      "請檢查題庫內容、逐題編修，並執行整合審題檢核。若有 error，需修正後才能輸出送審表件。",
  },
  {
    number: 8,
    label: "輸出送審表件",
    description:
      "審題檢核已完成。請依序列印或另存 PDF：配分表、學生卷、教師卷與審核表。",
  },
];

export const STEP_NUMERALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

export function getStepByNumber(stepNumber) {
  return STEPS.find((step) => step.number === stepNumber) ?? STEPS[0];
}

export function getCompletedSteps(state) {
  const completed = new Set();

  if (state.project) {
    completed.add(1);
  }

  if (state.objectives.length > 0) {
    completed.add(2);
  }

  if (state.allocations.length > 0) {
    completed.add(3);
  }

  if (state.blueprint.length > 0) {
    completed.add(4);
  }

  if (state.candidatePool?.length > 0 || state.promptGeneratedAt) {
    completed.add(5);
  }

  if (state.items.length > 0) {
    completed.add(6);
  }

  if (state.auditReport) {
    completed.add(7);
  }

  return completed;
}

export function renderProgress(state) {
  const completedSteps = getCompletedSteps(state);

  return `
    <nav class="progress-nav" aria-label="步驟進度">
      <ol class="progress-list">
        ${STEPS.map((step, index) => {
          const isCurrent = state.currentStep === step.number;
          const isComplete = completedSteps.has(step.number);
          const marker = isComplete ? "✅" : STEP_NUMERALS[index];

          return `
            <li>
              <button
                class="step-button"
                type="button"
                data-step="${step.number}"
                data-complete="${isComplete}"
                ${isCurrent ? 'aria-current="step"' : ""}
              >
                <span class="step-button__number">${marker}</span>
                <span class="step-button__label">${step.label}</span>
              </button>
            </li>
          `;
        }).join("")}
      </ol>
    </nav>
  `;
}

export function renderStepHelp(state) {
  const step = getStepByNumber(state.currentStep);

  return `
    <section class="step-help" aria-labelledby="step-help-title">
      <h2 id="step-help-title">這一步要做什麼</h2>
      <p>${step.descriptionHtml ?? step.description}</p>
    </section>
  `;
}

export function renderPlaceholderStep(state) {
  const step = getStepByNumber(state.currentStep);

  return `
    <section class="step-panel" aria-labelledby="current-step-title">
      <h2 id="current-step-title">${STEP_NUMERALS[step.number - 1]}${step.label}</h2>
      <p>此步驟尚未開放。</p>
    </section>
  `;
}

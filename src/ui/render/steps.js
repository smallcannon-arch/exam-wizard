export const STEPS = [
  {
    number: 1,
    label: "建立試卷",
    description: "請填寫本次定期評量的基本資料。標示＊者為必填，完成後按『下一步』。",
  },
  {
    number: 2,
    label: "匯入學習目標",
    description: "請輸入本次考試範圍內的單元、學習目標與授課節數。可逐筆新增，也可從 Excel／Google 試算表複製多列後一次貼入。",
  },
  {
    number: 3,
    label: "節數配分",
    description: "系統已依各單元授課節數比例算出配分，此配分為全卷鐵律，不可手動修改。若配分不符預期，請回步驟 2 調整各目標的授課節數後，系統將自動重算。",
    descriptionHtml: "系統已依各單元授課節數比例算出配分，<strong>此配分為全卷鐵律，不可手動修改</strong>。若配分不符預期，請回步驟 2 調整各目標的授課節數後，系統將自動重算。",
  },
  {
    number: 4,
    label: "命題藍圖",
    description: "請為每個學習目標規劃題型與配分。每個單元內各目標配分加總，必須恰好等於步驟 3 的單元建議配分，全數吻合才能前進。",
    descriptionHtml: "請為每個學習目標規劃題型與配分。<strong>每個單元內各目標配分加總，必須恰好等於步驟 3 的單元建議配分</strong>，全數吻合才能前進。",
  },
  {
    number: 5,
    descriptionHtml: "①（選填）教材摘要：可自行輸入課文重點；也可以把課本內容請 AI 整理成摘要後貼入，能讓題目更貼近教學內容。<br>②按下『複製指令』，把指令貼到 Gemini、ChatGPT、Claude 等 AI 工具送出。<br>③AI 會回覆一份題庫資料，請從頭到尾<strong>整段複製</strong>，再到步驟 6 貼入。提醒：AI 產出僅為草稿，仍需教師逐題修改定稿。",
    label: "產生出題指令",
    description: "請依三步驟產生出題指令、貼到外部 AI，再把 AI 回覆的題庫資料帶回本系統。",
  },
  {
    number: 6,
    descriptionHtml: "請將 AI 回覆的題庫資料整段貼入下方，按『讀取題庫』。若讀取失敗，請回到 AI 對話，把回覆從頭到尾完整複製後再貼一次。",
    label: "匯入題庫與檢核",
    description: "請將 AI 回覆的題庫資料整段貼入下方，按『讀取題庫』。",
  },
  {
    number: 7,
    descriptionHtml: "審題檢核已完成。請依序列印（或另存 PDF）下列四份送審表件，連同紙本送交教學組檢視。簽名欄請於紙本上親簽。",
    label: "輸出送審表件",
    description: "這一步要輸出送審表件；本任務僅提供占位畫面。",
  },
];

export const STEP_NUMERALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

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

  if (state.promptGeneratedAt) {
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
    <nav class="progress-nav" aria-label="流程步驟">
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

# AGENTS.md — exam-wizard 命題與審題輔助系統

本專案為新竹市內湖國小「定期評量命題與試題審核輔助系統」。

## 一、專案目標

協助國小教師完成：學習目標整理 → 依授課節數比例配分 → 命題藍圖（雙向細目表）→
產生外部 LLM 出題 Prompt → 匯入題庫 JSON 並自動檢核 → 匯出試卷與審核表。

系統核心不是 AI 出題，而是「合規的命題流程管理」。最終產出必須對齊校方
評量辦法規定的四份送審表件：①配分表 ②試題（學生卷）③試題（標註答案與
目標的教師卷）④審核表。

## 二、技術架構鐵則（與既有校內系統一致，不得更換）

1. 前端：**單頁靜態網站**，部署於 GitHub Pages。HTML + 原生 ES Modules +
   原生 CSS。**禁止引入 React / Next.js / Vue / Tailwind / 任何前端框架或建置工具。**
2. 核心邏輯：全部放在 `src/core/`，必須是**純函式 ES Module**——
   不碰 DOM、不碰 fetch、不碰 Google Apps Script、不碰任何全域狀態。
   同一份檔案同時供瀏覽器 `<script type="module">` 與 Vitest 測試使用。
3. **零執行期相依套件**：`package.json` 只允許 devDependencies（vitest）。
   資料驗證以手寫驗證函式實作（`schemas.js`），不使用 Zod。
4. 後端（後期 Phase 才做）：Google Apps Script + Google Sheets，
   經 Cloudflare Workers 代理。登入沿用既有 Google Identity Services
   id_token 驗證模式（驗 aud 與 email_verified）。在任務單明確要求前，
   **不要建立任何後端或登入程式碼**。
5. 文件輸出：以 HTML 列印視圖（A4 print CSS）為主。列印樣式必須包含
   `print-color-adjust: exact` 與 `-webkit-print-color-adjust: exact`。

## 三、目錄結構

```text
exam-wizard/
├─ AGENTS.md
├─ README.md
├─ package.json              # 僅 devDependencies: vitest
├─ .gitignore                # 必含 private_materials/、node_modules/
├─ index.html                # 前台單頁（Phase 5 才實作，先放占位頁）
├─ src/
│  ├─ core/                  # 純函式區，禁止 DOM / fetch / GAS
│  │  ├─ schemas.js          # 資料結構定義與驗證
│  │  ├─ allocateScores.js   # 配分引擎
│  │  ├─ auditCoverage.js    # 學習目標覆蓋率檢核
│  │  ├─ auditScores.js      # 配分比例檢核
│  │  ├─ auditTime.js        # 應試時間檢核
│  │  ├─ auditChinese.js     # 國語向度比例檢核
│  │  ├─ auditExam.js        # 整合審題報告
│  │  ├─ buildPrompt.js      # 外部 LLM 出題 Prompt 產生器
│  │  └─ config/
│  │     └─ chineseDimensions.js
│  └─ ui/                    # 前端模組（Phase 5 後）
├─ gas/                      # Google Apps Script 後端（Phase 6 後）
├─ tests/
│  ├─ *.test.js
│  └─ fixtures/
└─ private_materials/        # 本機教材與試題，永不 commit
```

## 四、語言與介面要求

- 所有 UI 文字、錯誤訊息、註解、commit message 一律使用**繁體中文（臺灣用語）**。
- 行政文件用語需正式、清楚，貼近臺灣國小行政慣例。
- 介面風格：乾淨留白、低彩度、教育行政專業感；使用者可能完全不熟悉系統，
  每一步驟畫面都要有簡短操作說明。
- 檢核結果一律使用三態：`pass` / `warning` / `error`，畫面對應 ✅ ⚠️ ❌。

## 五、開發原則

1. 每次任務只實作任務單指定範圍，**不得自行擴大功能**。
2. 先完成可測試的核心邏輯，再做 UI。
3. `src/core/` 內所有函式必須有 Vitest 單元測試；修改核心邏輯後必須執行
   `npm test` 並回報結果。
4. 輸入不合法時，回傳**可讀的繁體中文錯誤訊息**（指出第幾筆、哪個欄位），
   不得丟出未處理的例外。
5. 不要把教材 PDF、未公開試題、學生個資、API key 放入版本控制。
6. 不要直接呼叫任何外部 AI API。第一版採「系統產生 Prompt → 教師貼到
   外部 LLM → 教師貼回 JSON → 系統檢核」流程。

## 六、命題檢核規則（依校內學習評量辦法）

### 非國語科（數學、自然、社會、英語）

1. 每個學習目標至少被一題對應（題組小題各自獨立計算）。
2. 配分**嚴格依單元授課節數比例分配，不容許誤差**：各單元實際配分
   必須與系統依節數比例（最大餘數法）計算之建議配分完全一致，
   任何不一致一律 error。比對時僅允許浮點運算層級的誤差（1e-9），
   此非配分容差。
3. 全卷總分必須等於 100。
4. 預估應試時間需落在 40 至 60 分鐘。
5. 預估鑑別度指數需 ≥ 0.20。
6. 教師自行命題，不得直接使用教科書廠商試題（Prompt 中必須載明）。
7. 內容需符合學生能力與真實情境，無爭議性、不違背法規、符合性別平等原則。

### 國語科（獨立模組）

依許育健教授評量向度分三類：`word_phrase`（字詞短語）、
`sentence_grammar`（句式語法）、`reading_writing`（段篇讀寫）。
各年段比例存於 `src/core/config/chineseDimensions.js`，**標記為待確認預設值**，
正式比例以校內「國語科評量向度檢核表」原件為準，未經人工確認前不得
寫死於其他檔案：

- 低年級（暫定）：字詞短語 50%、句式語法 30%、段篇讀寫 20%
- 中年級（暫定）：字詞短語 30%、句式語法 50%、段篇讀寫 20%
- 高年級（暫定）：字詞短語 20%、句式語法 30%、段篇讀寫 50%

## 七、資料格式（JSON，欄位名固定）

### objective（學習目標）

```json
{
  "objectiveId": "1-2-3",
  "unitName": "一、探索星空的奧祕",
  "lessonName": "1-1 星空大解密",
  "text": "學會操作星座盤，能以方位和高度角描述星星的位置。",
  "periodCount": 5
}
```

### item（試題；題組小題各為一筆，以 groupId 關聯）

```json
{
  "itemId": "A-03",
  "groupId": "G-01",
  "questionType": "選擇題",
  "competencyType": "素養題組",
  "stimulus": "題組引文或情境描述（無則為空字串）",
  "question": "題幹文字",
  "options": ["…", "…", "…", "…"],
  "answer": "2",
  "explanation": "解析文字",
  "objectiveIds": ["1-2-3"],
  "score": 4,
  "estimatedTimeSeconds": 90,
  "discriminationPrediction": 0.35,
  "chineseDimension": null,
  "reviewFlags": []
}
```

規則：`objectiveIds` 至少一筆；`score` > 0；`discriminationPrediction`
若存在需介於 0 與 1；國語科每題 `chineseDimension` 必填。

## 八、測試要求

每次完成任務後回報四件事：

1. 修改了哪些檔案
2. 新增了哪些測試
3. `npm test` 執行結果
4. 尚未完成或需要人工確認的事項

## 九、禁止事項

- 不要引入前端框架、CSS 框架、bundler、執行期套件。
- 不要產生未經要求的登入系統、後端、資料庫連線。
- 不要串接真實金鑰或呼叫外部 API。
- 不要將 `private_materials/` 內容納入版本控制。
- 不要用假資料冒充已解析的教材。
- 不要直接複製課本或習作題目作為正式題目或測試 fixture 的題幹。

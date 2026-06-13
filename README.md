# 內湖國小命題與審題輔助系統 exam-wizard

本專案用於輔助國小教師整理學習目標、建立命題藍圖、產生外部 LLM 出題 Prompt，並匯入題庫 JSON 進行檢核，最後支援輸出校內定期評量送審表件。

目前為開發初期骨架，尚未實作配分、審題與文件輸出等業務邏輯。

## 安裝

```bash
npm install
```

## 測試

```bash
npm test
```

## 目錄結構

- `index.html`：前台單頁占位頁，可直接用瀏覽器開啟。
- `src/core/`：純函式 ES Module 核心邏輯，不依賴 DOM、fetch、Google Apps Script 或全域狀態。
- `src/core/config/`：核心設定檔占位，後續存放國語科評量向度等設定。
- `src/ui/`：前端模組預留目錄，後續階段實作。
- `gas/`：Google Apps Script 後端預留目錄，後續階段實作。
- `tests/`：Vitest 單元測試。
- `private_materials/`：本機教材與試題資料，已排除於版本控制外。

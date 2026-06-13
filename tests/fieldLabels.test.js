import { describe, expect, it } from "vitest";
import { replaceFieldLabels, toFieldLabel } from "../src/ui/fieldLabels.js";

describe("fieldLabels", () => {
  it("已知 objective 欄位轉為中文名稱", () => {
    expect(toFieldLabel("periodCount")).toBe("授課節數");
    expect(toFieldLabel("objectiveId")).toBe("目標編號");
  });

  it("已知 item 欄位轉為中文名稱", () => {
    expect(toFieldLabel("discriminationPrediction")).toBe("預估鑑別度");
    expect(toFieldLabel("objectiveIds")).toBe("對應目標編號");
    expect(toFieldLabel("groupId")).toBe("題組編號");
    expect(toFieldLabel("reviewFlags")).toBe("審題標記");
  });

  it("未知欄位原樣回傳", () => {
    expect(toFieldLabel("customField")).toBe("customField");
  });

  it("可替換錯誤訊息中的內部欄位名", () => {
    expect(replaceFieldLabels("periodCount 欄位必須是正數。")).toBe(
      "授課節數 欄位必須是正數。",
    );
    expect(replaceFieldLabels("objectiveIds 欄位至少需要 1 筆資料。")).toBe(
      "對應目標編號 欄位至少需要 1 筆資料。",
    );
  });
});

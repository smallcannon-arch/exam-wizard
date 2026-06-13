import { describe, expect, it } from "vitest";
import { auditTime } from "../src/core/auditTime.js";

function createItem(itemId, estimatedTimeSeconds) {
  return {
    itemId,
    objectiveIds: ["O-1"],
    score: 4,
    estimatedTimeSeconds,
  };
}

describe("auditTime", () => {
  it("預估時間在 40 到 60 分鐘內時回傳 pass", () => {
    const result = auditTime({
      items: [
        createItem("A-01", 960),
        createItem("A-02", 960),
        createItem("A-03", 960),
      ],
    });

    expect(result).toEqual({
      severity: "pass",
      totalSeconds: 2880,
      estimatedMinutes: 48,
      missingItemIds: [],
      message: "預估應試時間 48 分鐘，符合 40～60 分鐘規定。",
      suggestedAdjustment: null,
    });
  });

  it("預估 38 分鐘時回傳 warning 與增加題量建議", () => {
    const result = auditTime({
      items: [createItem("A-01", 2280)],
    });

    expect(result.severity).toBe("warning");
    expect(result.estimatedMinutes).toBe(38);
    expect(result.suggestedAdjustment).toBe(
      "建議增加約 2 分鐘的題量，使全卷應試時間接近規定範圍。",
    );
  });

  it("預估 70 分鐘時回傳 error 與刪減題量建議", () => {
    const result = auditTime({
      items: [createItem("A-01", 4200)],
    });

    expect(result.severity).toBe("error");
    expect(result.estimatedMinutes).toBe(70);
    expect(result.suggestedAdjustment).toBe(
      "建議刪減約 10 分鐘的題量，使全卷應試時間接近規定範圍。",
    );
  });

  it("缺 estimatedTimeSeconds 時以 0 秒計入並至少 warning", () => {
    const { estimatedTimeSeconds, ...missingTimeItem } = createItem("B-02", 120);
    const result = auditTime({
      items: [createItem("A-01", 2400), missingTimeItem],
    });

    expect(result.severity).toBe("warning");
    expect(result.totalSeconds).toBe(2400);
    expect(result.estimatedMinutes).toBe(40);
    expect(result.missingItemIds).toEqual(["B-02"]);
    expect(result.message).toContain("B-02");
  });

  it("items 為空陣列時回傳 error", () => {
    const result = auditTime({ items: [] });

    expect(result.severity).toBe("error");
    expect(result.totalSeconds).toBe(0);
    expect(result.message).toBe("items 欄位不可為空陣列，無法檢核預估應試時間。");
  });
});

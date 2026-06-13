import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auditCoverage } from "../src/core/auditCoverage.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const objectives = JSON.parse(
  readFileSync(join(fixtureDir, "science-objectives.json"), "utf8"),
);
const items = JSON.parse(
  readFileSync(join(fixtureDir, "science-items.json"), "utf8"),
);

describe("auditCoverage", () => {
  it("全覆蓋時回傳 pass，coverageRate 為 1", () => {
    const result = auditCoverage({ objectives, items });

    expect(result.severity).toBe("pass");
    expect(result.coverageRate).toBe(1);
    expect(result.missingObjectiveIds).toEqual([]);
    expect(result.unknownObjectiveIds).toEqual([]);
    expect(result.objectiveItemMatrix.map((entry) => entry.objectiveId)).toEqual(
      objectives.map((objective) => objective.objectiveId),
    );
  });

  it("一個目標未入題時回傳 error 並列出 missingObjectiveIds", () => {
    const itemsWithoutLastObjective = items.map((item) =>
      item.itemId === "C-01"
        ? { ...item, objectiveIds: ["1-3-2"] }
        : item,
    );
    const result = auditCoverage({
      objectives,
      items: itemsWithoutLastObjective,
    });

    expect(result.severity).toBe("error");
    expect(result.coverageRate).toBe(0.86);
    expect(result.missingObjectiveIds).toEqual(["1-3-3"]);
    expect(result.messages).toContain("以下學習目標尚未入題：1-3-3。");
  });

  it("題目引用不存在的目標編號時回傳 warning，並指出 itemId", () => {
    const itemsWithUnknownObjective = [
      ...items,
      {
        ...items[0],
        itemId: "Z-99",
        objectiveIds: ["9-9-9"],
      },
    ];
    const result = auditCoverage({
      objectives,
      items: itemsWithUnknownObjective,
    });

    expect(result.severity).toBe("warning");
    expect(result.unknownObjectiveIds).toEqual(["9-9-9"]);
    expect(result.messages).toContain(
      "試題 Z-99 引用了不存在於 objectives 的目標編號：9-9-9。",
    );
  });

  it("同一題組三小題各掛不同目標時，三個目標皆計入覆蓋", () => {
    const groupItems = items.filter((item) => item.groupId === "G-01");
    const result = auditCoverage({
      objectives: objectives.filter((objective) =>
        ["1-2-1", "1-2-2", "1-3-1"].includes(objective.objectiveId),
      ),
      items: groupItems,
    });

    expect(result.severity).toBe("pass");
    expect(result.coveredObjectiveIds).toEqual(["1-2-1", "1-2-2", "1-3-1"]);
    expect(result.objectiveItemMatrix).toEqual([
      { objectiveId: "1-2-1", itemIds: ["B-01"] },
      { objectiveId: "1-2-2", itemIds: ["B-02"] },
      { objectiveId: "1-3-1", itemIds: ["B-03"] },
    ]);
  });

  it("一題掛兩個目標時，兩個目標皆計入覆蓋", () => {
    const result = auditCoverage({
      objectives: objectives.filter((objective) =>
        ["1-3-2", "1-3-3"].includes(objective.objectiveId),
      ),
      items: items.filter((item) => item.itemId === "C-01"),
    });

    expect(result.severity).toBe("pass");
    expect(result.coveredObjectiveIds).toEqual(["1-3-2", "1-3-3"]);
    expect(result.objectiveItemMatrix).toEqual([
      { objectiveId: "1-3-2", itemIds: ["C-01"] },
      { objectiveId: "1-3-3", itemIds: ["C-01"] },
    ]);
  });

  it("items 為空陣列時回傳 error 與可讀訊息", () => {
    const result = auditCoverage({ objectives, items: [] });

    expect(result.severity).toBe("error");
    expect(result.coverageRate).toBe(0);
    expect(result.messages).toContain("items 欄位不可為空陣列。");
    expect(result.missingObjectiveIds).toEqual(
      objectives.map((objective) => objective.objectiveId),
    );
  });

  it("item 缺少 objectiveIds 時回傳 error 並指出第幾筆資料", () => {
    const [{ objectiveIds, ...itemWithoutObjectiveIds }] = items;
    const result = auditCoverage({
      objectives,
      items: [itemWithoutObjectiveIds],
    });

    expect(result.severity).toBe("error");
    expect(result.messages).toContain(
      "第 1 筆試題 objectiveIds 欄位必須是至少一筆的陣列。",
    );
  });
});

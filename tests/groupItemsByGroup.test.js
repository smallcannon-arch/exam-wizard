import { describe, expect, it } from "vitest";
import { groupItemsByGroup } from "../src/ui/groupItemsByGroup.js";

describe("groupItemsByGroup", () => {
  it("依 groupId 分組並保持輸入順序", () => {
    const result = groupItemsByGroup([
      { itemId: "A-01", groupId: "G-01", stimulus: "題組一" },
      { itemId: "A-02", groupId: "G-01", stimulus: "題組一" },
      { itemId: "B-01", groupId: "G-02", stimulus: "題組二" },
    ]);

    expect(result.ok).toBe(true);
    expect(result.groups.map((group) => group.groupId)).toEqual(["G-01", "G-02"]);
    expect(result.groups[0].items.map(({ item }) => item.itemId)).toEqual(["A-01", "A-02"]);
  });

  it("無 groupId 者各自獨立成組", () => {
    const result = groupItemsByGroup([
      { itemId: "A-01", groupId: "" },
      { itemId: "A-02", groupId: "" },
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.every((group) => group.isStandalone)).toBe(true);
    expect(result.groups.map((group) => group.items[0].item.itemId)).toEqual(["A-01", "A-02"]);
  });

  it("題組與單題混合時保持首次出現順序", () => {
    const result = groupItemsByGroup([
      { itemId: "A-01", groupId: "G-01" },
      { itemId: "B-01", groupId: "" },
      { itemId: "A-02", groupId: "G-01" },
    ]);

    expect(result.groups.map((group) => group.items.map(({ item }) => item.itemId))).toEqual([
      ["A-01", "A-02"],
      ["B-01"],
    ]);
  });

  it("items 非陣列時回傳可讀錯誤", () => {
    const result = groupItemsByGroup(null);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("items 欄位必須是陣列。");
  });
});

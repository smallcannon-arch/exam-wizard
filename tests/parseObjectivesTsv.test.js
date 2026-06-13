import { describe, expect, it } from "vitest";
import {
  normalizePeriodCount,
  parseObjectivesTsv,
} from "../src/ui/parseObjectivesTsv.js";

describe("normalizePeriodCount", () => {
  it.each([
    ["1節", 1],
    [" ２節 ", 2],
    ["0.5 堂", 0.5],
    ["３．５", 3.5],
    ["一節", null],
    ["abc", null],
    ["-1節", null],
  ])("%s 轉為 %s", (raw, expected) => {
    expect(normalizePeriodCount(raw)).toBe(expected);
  });
});

describe("parseObjectivesTsv", () => {
  it("可解析正常五欄多列 TSV", () => {
    const result = parseObjectivesTsv(
      [
        "1-1-1\t一、探索星空的奧祕\t1-1 星空位置\t能用方位描述觀察結果。\t3",
        "1-1-2\t一、探索星空的奧祕\t1-2 星座觀察\t能整理星座觀察紀錄。\t2",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.objectives).toHaveLength(2);
    expect(result.rows).toBe(result.objectives);
    expect(result.objectives[0].periodCount).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
  });

  it("欄數不足時回傳可讀錯誤", () => {
    const result = parseObjectivesTsv("1-1-1\t一、探索星空的奧祕\t1-1 星空位置");

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("第 1 列欄位數不正確，應為 5 欄。");
  });

  it("授課節數非數字時回傳白話欄位錯誤", () => {
    const result = parseObjectivesTsv(
      "1-1-1\t一、探索星空的奧祕\t1-1 星空位置\t能用方位描述觀察結果。\t兩節",
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("授課節數");
    expect(result.errors[0]).toContain("兩節");
    expect(result.errors[0]).not.toContain("periodCount");
  });

  it("節數含節字時仍可匯入成功", () => {
    const result = parseObjectivesTsv(
      "1-1-1\t一、探索星空的奧祕\t1-1 星空位置\t能用方位描述觀察結果。\t1節",
    );

    expect(result.ok).toBe(true);
    expect(result.objectives[0].periodCount).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("中文數字節數報錯並帶出原始內容與中文欄位名", () => {
    const result = parseObjectivesTsv(
      "1-1-1\t一、探索星空的奧祕\t1-1 星空位置\t能用方位描述觀察結果。\t一節",
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toBe(
      "第 1 列『授課節數』需為大於 0 的數字（目前內容：『一節』）。請改為數字，如 1 或 0.5。",
    );
    expect(result.errors[0]).not.toContain("periodCount");
  });

  it("略過空白列", () => {
    const result = parseObjectivesTsv(
      [
        "",
        "1-1-1\t一、探索星空的奧祕\t1-1 星空位置\t能用方位描述觀察結果。\t3",
        "   ",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.objectives).toHaveLength(1);
  });

  it("可容錯全形空白", () => {
    const result = parseObjectivesTsv(
      "　1-1-1　\t　一、探索星空的奧祕　\t　1-1 星空位置　\t　能用方位描述觀察結果。　\t　3　",
    );

    expect(result.ok).toBe(true);
    expect(result.objectives[0]).toEqual({
      objectiveId: "1-1-1",
      unitName: "一、探索星空的奧祕",
      lessonName: "1-1 星空位置",
      text: "能用方位描述觀察結果。",
      periodCount: 3,
    });
  });

  it("可解析 Markdown 表格並略過表頭與分隔列", () => {
    const result = parseObjectivesTsv(
      [
        "| 目標編號 | 大單元名稱 | 小單元（課）名稱 | 學習目標文字 | 授課節數 |",
        "| --- | --- | --- | --- | --- |",
        "| 1-1 | 一、探索星空 | 1-1 星空位置 | 能說明星星位置的描述方式。 | 2 |",
        "| 1-2 | 一、探索星空 | 1-2 星座觀察 | 能整理觀察紀錄並提出比較。 | 3 |",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      objectiveId: "1-1",
      unitName: "一、探索星空",
      periodCount: 2,
    });
  });

  it("可混合 TSV 與 Markdown 表格列", () => {
    const result = parseObjectivesTsv(
      [
        "1-1\t一、探索星空\t1-1 星空位置\t能用方位描述觀察結果。\t2",
        "| 1-2 | 一、探索星空 | 1-2 星座觀察 | 能比較不同日期的星空紀錄。 | 2 |",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.objectiveId)).toEqual(["1-1", "1-2"]);
  });

  it("註：開頭與後續行會收進 notices 並不匯入資料列", () => {
    const result = parseObjectivesTsv(
      [
        "1-1\t一、探索星空\t1-1 星空位置\t能用方位描述觀察結果。\t2",
        "註：第二列節數為平均分配，需教師核對。",
        "另：目標編號為 AI 自編。",
        "1-2\t不應匯入\t不應匯入\t不應匯入\t9",
      ].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.notices).toEqual([
      "註：第二列節數為平均分配，需教師核對。",
      "另：目標編號為 AI 自編。",
      "1-2\t不應匯入\t不應匯入\t不應匯入\t9",
    ]);
  });

  it("Markdown 表格欄數不足時仍指出列號與欄位", () => {
    const result = parseObjectivesTsv("| 1-1 | 一、探索星空 | 1-1 星空位置 |");

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("第 1 列欄位數不正確，應為 5 欄。");
  });
});

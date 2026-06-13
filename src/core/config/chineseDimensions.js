// 以下比例為暫定預設值，正式比例以校內「國語科評量向度檢核表」原件為準，尚待人工確認。
export const CHINESE_DIMENSIONS = {
  labels: {
    word_phrase: "字詞短語",
    sentence_grammar: "句式語法",
    reading_writing: "段篇讀寫",
  },
  ratiosByBand: {
    low: {
      word_phrase: 0.5,
      sentence_grammar: 0.3,
      reading_writing: 0.2,
    },
    mid: {
      word_phrase: 0.3,
      sentence_grammar: 0.5,
      reading_writing: 0.2,
    },
    high: {
      word_phrase: 0.2,
      sentence_grammar: 0.3,
      reading_writing: 0.5,
    },
  },
  gradeToBand: {
    1: "low",
    2: "low",
    3: "mid",
    4: "mid",
    5: "high",
    6: "high",
  },
  tolerancePercentagePoints: 5,
};

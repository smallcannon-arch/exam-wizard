const SUBJECT_ALIASES = {
  chinese: ["國語", "國文"],
  math: ["數學", "數學科", "數學領域"],
  science: ["自然", "自然科", "自然科學", "自然領域", "自然科學領域"],
  social: ["社會", "社會科", "社會領域"],
  english: ["英語", "英文", "英語科", "英文科", "英語領域", "英文領域"],
};

const CANONICAL_LABELS = {
  chinese: "國語",
  math: "數學",
  science: "自然",
  social: "社會",
  english: "英語",
};

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

export function normalizeSubject(subject) {
  const normalized = normalizeText(subject);

  for (const [key, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (aliases.some((alias) => normalizeText(alias) === normalized)) {
      return key;
    }
  }

  return "unknown";
}

export function getCanonicalSubjectLabel(subject) {
  const key = normalizeSubject(subject);
  return CANONICAL_LABELS[key] ?? String(subject ?? "");
}

export function isChineseSubject(subject) {
  return normalizeSubject(subject) === "chinese";
}

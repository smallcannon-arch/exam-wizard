export function distributeIntegerScores(total, parts) {
  const score = Number(total);
  const count = Number(parts);

  if (
    !Number.isInteger(score) ||
    !Number.isInteger(count) ||
    score <= 0 ||
    count <= 0 ||
    count > score
  ) {
    return [];
  }

  const baseScore = Math.floor(score / count);
  const remainder = score % count;

  return Array.from({ length: count }, (_, index) =>
    baseScore + (index < remainder ? 1 : 0),
  );
}

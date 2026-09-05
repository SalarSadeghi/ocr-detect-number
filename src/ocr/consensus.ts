export function updateConsecutiveHistory(
  history: string[],
  value: string,
  requiredMatches: number,
) {
  if (history.at(-1) !== value) return [value];
  return [...history, value].slice(-requiredMatches);
}

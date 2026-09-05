export function updateConsecutiveHistory(
  history: string[],
  value: string,
  requiredMatches: number,
) {
  if (history.at(-1) !== value) return [value];
  return [...history, value].slice(-requiredMatches);
}

export function shouldResetConsensusForMotion(
  motionScore: number,
  motionThreshold: number,
) {
  return (
    Number.isFinite(motionScore) && motionScore > motionThreshold * 1.8
  );
}

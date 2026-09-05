export function sanitizeNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function extractNumber(text: string, expectedLength: number | null) {
  const value = sanitizeNumber(text);
  if (!value) return null;
  if (expectedLength && value.length !== expectedLength) return value;
  return value;
}

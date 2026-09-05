const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigitCharacters(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function sanitizeNumber(value: string) {
  return normalizeDigitCharacters(value).replace(/\D/g, "");
}

export function extractNumber(text: string, expectedLength: number | null) {
  const value = sanitizeNumber(text);
  if (!value) return null;
  if (expectedLength && value.length !== expectedLength) return value;
  return value;
}

import { useCallback, useEffect, useState } from "react";
import type { SavedNumber } from "../types";

const STORAGE_KEY = "camera-number-ocr:saved-numbers";

function loadSavedNumbers(): SavedNumber[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedNumber =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.value === "string" &&
        typeof item.savedAt === "string",
    );
  } catch {
    return [];
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function useSavedNumbers() {
  const [savedNumbers, setSavedNumbers] =
    useState<SavedNumber[]>(loadSavedNumbers);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNumbers));
      setStorageError(null);
    } catch {
      setStorageError("مرورگر اجازهٔ ذخیره‌سازی اطلاعات را نمی‌دهد.");
    }
  }, [savedNumbers]);

  const saveNumber = useCallback((value: string) => {
    const item: SavedNumber = {
      id: makeId(),
      value,
      savedAt: new Date().toISOString(),
    };
    setSavedNumbers((current) => [item, ...current]);
  }, []);

  const deleteNumber = useCallback((id: string) => {
    setSavedNumbers((current) => current.filter((item) => item.id !== id));
  }, []);

  return { savedNumbers, saveNumber, deleteNumber, storageError };
}

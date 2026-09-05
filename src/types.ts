export type ScannerStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "processing-image"
  | "stopped"
  | "error";

export type DetectionSource = "automatic" | "manual" | "image";

export type SavedNumber = {
  id: string;
  value: string;
  savedAt: string;
};

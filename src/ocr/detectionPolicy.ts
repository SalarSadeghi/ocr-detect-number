import {
  CONSENSUS_REQUIRED_MATCHES,
  HIGH_CONFIDENCE_THRESHOLD,
} from "./config";
import { updateConsecutiveHistory } from "./consensus";

type AutomaticDetectionInput = {
  value: string;
  confidence: number;
  sharpness: number;
  expectedLength: number | null;
  history: string[];
};

export function evaluateAutomaticDetection({
  value,
  confidence,
  sharpness,
  expectedLength,
  history,
}: AutomaticDetectionInput) {
  if (expectedLength && value.length !== expectedLength) {
    return {
      accepted: false,
      history: [],
      message: `عدد ${value} دیده شد، اما طول آن با ${expectedLength.toLocaleString("fa-IR")} رقم مورد انتظار برابر نیست.`,
    };
  }

  const nextHistory = updateConsecutiveHistory(
    history,
    value,
    CONSENSUS_REQUIRED_MATCHES,
  );
  const highConfidence = confidence >= HIGH_CONFIDENCE_THRESHOLD;
  const consensus = nextHistory.length >= CONSENSUS_REQUIRED_MATCHES;

  if (!consensus) {
    return {
      accepted: false,
      history: nextHistory,
      message:
        sharpness < 12
          ? `عدد ${value} دیده شد، اما تصویر کمی تار است؛ دوربین را ثابت‌تر و نزدیک‌تر کنید.`
          : highConfidence
            ? `عدد ${value} با اطمینان خوب خوانده شد؛ برای تأیید یک بار دیگر بررسی می‌شود.`
            : `عدد ${value} با اطمینان پایین خوانده شد؛ برای تأیید دوباره بررسی می‌شود.`,
    };
  }

  return {
    accepted: true,
    history: nextHistory,
    message: `عدد در ${CONSENSUS_REQUIRED_MATCHES.toLocaleString("fa-IR")} بررسی پیاپی یکسان بود و با اطمینان ${Math.round(confidence).toLocaleString("fa-IR")}٪ تأیید شد.`,
  };
}

export function getReviewMessage(
  value: string,
  confidence: number,
  expectedLength: number | null,
) {
  const lengthMatches = !expectedLength || value.length === expectedLength;
  return lengthMatches
    ? `عدد با اطمینان ${Math.round(confidence).toLocaleString("fa-IR")}٪ خوانده شد؛ آن را بررسی و ویرایش کنید.`
    : "عدد خوانده شد، اما طول آن با مقدار مورد انتظار برابر نیست؛ آن را بررسی کنید.";
}

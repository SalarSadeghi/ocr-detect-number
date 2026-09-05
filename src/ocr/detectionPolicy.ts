import {
  CONSENSUS_REQUIRED_MATCHES,
  HIGH_CONFIDENCE_THRESHOLD,
  MIN_SHARPNESS_SCORE,
} from "./config.ts";
import { updateConsecutiveHistory } from "./consensus.ts";

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

  const highConfidence = confidence >= HIGH_CONFIDENCE_THRESHOLD;
  if (!highConfidence) {
    return {
      accepted: false,
      history: [],
      message:
        sharpness < MIN_SHARPNESS_SCORE
          ? `عدد ${value} با اطمینان پایین خوانده شد؛ دوربین را ثابت نگه دارید و اجازه دهید فوکوس کامل شود.`
          : `عدد ${value} با اطمینان ${Math.round(confidence).toLocaleString("fa-IR")}٪ خوانده شد و برای جلوگیری از تشخیص اشتباه تأیید نشد.`,
    };
  }

  const nextHistory = updateConsecutiveHistory(
    history,
    value,
    CONSENSUS_REQUIRED_MATCHES,
  );
  const consensus = nextHistory.length >= CONSENSUS_REQUIRED_MATCHES;

  if (!consensus) {
    return {
      accepted: false,
      history: nextHistory,
      message:
        sharpness < MIN_SHARPNESS_SCORE
          ? `عدد ${value} خوانده شد؛ دوربین را ثابت نگه دارید تا یک تصویر واضح دیگر آن را تأیید کند.`
          : `عدد ${value} با اطمینان خوب خوانده شد؛ برای تأیید یک بار دیگر بررسی می‌شود.`,
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

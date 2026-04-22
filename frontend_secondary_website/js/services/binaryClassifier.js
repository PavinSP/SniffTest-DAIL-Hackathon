import { loadSettings } from "../config.js";
import { hashString } from "../utils.js";
import { joinUrl, requestJson } from "./http.js";

function getBaseUrl() {
  return loadSettings().binaryBaseUrl?.trim() || null;
}

export function binaryBaseUrl() {
  return getBaseUrl();
}

export function binaryIsMock() {
  return !getBaseUrl();
}

export async function binaryHealth() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { mode: "mock", ok: false, detail: "Binary URL not configured." };
  }

  const payload = await requestJson(joinUrl(baseUrl, "/health"), { timeoutMs: 5000 });
  return { mode: "live", ok: !!payload?.ok, detail: payload };
}

export async function binaryPredict(text, options = {}) {
  const { forceMock = false } = options;
  const baseUrl = getBaseUrl();

  if (forceMock || !baseUrl) {
    return {
      ...mockBinaryPrediction(text),
      mode: "mock",
    };
  }

  const payload = await requestJson(joinUrl(baseUrl, "/predict"), {
    method: "POST",
    body: { text },
    timeoutMs: 8000,
  });

  return {
    ...normalizeBinaryPayload(payload),
    mode: "live",
  };
}

function normalizeBinaryPayload(payload) {
  const label =
    payload?.label ||
    payload?.prediction ||
    payload?.predicted_label ||
    payload?.result ||
    "misleading";

  const confidence = Number(
    payload?.confidence ??
      payload?.score ??
      payload?.probability ??
      0.5,
  );

  return {
    label: label === "fake" ? "misleading" : String(label).toLowerCase(),
    confidence: Number.isFinite(confidence) ? confidence : 0.5,
  };
}

function mockBinaryPrediction(text) {
  const source = text.toLowerCase();
  const misleadingSignals = [
    "secret",
    "cures",
    "overnight",
    "everyone",
    "always",
    "never",
    "destroying",
    "doctors hate",
    "only",
    "panic",
    "collapse",
  ];

  const hitCount = misleadingSignals.filter((signal) => source.includes(signal)).length;
  const seeded = hashString(text) % 17;
  const misleading = hitCount > 0 || seeded > 9;
  const confidence = Math.min(0.97, 0.63 + hitCount * 0.08 + seeded / 100);

  return {
    label: misleading ? "misleading" : "true",
    confidence,
  };
}

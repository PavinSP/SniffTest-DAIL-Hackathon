import { CATEGORY_OPTIONS, loadSettings } from "../config.js";
import { hashString } from "../utils.js";
import { joinUrl, requestJson } from "./http.js";

function getBaseUrl() {
  return loadSettings().multiclassBaseUrl?.trim() || null;
}

export function multiclassBaseUrl() {
  return getBaseUrl();
}

export function multiclassIsMock() {
  return !getBaseUrl();
}

export async function multiclassHealth() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { mode: "mock", ok: false, detail: "Multiclass URL not configured." };
  }

  const payload = await requestJson(joinUrl(baseUrl, "/health"), { timeoutMs: 5000 });
  return { mode: "live", ok: !!payload?.ok, detail: payload };
}

export async function multiclassPredict(text, options = {}) {
  const { forceMock = false } = options;
  const baseUrl = getBaseUrl();

  if (forceMock || !baseUrl) {
    return {
      ...mockMulticlassPrediction(text),
      mode: "mock",
    };
  }

  const payload = await requestJson(joinUrl(baseUrl, "/predict"), {
    method: "POST",
    body: { text },
    timeoutMs: 8000,
  });

  return {
    ...normalizeMulticlassPayload(payload, text),
    mode: "live",
  };
}

function normalizeMulticlassPayload(payload, inputText) {
  const candidate = Array.isArray(payload?.predictions) ? payload.predictions[0] : payload;

  const label =
    candidate?.predicted_category ||
    candidate?.label ||
    candidate?.prediction ||
    "loaded language";

  const confidence = Number(candidate?.confidence ?? 0.5);
  const probabilities = normalizeProbabilityMap(candidate?.probabilities || {});

  return {
    statement: candidate?.statement || inputText,
    label: String(label).toLowerCase(),
    confidence: Number.isFinite(confidence) ? confidence : 0.5,
    probabilities,
  };
}

function normalizeProbabilityMap(source) {
  if (!source || typeof source !== "object") {
    return CATEGORY_OPTIONS.reduce((accumulator, category) => {
      accumulator[category] = category === "loaded language" ? 1 : 0;
      return accumulator;
    }, {});
  }

  const filled = {};
  let total = 0;
  CATEGORY_OPTIONS.forEach((category) => {
    const value = Number(source[category] ?? 0);
    filled[category] = Number.isFinite(value) ? value : 0;
    total += filled[category];
  });

  if (total <= 0) {
    filled["loaded language"] = 1;
    total = 1;
  }

  CATEGORY_OPTIONS.forEach((category) => {
    filled[category] /= total;
  });

  return filled;
}

function mockMulticlassPrediction(text) {
  const source = text.toLowerCase();
  let label = "loaded language";

  if (/\beither\b|\bor\b.*\bchaos\b|\bonly two\b/.test(source)) {
    label = "false dichotomy";
  } else if (/\beveryone\b|\bno reasonable\b|\bevery serious\b|\beverybody\b/.test(source)) {
    label = "manufactured consensus";
  } else if (/\bwhy\b.*\bwhen\b|\bwhat about\b|\bother party\b|\bworse\b/.test(source)) {
    label = "whataboutism";
  } else if (/\bone statistic\b|\bone quarter\b|\bone successful\b|\bone pilot\b|\bignores\b/.test(source)) {
    label = "cherry-picking";
  } else if (/\bdisastrous\b|\bcorrupt\b|\bshameful\b|\bdisgusting\b|\bheroic\b/.test(source)) {
    label = "loaded language";
  } else {
    label = CATEGORY_OPTIONS[hashString(text) % CATEGORY_OPTIONS.length];
  }

  const probabilities = CATEGORY_OPTIONS.reduce((accumulator, category, index) => {
    const seeded = (hashString(`${text}-${category}`) % 20) / 200;
    accumulator[category] = category === label ? 0.58 + seeded : 0.08 + index / 200;
    return accumulator;
  }, {});

  let total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
  CATEGORY_OPTIONS.forEach((category) => {
    probabilities[category] /= total;
  });
  total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);

  return {
    statement: text,
    label,
    confidence: probabilities[label] / total,
    probabilities,
  };
}

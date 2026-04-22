export const CATEGORY_OPTIONS = [
  "loaded language",
  "false dichotomy",
  "manufactured consensus",
  "cherry-picking",
  "whataboutism",
];

export const LEVEL_META = {
  1: {
    id: 1,
    title: "Spot the Obvious",
    kind: "binary",
    prompt: "True or Misleading?",
    rounds: 5,
    passThreshold: 3,
    description: "Quick binary reads on obvious misinformation and hype.",
  },
  2: {
    id: 2,
    title: "Name the Trick",
    kind: "multiclass",
    prompt: "Which manipulation tactic is this?",
    rounds: 5,
    passThreshold: 3,
    description: "Identify the exact rhetorical move driving the spin.",
  },
  3: {
    id: 3,
    title: "Explain Yourself",
    kind: "explain",
    prompt: "Pick the tactic and justify your answer.",
    rounds: 5,
    passThreshold: 3,
    description: "Combine classification with short reasoning.",
  },
  4: {
    id: 4,
    title: "Spot the Subtle Lie",
    kind: "timed",
    prompt: "Make the call before the timer runs out.",
    rounds: 5,
    passThreshold: 3,
    timerSeconds: 20,
    description: "Harder mixed-signal claims under time pressure.",
  },
  5: {
    id: 5,
    title: "You vs AI",
    kind: "versus",
    prompt: "Pick the fabricated statement.",
    rounds: 5,
    passThreshold: 3,
    description: "One statement is plausible, one is manufactured.",
  },
  6: {
    id: 6,
    title: "Build the Lie",
    kind: "builder",
    prompt: "Write a manipulative statement and see if the model catches it.",
    rounds: 5,
    passThreshold: 3,
    description: "Reverse the problem and test whether your rhetoric fools the model.",
  },
};

export const STORAGE_KEYS = {
  settings: "snifftest-settings-v1",
  progress: "snifftest-progress-v1",
};

export const DEFAULT_SETTINGS = {
  binaryBaseUrl: "http://127.0.0.1:5000",
  multiclassBaseUrl: "http://127.0.0.1:8000",
  allowMockFallback: true,
};

export const RUNTIME_OVERRIDES = window.SNIFFTEST_CONFIG || {};

export function loadSettings() {
  const persisted = safeParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...RUNTIME_OVERRIDES,
    ...persisted,
  });
}

export function saveSettings(nextSettings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalizeSettings(nextSettings)));
}

function safeParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeSettings(settings) {
  return {
    ...settings,
    binaryBaseUrl: normalizeUrl(settings.binaryBaseUrl),
    multiclassBaseUrl: normalizeUrl(settings.multiclassBaseUrl),
    allowMockFallback: !!settings.allowMockFallback,
  };
}

function normalizeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

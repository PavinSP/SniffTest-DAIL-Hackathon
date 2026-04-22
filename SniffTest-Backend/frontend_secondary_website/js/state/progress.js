import { LEVEL_META, STORAGE_KEYS } from "../config.js";

function defaultByLevel() {
  return Object.values(LEVEL_META).reduce((accumulator, meta) => {
    accumulator[meta.id] = {
      attempts: 0,
      bestScore: 0,
      lastScore: 0,
      correctAnswers: 0,
      totalQuestions: 0,
    };
    return accumulator;
  }, {});
}

function defaultProgress() {
  return {
    unlockedLevels: [1],
    streak: 0,
    bestStreak: 0,
    byLevel: defaultByLevel(),
  };
}

export function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEYS.progress);
  if (!raw) {
    return defaultProgress();
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultProgress(),
      ...parsed,
      byLevel: {
        ...defaultByLevel(),
        ...(parsed.byLevel || {}),
      },
    };
  } catch (error) {
    return defaultProgress();
  }
}

export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
}

export function resetProgress() {
  const fresh = defaultProgress();
  saveProgress(fresh);
  return fresh;
}

export function isLevelUnlocked(progress, levelId) {
  return progress.unlockedLevels.includes(Number(levelId));
}

export function recordSession(progress, levelId, score, totalQuestions) {
  const numericId = Number(levelId);
  const next = structuredClone(progress);
  const entry = next.byLevel[numericId];

  entry.attempts += 1;
  entry.lastScore = score;
  entry.bestScore = Math.max(entry.bestScore, score);
  entry.correctAnswers += score;
  entry.totalQuestions += totalQuestions;

  if (score >= LEVEL_META[numericId].passThreshold && numericId < 6 && !next.unlockedLevels.includes(numericId + 1)) {
    next.unlockedLevels.push(numericId + 1);
    next.unlockedLevels.sort((left, right) => left - right);
  }

  if (score >= LEVEL_META[numericId].passThreshold) {
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
  } else {
    next.streak = 0;
  }

  saveProgress(next);
  return next;
}

export function levelAccuracy(entry) {
  if (!entry || !entry.totalQuestions) {
    return 0;
  }
  return entry.correctAnswers / entry.totalQuestions;
}

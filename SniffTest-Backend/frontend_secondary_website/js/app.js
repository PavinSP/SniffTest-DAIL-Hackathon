import {
  CATEGORY_OPTIONS,
  LEVEL_META,
  loadSettings,
  saveSettings,
} from "./config.js";
import { CONTENT } from "./content.js";
import {
  binaryBaseUrl,
  binaryHealth,
  binaryPredict,
} from "./services/binaryClassifier.js";
import {
  multiclassBaseUrl,
  multiclassHealth,
  multiclassPredict,
} from "./services/multiclassClassifier.js";
import { ApiError, NetworkError, TimeoutError } from "./services/http.js";
import {
  isLevelUnlocked,
  levelAccuracy,
  loadProgress,
  recordSession,
  resetProgress,
} from "./state/progress.js";
import {
  clamp,
  escapeHtml,
  percent,
  sample,
  sentenceWordCount,
  shuffle,
} from "./utils.js";

const appElement = document.getElementById("app");
const statusPillsElement = document.getElementById("status-pills");
const jumpSettingsButton = document.getElementById("jump-settings");

const state = {
  progress: loadProgress(),
  settings: loadSettings(),
  apiStatus: {
    binary: { label: "Checking", tone: "checking", detail: "Probing backend." },
    multiclass: { label: "Checking", tone: "checking", detail: "Probing backend." },
  },
  sessions: new Map(),
  timerId: null,
  scrollToSettings: false,
};

window.addEventListener("hashchange", render);
appElement.addEventListener("click", handleClick);
appElement.addEventListener("input", handleInput);
jumpSettingsButton.addEventListener("click", () => {
  state.scrollToSettings = true;
  location.hash = "#/about";
});

initialize();

async function initialize() {
  render();
  refreshApiStatuses();
  window.setInterval(refreshApiStatuses, 30000);
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";

  if (raw === "/" || raw === "") {
    return { name: "hub" };
  }

  if (raw === "/progress") {
    return { name: "progress" };
  }

  if (raw === "/about") {
    return { name: "about" };
  }

  const playMatch = raw.match(/^\/play\/(\d)$/);
  if (playMatch) {
    return { name: "play", levelId: Number(playMatch[1]) };
  }

  return { name: "missing" };
}

function render() {
  state.settings = loadSettings();
  const route = parseRoute();

  clearTimerIfNeeded(route);
  updateNav(route);
  updateStatusPills();

  if (route.name === "hub") {
    appElement.innerHTML = renderHub();
  } else if (route.name === "progress") {
    appElement.innerHTML = renderProgress();
  } else if (route.name === "about") {
    appElement.innerHTML = renderAbout();
  } else if (route.name === "play") {
    appElement.innerHTML = renderPlay(route.levelId);
    maybeStartTimedLoop(route.levelId);
  } else {
    appElement.innerHTML = renderMissing();
  }

  if (route.name === "about" && state.scrollToSettings) {
    window.setTimeout(() => {
      document.getElementById("settings-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    state.scrollToSettings = false;
  }
}

function renderHub() {
  const unlockedCount = state.progress.unlockedLevels.length;
  const attempts = Object.values(state.progress.byLevel).reduce((sum, entry) => sum + entry.attempts, 0);

  return `
    <section class="hero">
      <div>
        <p class="eyebrow">Level Hub</p>
        <h2>Train the full manipulation pipeline.</h2>
        <p class="lede">
          Work from quick binary classification through tactic naming, explanation, pressure rounds,
          AI-versus-human comparison, and finally adversarial statement building.
        </p>
      </div>
      <div class="hero-stats">
        ${metricTile("Unlocked", `${unlockedCount}/6`)}
        ${metricTile("Current streak", String(state.progress.streak))}
        ${metricTile("Best streak", String(state.progress.bestStreak))}
        ${metricTile("Attempts", String(attempts))}
      </div>
    </section>

    <section class="level-grid">
      ${Object.values(LEVEL_META)
        .map((meta) => {
          const unlocked = isLevelUnlocked(state.progress, meta.id);
          const entry = state.progress.byLevel[meta.id];
          const accuracy = levelAccuracy(entry);
          return `
            <article class="level-tile ${unlocked ? "" : "locked"}">
              <div class="level-tile-head">
                <div>
                  <p class="eyebrow">Level ${meta.id}</p>
                  <h3>${escapeHtml(meta.title)}</h3>
                </div>
                <span class="status-badge ${unlocked ? "success" : "muted"}">${unlocked ? "Unlocked" : "Locked"}</span>
              </div>
              <p class="tile-description">${escapeHtml(meta.description)}</p>
              <div class="tile-meta">
                <span>Pass at ${meta.passThreshold}/${meta.rounds}</span>
                <span>Best ${entry.bestScore}/${meta.rounds}</span>
                <span>Accuracy ${percent(accuracy)}</span>
              </div>
              <button class="primary-button" data-action="${unlocked ? "open-level" : "noop"}" data-level-id="${meta.id}" ${unlocked ? "" : "disabled"}>
                ${unlocked ? "Play level" : "Locked"}
              </button>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderProgress() {
  const totals = Object.values(state.progress.byLevel).reduce(
    (accumulator, entry) => {
      accumulator.correct += entry.correctAnswers;
      accumulator.total += entry.totalQuestions;
      return accumulator;
    },
    { correct: 0, total: 0 },
  );

  const overallAccuracy = totals.total ? totals.correct / totals.total : 0;

  return `
    <section class="stack">
      <div class="panel panel-wide">
        <p class="eyebrow">Progress</p>
        <h2>Local performance snapshot</h2>
        <p class="lede">This browser stores unlocked levels, streaks, attempts, and replay history.</p>
        <div class="hero-stats">
          ${metricTile("Overall accuracy", percent(overallAccuracy))}
          ${metricTile("Best streak", String(state.progress.bestStreak))}
          ${metricTile("Unlocked", `${state.progress.unlockedLevels.length}/6`)}
          ${metricTile("Questions seen", String(totals.total))}
        </div>
        <button class="ghost-button" data-action="reset-progress">Reset local progress</button>
      </div>

      <div class="stack">
        ${Object.values(LEVEL_META)
          .map((meta) => {
            const entry = state.progress.byLevel[meta.id];
            const accuracy = levelAccuracy(entry);
            return `
              <article class="panel progress-row">
                <div class="progress-copy">
                  <p class="eyebrow">Level ${meta.id}</p>
                  <h3>${escapeHtml(meta.title)}</h3>
                  <p>${escapeHtml(meta.description)}</p>
                </div>
                <div class="progress-meta">
                  <span>Attempts ${entry.attempts}</span>
                  <span>Best ${entry.bestScore}/${meta.rounds}</span>
                  <span>Correct ${entry.correctAnswers}/${entry.totalQuestions || 0}</span>
                </div>
                ${progressBar(accuracy)}
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderAbout() {
  return `
    <section class="stack">
      <div class="panel panel-wide">
        <p class="eyebrow">About</p>
        <h2>How this version is wired</h2>
        <p class="lede">
          Levels 1, 2, 4, and 6 call your real backends when the URLs are reachable from the browser.
          If a backend URL is missing, the app can still keep the workflow alive with local mock predictions.
        </p>
      </div>

      <div class="panel panel-wide">
        <p class="eyebrow">Backend health</p>
        <div class="backend-grid">
          ${backendCard("Binary classifier", state.apiStatus.binary, state.settings.binaryBaseUrl)}
          ${backendCard("Multiclass classifier", state.apiStatus.multiclass, state.settings.multiclassBaseUrl)}
        </div>
        <div class="button-row">
          <button class="ghost-button" data-action="refresh-status">Refresh status</button>
          <a class="ghost-button link-button" href="#/">Back to play</a>
        </div>
      </div>

      <div class="panel panel-wide" id="settings-section">
        <p class="eyebrow">API Settings</p>
        <h3>Point the browser at your local backends</h3>
        <p class="helper-text">
          Leave the binary URL empty to stay in mock mode, or point it at a local server on port 5000. Private or Tailscale URLs only work when this browser can reach them.
        </p>
        <div class="settings-grid">
          <label class="field">
            <span>Binary base URL</span>
            <input id="binary-url-input" type="url" value="${escapeHtml(state.settings.binaryBaseUrl)}" placeholder="http://127.0.0.1:5000" />
          </label>
          <label class="field">
            <span>Multiclass base URL</span>
            <input id="multiclass-url-input" type="url" value="${escapeHtml(state.settings.multiclassBaseUrl)}" placeholder="http://127.0.0.1:8000" />
          </label>
          <label class="checkbox-row">
            <input id="allow-mock-input" type="checkbox" ${state.settings.allowMockFallback ? "checked" : ""} />
            <span>Allow mock fallback when a URL is missing</span>
          </label>
        </div>
        <div class="button-row">
          <button class="primary-button" data-action="save-settings">Save settings</button>
          <button class="ghost-button" data-action="refresh-status">Recheck health</button>
        </div>
      </div>
    </section>
  `;
}

function renderPlay(levelId) {
  const meta = LEVEL_META[levelId];
  if (!meta) {
    return renderMissing();
  }

  if (!isLevelUnlocked(state.progress, levelId)) {
    return `
      <section class="panel panel-wide center-panel">
        <p class="eyebrow">Locked</p>
        <h2>This level is not unlocked yet.</h2>
        <p class="lede">Pass the earlier level threshold before moving here.</p>
        <a class="primary-button link-button" href="#/">Back to level hub</a>
      </section>
    `;
  }

  const session = getSession(levelId);

  if (session.completed) {
    const passed = session.score >= meta.passThreshold;
    return `
      <section class="stack">
        ${renderSessionHeader(meta, session)}
        <div class="panel panel-wide result-panel">
          <p class="eyebrow">Session complete</p>
          <h2>${session.score} / ${meta.rounds} correct</h2>
          <p class="lede">
            ${passed ? "Next level unlocked or confirmed." : "Replay the level to clear the threshold and move forward."}
          </p>
          <div class="hero-stats">
            ${metricTile("Threshold", `${meta.passThreshold}/${meta.rounds}`)}
            ${metricTile("Streak", String(state.progress.streak))}
            ${metricTile("Mode", passed ? "Pass" : "Replay needed")}
          </div>
          <div class="button-row">
            <button class="primary-button" data-action="replay-level" data-level-id="${levelId}">Replay level</button>
            <a class="ghost-button link-button" href="#/">Back to hub</a>
            ${passed && levelId < 6 ? `<a class="ghost-button link-button" href="#/play/${levelId + 1}">Next level</a>` : ""}
          </div>
        </div>
      </section>
    `;
  }

  const question = session.questions[session.roundIndex];
  const tabs = meta.kind === "binary" || meta.kind === "multiclass" ? renderTabs(levelId, session) : "";
  const body = renderLevelBody(meta, session, question);

  return `
    <section class="stack">
      ${renderSessionHeader(meta, session)}
      ${tabs}
      ${body}
    </section>
  `;
}

function renderLevelBody(meta, session, question) {
  if ((meta.kind === "binary" || meta.kind === "multiclass") && session.tab === "custom") {
    return renderCustomClassifier(meta, session);
  }

  switch (meta.kind) {
    case "binary":
      return renderBinaryRound(meta, session, question);
    case "multiclass":
      return renderMulticlassRound(meta, session, question);
    case "explain":
      return renderExplainRound(meta, session, question);
    case "timed":
      return renderTimedRound(meta, session, question);
    case "versus":
      return renderVersusRound(meta, session, question);
    case "builder":
      return renderBuilderRound(meta, session, question);
    default:
      return renderMissing();
  }
}

function renderBinaryRound(meta, session, question) {
  return `
    <div class="question-block">
      ${questionCard(meta.prompt, question.text)}
      <div class="button-grid two-up">
        ${answerButton(session, "true", "True")}
        ${answerButton(session, "misleading", "Misleading")}
      </div>
      ${session.loading ? loadingPanel("Calling binary classifier…") : ""}
      ${session.error ? renderErrorPanel(session.error) : ""}
      ${session.roundResolved ? renderBinaryFeedback(session, question) : ""}
    </div>
  `;
}

function renderMulticlassRound(meta, session, question) {
  return `
    <div class="question-block">
      ${questionCard(meta.prompt, question.text)}
      <div class="button-grid">
        ${CATEGORY_OPTIONS.map((category) => answerButton(session, category, category)).join("")}
      </div>
      ${session.loading ? loadingPanel("Calling multiclass classifier…") : ""}
      ${session.error ? renderErrorPanel(session.error) : ""}
      ${session.roundResolved ? renderMulticlassFeedback(session, question) : ""}
    </div>
  `;
}

function renderExplainRound(meta, session, question) {
  return `
    <div class="question-block">
      ${questionCard(meta.prompt, question.text)}
      <div class="button-grid">
        ${CATEGORY_OPTIONS.map((category) => tacticButton(session, category)).join("")}
      </div>
      <label class="field">
        <span>Your explanation</span>
        <textarea data-field="explanation" data-level-id="${session.levelId}" rows="5" placeholder="Explain why the tactic fits and what makes the statement misleading.">${escapeHtml(session.explanation)}</textarea>
      </label>
      <div class="button-row">
        <button class="primary-button" data-action="submit-explanation" data-level-id="${session.levelId}" ${!session.selectedTactic || sentenceWordCount(session.explanation) < 4 ? "disabled" : ""}>Submit answer</button>
      </div>
      ${session.roundResolved ? renderExplainFeedback(session, question) : ""}
    </div>
  `;
}

function renderTimedRound(meta, session, question) {
  return `
    <div class="question-block">
      <div class="timer-strip">
        <div>
          <p class="eyebrow">Time pressure</p>
          <p>Answer before the ring runs out.</p>
        </div>
        ${timerRing(timeLeftSeconds(session), meta.timerSeconds)}
      </div>
      ${questionCard(meta.prompt, question.text)}
      <div class="button-grid two-up">
        ${answerButton(session, "true", "True")}
        ${answerButton(session, "misleading", "Misleading")}
      </div>
      ${session.loading ? loadingPanel("Calling binary classifier…") : ""}
      ${session.error ? renderErrorPanel(session.error) : ""}
      ${session.roundResolved ? renderTimedFeedback(session, question) : ""}
    </div>
  `;
}

function renderVersusRound(meta, session, question) {
  return `
    <div class="question-block">
      ${questionCard(meta.prompt, "One statement is plausible. One is fabricated to sound plausible.")}
      <div class="versus-grid">
        ${question.options
          .map(
            (option, index) => `
              <button class="versus-card ${session.roundResolved ? versusStateClass(session, question, index) : ""}" data-action="choose-versus" data-level-id="${session.levelId}" data-option-index="${index}" ${session.roundResolved ? "disabled" : ""}>
                <span class="eyebrow">Statement ${String.fromCharCode(65 + index)}</span>
                <span>${escapeHtml(option.text)}</span>
              </button>
            `,
          )
          .join("")}
      </div>
      ${session.roundResolved ? renderVersusFeedback(session, question) : ""}
    </div>
  `;
}

function renderBuilderRound(meta, session, prompt) {
  return `
    <div class="question-block">
      ${questionCard(meta.prompt, prompt.prompt || prompt)}
      <div class="button-grid">
        ${CATEGORY_OPTIONS.map((category) => tacticButton(session, category)).join("")}
      </div>
      <label class="field">
        <span>Your statement</span>
        <textarea data-field="builder-text" data-level-id="${session.levelId}" rows="5" placeholder="Write a manipulative statement that fits your chosen tactic.">${escapeHtml(session.builderText)}</textarea>
      </label>
      <div class="button-row">
        <button class="primary-button" data-action="submit-builder" data-level-id="${session.levelId}" ${!session.selectedTactic || sentenceWordCount(session.builderText) < 4 || session.loading ? "disabled" : ""}>Submit to classifier</button>
      </div>
      ${session.loading ? loadingPanel("Calling multiclass classifier…") : ""}
      ${session.error ? renderErrorPanel(session.error) : ""}
      ${session.roundResolved ? renderBuilderFeedback(session, prompt) : ""}
    </div>
  `;
}

function renderCustomClassifier(meta, session) {
  const isBinary = meta.kind === "binary";
  return `
    <div class="question-block">
      <div class="panel panel-wide">
        <p class="eyebrow">Try your own text</p>
        <h3>${isBinary ? "Run a binary check" : "Run a tactic classification"}</h3>
        <label class="field">
          <span>${isBinary ? "Headline or claim" : "Statement"}</span>
          <textarea data-field="custom-input" data-level-id="${session.levelId}" rows="5" placeholder="${isBinary ? "Paste a headline or claim…" : "Paste a statement…"}">${escapeHtml(session.customInput)}</textarea>
        </label>
        <div class="button-row">
          <button class="primary-button" data-action="submit-custom" data-level-id="${session.levelId}" ${sentenceWordCount(session.customInput) < 2 || session.customLoading ? "disabled" : ""}>Classify text</button>
          <button class="ghost-button" data-action="set-tab" data-level-id="${session.levelId}" data-tab="play">Back to rounds</button>
        </div>
      </div>
      ${session.customLoading ? loadingPanel("Classifying custom input…") : ""}
      ${session.customError ? renderErrorPanel(session.customError, true) : ""}
      ${session.customResult ? renderCustomResult(meta, session.customResult) : ""}
    </div>
  `;
}

function renderCustomResult(meta, result) {
  return `
    <div class="panel panel-wide">
      <div class="feedback-head">
        <p class="eyebrow">Classifier output</p>
        <span class="status-badge ${result.mode === "mock" ? "warning" : "success"}">${result.mode === "mock" ? "Mock" : "Live"}</span>
      </div>
      <h3>${meta.kind === "binary" ? escapeHtml(result.label) : escapeHtml(result.label)}</h3>
      ${confidenceMeter(result.confidence, meta.kind === "binary" ? "Confidence" : "Top-class confidence")}
      ${meta.kind === "multiclass" ? probabilityChart(result.probabilities, result.label) : ""}
    </div>
  `;
}

function renderBinaryFeedback(session, question) {
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.wasCorrect ? "Correct" : "Not quite"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "danger"}">${session.wasCorrect ? "Scored" : "Missed"}</span>
      </div>
      <h3>${session.selectedAnswer === "timeout" ? "Time expired." : `Answer: ${escapeHtml(question.answer)}`}</h3>
      <p>${escapeHtml(question.explanation)}</p>
      ${session.modelResult ? renderModelPanel(session.modelResult, "Model says") : ""}
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderMulticlassFeedback(session, question) {
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.wasCorrect ? "Correct" : "Review"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "danger"}">${session.wasCorrect ? "Scored" : "Missed"}</span>
      </div>
      <h3>Answer: ${escapeHtml(question.answer)}</h3>
      <p>${escapeHtml(question.explanation)}</p>
      ${session.modelResult ? renderModelPanel(session.modelResult, "Model prediction", true) : ""}
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderExplainFeedback(session, question) {
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.wasCorrect ? "Solid reasoning" : "Needs tightening"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "warning"}">${session.wasCorrect ? "Pass" : "Review"}</span>
      </div>
      <h3>Correct tactic: ${escapeHtml(question.answer)}</h3>
      <p>${escapeHtml(question.explanation)}</p>
      <ul class="feedback-list">
        ${session.rubric.bullets
          .map(
            (bullet) => `
              <li class="${bullet.ok ? "ok" : ""}">
                <span>${bullet.ok ? "✓" : "○"}</span>
                <span>${escapeHtml(bullet.text)}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderTimedFeedback(session, question) {
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.selectedAnswer === "timeout" ? "Time expired" : session.wasCorrect ? "Correct under pressure" : "Tricky one"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "danger"}">${session.wasCorrect ? "Scored" : "Missed"}</span>
      </div>
      <h3>${session.selectedAnswer === "timeout" ? `Answer: ${escapeHtml(question.answer)}` : `Answer: ${escapeHtml(question.answer)}`}</h3>
      <p>${escapeHtml(question.explanation)}</p>
      ${session.modelResult ? renderModelPanel(session.modelResult, "Model says") : ""}
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderVersusFeedback(session, question) {
  const fakeOption = question.options[question.correctIndex];
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.wasCorrect ? "You spotted it" : "The fake slipped through"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "danger"}">${session.wasCorrect ? "Scored" : "Missed"}</span>
      </div>
      <h3>Fabricated statement: ${escapeHtml(fakeOption.text)}</h3>
      <p>${escapeHtml(question.explanation)}</p>
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderBuilderFeedback(session, prompt) {
  return `
    <div class="panel panel-wide result-panel">
      <div class="feedback-head">
        <p class="eyebrow">${session.wasCorrect ? "Model caught the intended tactic" : "Model read it differently"}</p>
        <span class="status-badge ${session.wasCorrect ? "success" : "warning"}">${session.wasCorrect ? "Matched" : "Mismatch"}</span>
      </div>
      <h3>You aimed for ${escapeHtml(session.selectedTactic)}</h3>
      <p>Prompt: ${escapeHtml(prompt.prompt || prompt)}</p>
      ${session.modelResult ? renderModelPanel(session.modelResult, "Model prediction", true) : ""}
      <div class="button-row">
        <button class="primary-button" data-action="next-round" data-level-id="${session.levelId}">
          ${session.roundIndex + 1 >= session.questions.length ? "See results" : "Next round"}
        </button>
      </div>
    </div>
  `;
}

function renderErrorPanel(error, custom = false) {
  return `
    <div class="panel panel-wide error-panel">
      <div class="feedback-head">
        <p class="eyebrow">Backend unavailable</p>
        <span class="status-badge danger">Error</span>
      </div>
      <h3>${escapeHtml(error.message)}</h3>
      <p>${escapeHtml(error.help)}</p>
      ${error.url ? `<p class="mono-line">URL: ${escapeHtml(error.url)}</p>` : ""}
      <div class="button-row">
        <button class="ghost-button" data-action="${custom ? "retry-custom" : "retry-error"}" data-level-id="${error.levelId}">Retry</button>
        ${state.settings.allowMockFallback ? `<button class="primary-button" data-action="${custom ? "continue-custom-mock" : "continue-mock"}" data-level-id="${error.levelId}">Continue in mock mode</button>` : ""}
      </div>
    </div>
  `;
}

function renderSessionHeader(meta, session) {
  return `
    <div class="session-head">
      <div>
        <a class="back-link" href="#/">← All levels</a>
        <p class="eyebrow">Level ${meta.id}</p>
        <h2>${escapeHtml(meta.title)}</h2>
      </div>
      <div class="session-hud">
        ${metricTile("Round", `${session.roundIndex + 1}/${meta.rounds}`)}
        ${metricTile("Score", `${session.score}/${meta.rounds}`)}
        ${metricTile("Streak", String(state.progress.streak))}
      </div>
    </div>
  `;
}

function renderTabs(levelId, session) {
  return `
    <div class="tabs">
      <button class="tab ${session.tab === "play" ? "active" : ""}" data-action="set-tab" data-level-id="${levelId}" data-tab="play">Play</button>
      <button class="tab ${session.tab === "custom" ? "active" : ""}" data-action="set-tab" data-level-id="${levelId}" data-tab="custom">Try your own text</button>
    </div>
  `;
}

function metricTile(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function progressBar(value) {
  return `
    <div class="progress-bar">
      <div class="progress-fill" style="width:${Math.round(clamp(value, 0, 1) * 100)}%"></div>
    </div>
  `;
}

function backendCard(title, status, url) {
  return `
    <article class="backend-card">
      <div class="feedback-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="status-badge ${status.tone}">${escapeHtml(status.label)}</span>
      </div>
      <p>${escapeHtml(status.detail)}</p>
      <p class="mono-line">${escapeHtml(url || "(not configured)")}</p>
    </article>
  `;
}

function questionCard(prompt, text) {
  return `
    <div class="panel panel-wide">
      <p class="eyebrow">${escapeHtml(prompt)}</p>
      <div class="statement">${escapeHtml(text)}</div>
    </div>
  `;
}

function answerButton(session, value, label) {
  const disabled = session.roundResolved || session.loading || !!session.error;
  const selected = session.selectedAnswer === value;
  return `
    <button class="answer-button ${selected ? "selected" : ""}" data-action="choose-answer" data-level-id="${session.levelId}" data-answer="${escapeHtml(value)}" ${disabled ? "disabled" : ""}>
      ${escapeHtml(label)}
    </button>
  `;
}

function tacticButton(session, value) {
  const selected = session.selectedTactic === value;
  const disabled = session.roundResolved || session.loading;
  return `
    <button class="answer-button ${selected ? "selected" : ""}" data-action="select-tactic" data-level-id="${session.levelId}" data-tactic="${escapeHtml(value)}" ${disabled ? "disabled" : ""}>
      ${escapeHtml(value)}
    </button>
  `;
}

function loadingPanel(message) {
  return `
    <div class="panel panel-wide loading-panel">
      <div class="spinner" aria-hidden="true"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderModelPanel(result, label, includeProbabilities = false) {
  return `
    <div class="model-panel">
      <div class="feedback-head">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <span class="status-badge ${result.mode === "mock" ? "warning" : "success"}">${result.mode === "mock" ? "Mock" : "Live"}</span>
      </div>
      <h4>${escapeHtml(result.label)}</h4>
      ${confidenceMeter(result.confidence, includeProbabilities ? "Top-class confidence" : "Confidence")}
      ${includeProbabilities ? probabilityChart(result.probabilities, result.label) : ""}
    </div>
  `;
}

function confidenceMeter(value, label) {
  const width = Math.round(clamp(value || 0, 0, 1) * 100);
  return `
    <div class="meter-wrap">
      <div class="meter-label">
        <span>${escapeHtml(label)}</span>
        <strong>${width}%</strong>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${width}%"></div></div>
    </div>
  `;
}

function probabilityChart(probabilities, highlight) {
  return `
    <div class="probability-chart">
      ${CATEGORY_OPTIONS.map((category) => {
        const value = clamp(probabilities?.[category] || 0, 0, 1);
        return `
          <div class="probability-row">
            <div class="meter-label">
              <span class="${highlight === category ? "highlight" : ""}">${escapeHtml(category)}</span>
              <strong>${percent(value)}</strong>
            </div>
            <div class="progress-bar"><div class="progress-fill ${highlight === category ? "highlight" : ""}" style="width:${Math.round(value * 100)}%"></div></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function timerRing(secondsLeft, totalSeconds) {
  const ratio = clamp(secondsLeft / totalSeconds, 0, 1);
  const dash = 176;
  const offset = dash - dash * ratio;
  return `
    <div class="timer-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="timer-track" cx="32" cy="32" r="28"></circle>
        <circle class="timer-progress" cx="32" cy="32" r="28" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <strong>${Math.ceil(secondsLeft)}</strong>
    </div>
  `;
}

function renderMissing() {
  return `
    <section class="panel panel-wide center-panel">
      <p class="eyebrow">404</p>
      <h2>That route does not exist.</h2>
      <a class="primary-button link-button" href="#/">Back to level hub</a>
    </section>
  `;
}

function getSession(levelId) {
  if (!state.sessions.has(levelId)) {
    state.sessions.set(levelId, createSession(levelId));
  }
  return state.sessions.get(levelId);
}

function createSession(levelId) {
  const meta = LEVEL_META[levelId];
  return {
    levelId,
    tab: "play",
    questions: buildQuestions(levelId, meta.rounds),
    roundIndex: 0,
    score: 0,
    completed: false,
    loading: false,
    roundResolved: false,
    selectedAnswer: null,
    selectedTactic: null,
    explanation: "",
    builderText: "",
    modelResult: null,
    rubric: null,
    error: null,
    pendingAction: null,
    customInput: "",
    customLoading: false,
    customResult: null,
    customError: null,
    customPendingAction: null,
    deadline: null,
    wasCorrect: false,
  };
}

function buildQuestions(levelId, rounds) {
  if (levelId === 1) {
    return sample(CONTENT.level1, rounds);
  }
  if (levelId === 2) {
    return sample(CONTENT.level2, rounds);
  }
  if (levelId === 3) {
    return sample(CONTENT.level3, rounds);
  }
  if (levelId === 4) {
    return sample(CONTENT.level4, rounds);
  }
  if (levelId === 5) {
    return sample(CONTENT.level5, rounds).map((entry) => {
      const options = shuffle([
        { text: entry.trueText, kind: "true" },
        { text: entry.fakeText, kind: "fake" },
      ]);
      return {
        ...entry,
        options,
        correctIndex: options.findIndex((option) => option.kind === "fake"),
      };
    });
  }
  return sample(CONTENT.level6, rounds).map((prompt) => ({ prompt }));
}

async function handleClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const levelId = Number(actionTarget.dataset.levelId || 0);

  if (action === "noop") {
    return;
  }

  if (action === "open-level") {
    location.hash = `#/play/${levelId}`;
    return;
  }

  if (action === "replay-level") {
    state.sessions.delete(levelId);
    location.hash = `#/play/${levelId}`;
    render();
    return;
  }

  if (action === "next-round") {
    advanceRound(levelId);
    render();
    return;
  }

  if (action === "choose-answer") {
    await submitClassifierRound(levelId, actionTarget.dataset.answer, false);
    return;
  }

  if (action === "choose-versus") {
    handleVersusChoice(levelId, Number(actionTarget.dataset.optionIndex));
    render();
    return;
  }

  if (action === "select-tactic") {
    const session = getSession(levelId);
    if (!session.roundResolved && !session.loading) {
      session.selectedTactic = actionTarget.dataset.tactic;
      render();
    }
    return;
  }

  if (action === "submit-explanation") {
    submitExplanation(levelId);
    render();
    return;
  }

  if (action === "submit-builder") {
    await submitBuilder(levelId, false);
    return;
  }

  if (action === "retry-error") {
    await retryError(levelId, false);
    return;
  }

  if (action === "continue-mock") {
    await retryError(levelId, true);
    return;
  }

  if (action === "submit-custom") {
    await submitCustom(levelId, false);
    return;
  }

  if (action === "retry-custom") {
    await submitCustom(levelId, false);
    return;
  }

  if (action === "continue-custom-mock") {
    await submitCustom(levelId, true);
    return;
  }

  if (action === "set-tab") {
    const session = getSession(levelId);
    session.tab = actionTarget.dataset.tab;
    render();
    return;
  }

  if (action === "reset-progress") {
    if (window.confirm("Reset all local progress for this browser?")) {
      state.progress = resetProgress();
      state.sessions.clear();
      render();
    }
    return;
  }

  if (action === "refresh-status") {
    await refreshApiStatuses();
    render();
    return;
  }

  if (action === "save-settings") {
    await saveApiSettings();
  }
}

function handleInput(event) {
  const input = event.target;
  const levelId = Number(input.dataset.levelId || 0);
  if (!levelId) {
    return;
  }

  const session = getSession(levelId);
  if (input.dataset.field === "explanation") {
    session.explanation = input.value;
  }
  if (input.dataset.field === "builder-text") {
    session.builderText = input.value;
  }
  if (input.dataset.field === "custom-input") {
    session.customInput = input.value;
  }
}

async function submitClassifierRound(levelId, answer, forceMock) {
  const session = getSession(levelId);
  const meta = LEVEL_META[levelId];
  const question = session.questions[session.roundIndex];

  if (session.loading || session.roundResolved) {
    return;
  }

  session.loading = true;
  session.error = null;
  session.selectedAnswer = answer;
  session.pendingAction = { type: "round", answer };
  clearTimer();
  render();

  try {
    if (answer === "timeout") {
      session.roundResolved = true;
      session.wasCorrect = false;
      session.modelResult = null;
    } else if (meta.kind === "binary" || meta.kind === "timed") {
      session.modelResult = await binaryPredict(question.text, { forceMock });
      session.wasCorrect = answer === question.answer;
    } else {
      session.modelResult = await multiclassPredict(question.text, { forceMock });
      session.wasCorrect = answer === question.answer;
    }

    if (session.wasCorrect) {
      session.score += 1;
    }

    session.roundResolved = true;
    session.error = null;
  } catch (error) {
    session.error = createErrorState(levelId, meta.kind === "multiclass" ? "multiclass" : "binary", error);
  } finally {
    session.loading = false;
    render();
  }
}

function submitExplanation(levelId) {
  const session = getSession(levelId);
  const question = session.questions[session.roundIndex];

  if (session.roundResolved || !session.selectedTactic || sentenceWordCount(session.explanation) < 4) {
    return;
  }

  session.pendingAction = { type: "explanation" };
  session.rubric = evaluateExplanation(session.explanation, session.selectedTactic, question.answer);
  session.wasCorrect = session.selectedTactic === question.answer && session.rubric.score >= 0.5;
  if (session.wasCorrect) {
    session.score += 1;
  }
  session.roundResolved = true;
}

function handleVersusChoice(levelId, optionIndex) {
  const session = getSession(levelId);
  const question = session.questions[session.roundIndex];

  if (session.roundResolved) {
    return;
  }

  session.selectedAnswer = String(optionIndex);
  session.wasCorrect = optionIndex === question.correctIndex;
  if (session.wasCorrect) {
    session.score += 1;
  }
  session.roundResolved = true;
}

async function submitBuilder(levelId, forceMock) {
  const session = getSession(levelId);
  const prompt = session.questions[session.roundIndex];

  if (session.loading || session.roundResolved || !session.selectedTactic || sentenceWordCount(session.builderText) < 4) {
    return;
  }

  session.loading = true;
  session.error = null;
  session.pendingAction = { type: "builder" };
  render();

  try {
    session.modelResult = await multiclassPredict(session.builderText, { forceMock });
    session.wasCorrect = session.modelResult.label === session.selectedTactic;
    if (session.wasCorrect) {
      session.score += 1;
    }
    session.roundResolved = true;
  } catch (error) {
    session.error = createErrorState(levelId, "multiclass", error);
  } finally {
    session.loading = false;
    render();
  }
}

async function submitCustom(levelId, forceMock) {
  const session = getSession(levelId);
  const meta = LEVEL_META[levelId];

  if (session.customLoading || sentenceWordCount(session.customInput) < 2) {
    return;
  }

  session.customLoading = true;
  session.customError = null;
  session.customPendingAction = { type: "custom" };
  render();

  try {
    session.customResult =
      meta.kind === "binary"
        ? await binaryPredict(session.customInput.trim(), { forceMock })
        : await multiclassPredict(session.customInput.trim(), { forceMock });
  } catch (error) {
    session.customError = createErrorState(levelId, meta.kind === "binary" ? "binary" : "multiclass", error);
  } finally {
    session.customLoading = false;
    render();
  }
}

async function retryError(levelId, forceMock) {
  const session = getSession(levelId);
  if (!session.pendingAction) {
    return;
  }

  if (session.pendingAction.type === "round") {
    await submitClassifierRound(levelId, session.pendingAction.answer, forceMock);
    return;
  }

  if (session.pendingAction.type === "builder") {
    await submitBuilder(levelId, forceMock);
  }
}

function advanceRound(levelId) {
  const session = getSession(levelId);
  const meta = LEVEL_META[levelId];

  if (session.roundIndex + 1 >= session.questions.length) {
    completeSession(session, meta);
    return;
  }

  session.roundIndex += 1;
  session.loading = false;
  session.roundResolved = false;
  session.selectedAnswer = null;
  session.selectedTactic = null;
  session.explanation = "";
  session.builderText = "";
  session.modelResult = null;
  session.rubric = null;
  session.error = null;
  session.pendingAction = null;
  session.wasCorrect = false;
  session.deadline = null;
}

function completeSession(session, meta) {
  if (session.completed) {
    return;
  }

  clearTimer();
  session.completed = true;
  state.progress = recordSession(state.progress, session.levelId, session.score, meta.rounds);
}

function createErrorState(levelId, service, error) {
  return {
    levelId,
    service,
    message: formatError(error),
    help: "Retry the request, or continue in mock mode if you want to keep the level playable.",
    url: service === "binary" ? binaryBaseUrl() : multiclassBaseUrl(),
  };
}

function formatError(error) {
  if (error instanceof TimeoutError) {
    return "The backend took too long to respond.";
  }
  if (error instanceof ApiError) {
    return `Backend returned ${error.status}.`;
  }
  if (error instanceof NetworkError) {
    return error.message;
  }
  return error?.message || "Unknown error while calling the backend.";
}

function evaluateExplanation(explanation, chosenTactic, correctTactic) {
  const text = explanation.toLowerCase();
  const bullets = [
    {
      ok: sentenceWordCount(explanation) >= 12,
      text: "Explanation is substantive (12 words or more).",
    },
    {
      ok: text.includes(chosenTactic.split(" ")[0]),
      text: `References the chosen tactic: ${chosenTactic}.`,
    },
    {
      ok: /\bbecause\b|\bsince\b|\bimplies\b|\bframes\b|\bdeflects\b|\bignores\b/.test(text),
      text: "Includes a causal or structural reason.",
    },
    {
      ok: /\bevidence\b|\balternative\b|\bother option\b|\bcontext\b|\bmissing\b/.test(text),
      text: "Mentions missing evidence, alternatives, or context.",
    },
    {
      ok: chosenTactic === correctTactic,
      text: `Chosen tactic matches the ground truth: ${correctTactic}.`,
    },
  ];

  return {
    score: bullets.filter((bullet) => bullet.ok).length / bullets.length,
    bullets,
  };
}

async function saveApiSettings() {
  const binaryInput = document.getElementById("binary-url-input");
  const multiclassInput = document.getElementById("multiclass-url-input");
  const allowMockInput = document.getElementById("allow-mock-input");

  const nextSettings = {
    binaryBaseUrl: binaryInput?.value.trim() || "",
    multiclassBaseUrl: multiclassInput?.value.trim() || "",
    allowMockFallback: !!allowMockInput?.checked,
  };

  saveSettings(nextSettings);
  state.settings = loadSettings();
  await refreshApiStatuses();
  render();
}

async function refreshApiStatuses() {
  state.settings = loadSettings();

  const [binary, multiclass] = await Promise.allSettled([
    binaryHealth(),
    multiclassHealth(),
  ]);

  state.apiStatus.binary = settledStatus(
    binary,
    state.settings.binaryBaseUrl,
    "Binary URL not configured. Browser will use mock when allowed.",
  );
  state.apiStatus.multiclass = settledStatus(
    multiclass,
    state.settings.multiclassBaseUrl,
    "Multiclass URL not configured. Browser will use mock when allowed.",
  );

  updateStatusPills();
  const route = parseRoute();
  if (route.name === "about") {
    render();
  }
}

function settledStatus(result, configuredUrl, emptyMessage) {
  if (!configuredUrl) {
    return { label: "Mock", tone: "warning", detail: emptyMessage };
  }

  if (result.status === "fulfilled" && result.value.ok) {
    return { label: "Live", tone: "success", detail: "Reachable from this browser." };
  }

  if (state.settings.allowMockFallback) {
    return {
      label: "Fallback",
      tone: "warning",
      detail: "Configured backend is unreachable, but the browser can continue in mock mode.",
    };
  }

  return { label: "Down", tone: "danger", detail: "Configured, but unreachable from this browser." };
}

function updateStatusPills() {
  statusPillsElement.innerHTML = `
    <div class="status-pill-row">
      <span>Binary</span>
      <span class="status-badge ${state.apiStatus.binary.tone}">${escapeHtml(state.apiStatus.binary.label)}</span>
    </div>
    <div class="status-pill-row">
      <span>Multiclass</span>
      <span class="status-badge ${state.apiStatus.multiclass.tone}">${escapeHtml(state.apiStatus.multiclass.label)}</span>
    </div>
  `;
}

function updateNav(route) {
  document.querySelectorAll("[data-route-link]").forEach((link) => {
    const href = link.getAttribute("href");
    const isActive =
      (route.name === "hub" && href === "#/") ||
      (route.name === "progress" && href === "#/progress") ||
      (route.name === "about" && href === "#/about");
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function maybeStartTimedLoop(levelId) {
  const session = getSession(levelId);
  const meta = LEVEL_META[levelId];

  if (meta.kind !== "timed" || session.completed || session.roundResolved || session.loading) {
    return;
  }

  if (!session.deadline) {
    session.deadline = Date.now() + meta.timerSeconds * 1000;
  }

  if (state.timerId) {
    return;
  }

  state.timerId = window.setInterval(() => {
    const route = parseRoute();
    if (route.name !== "play" || route.levelId !== levelId) {
      clearTimer();
      return;
    }

    const activeSession = getSession(levelId);
    if (activeSession.roundResolved || activeSession.completed) {
      clearTimer();
      return;
    }

    if (timeLeftSeconds(activeSession) <= 0) {
      clearTimer();
      submitClassifierRound(levelId, "timeout", false);
      return;
    }

    render();
  }, 250);
}

function clearTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function clearTimerIfNeeded(route) {
  if (route.name !== "play" || LEVEL_META[route.levelId]?.kind !== "timed") {
    clearTimer();
  }
}

function timeLeftSeconds(session) {
  if (!session.deadline) {
    return LEVEL_META[session.levelId].timerSeconds || 0;
  }
  return Math.max(0, (session.deadline - Date.now()) / 1000);
}

function versusStateClass(session, question, index) {
  if (!session.roundResolved) {
    return "";
  }
  if (index === question.correctIndex) {
    return "correct";
  }
  if (Number(session.selectedAnswer) === index) {
    return "wrong";
  }
  return "muted";
}

// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // State
  let testCases = [];
  let timeLimit = 1000;
  let memoryLimit = 256;
  let allExpanded = false;
  let isJudging = false;

  // Timer State: 3 modes ('opened' | 'created' | 'session')
  let timerInfo = {
    birthtimeMs: 0,
    mtimeMs: 0,
    firstOpenedAt: Date.now(),
    lastOpenedAt: Date.now(),
    sessionOpenedAt: Date.now(),
    accumulatedMs: 0,
    isRunning: true,
    isPausedByUser: false,
    lastStartedAt: Date.now(),
  };
  let timerMode = 'opened'; // 'opened' | 'created' | 'session'
  let timerTickInterval = null;

  // DOM Elements
  const activeFileNameEl = document.getElementById('active-filename');
  const activeLanguageEl = document.getElementById('active-language');
  const timeLimitInput = /** @type {HTMLInputElement} */ (document.getElementById('time-limit-input'));
  const memoryLimitInput = /** @type {HTMLInputElement} */ (document.getElementById('memory-limit-input'));
  const testCountEl = document.getElementById('test-count');
  const testCardsContainer = document.getElementById('testcase-container');
  const emptyStateEl = document.getElementById('empty-state');
  const cePanelEl = document.getElementById('ce-panel');
  const ceContentEl = document.getElementById('ce-content');
  const btnCloseCe = document.getElementById('btn-close-ce');
  const judgeStatsBadgeEl = document.getElementById('judge-stats-badge');

  // Timer Elements
  const timerBar = document.getElementById('timer-bar');
  const timerDigitsEl = document.getElementById('timer-digits');
  const timerModeTagEl = document.getElementById('timer-mode-tag');
  const timerSecondaryTextEl = document.getElementById('timer-secondary-text');
  const timerDisplayGroupEl = document.getElementById('timer-display');
  const btnTimerToggleMode = document.getElementById('btn-timer-toggle-mode');
  const btnTimerPause = document.getElementById('btn-timer-pause');
  const btnTimerReset = document.getElementById('btn-timer-reset');
  const timerPlayPauseIcon = document.getElementById('timer-play-pause-icon');

  // Toolbar Buttons
  const btnAddTest = document.getElementById('btn-add-test');
  const btnAddNTests = document.getElementById('btn-add-n-tests');
  const btnImportFolder = document.getElementById('btn-import-folder');
  const btnRunAll = document.getElementById('btn-run-all');
  const btnClearAll = document.getElementById('btn-clear-all');
  const btnToggleExpand = document.getElementById('btn-toggle-expand');
  const btnEmptyAdd = document.getElementById('btn-empty-add');
  const btnEmptyImport = document.getElementById('btn-empty-import');

  // Modal Elements
  const addNModal = document.getElementById('add-n-modal');
  const btnModalClose = document.getElementById('btn-modal-close');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const btnModalConfirm = document.getElementById('btn-modal-confirm');
  const nTestsCountInput = /** @type {HTMLInputElement} */ (document.getElementById('n-tests-count'));

  // ========================================================
  // Timer Logic & Formatting
  // ========================================================

  function formatHms(ms) {
    if (ms < 0 || isNaN(ms)) ms = 0;
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function formatRelativeTime(timestampMs) {
    if (!timestampMs || isNaN(timestampMs)) return '--';
    const diffMs = Date.now() - timestampMs;
    if (diffMs < 0) return 'just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    if (diffHr < 24) return remMin > 0 ? `${diffHr}h ${remMin}m ago` : `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function updateTimerUi() {
    const now = Date.now();
    const sessionElapsed = (timerInfo.accumulatedMs || 0) + (timerInfo.isRunning ? Math.max(0, now - (timerInfo.lastStartedAt || now)) : 0);
    const openedElapsed = Math.max(0, now - (timerInfo.lastOpenedAt || timerInfo.sessionOpenedAt || now));
    const createdElapsed = timerInfo.birthtimeMs ? Math.max(0, now - timerInfo.birthtimeMs) : sessionElapsed;

    // Clean old mode styling classes
    timerModeTagEl?.classList.remove('mode-opened', 'mode-created', 'mode-session', 'mode-paused');

    if (timerMode === 'opened') {
      if (timerDigitsEl) timerDigitsEl.textContent = formatHms(openedElapsed);
      if (timerModeTagEl) {
        timerModeTagEl.textContent = 'OPENED';
        timerModeTagEl.classList.add('mode-opened');
      }
      if (timerSecondaryTextEl) {
        const createdStr = timerInfo.birthtimeMs ? `Created: ${formatRelativeTime(timerInfo.birthtimeMs)}` : '';
        const sessionStr = `Session: ${formatHms(sessionElapsed)}`;
        timerSecondaryTextEl.textContent = createdStr ? `${createdStr} · ${sessionStr}` : sessionStr;
      }
      timerDisplayGroupEl?.setAttribute('title', `Mode: OPENED (${formatRelativeTime(timerInfo.lastOpenedAt || timerInfo.sessionOpenedAt || now)}). Click to cycle: Opened ↔ Created ↔ Session`);
    } else if (timerMode === 'created') {
      if (timerDigitsEl) timerDigitsEl.textContent = formatHms(createdElapsed);
      if (timerModeTagEl) {
        timerModeTagEl.textContent = 'CREATED';
        timerModeTagEl.classList.add('mode-created');
      }
      if (timerSecondaryTextEl) {
        const openedStr = `Opened: ${formatRelativeTime(timerInfo.lastOpenedAt || timerInfo.sessionOpenedAt || now)}`;
        const sessionStr = `Session: ${formatHms(sessionElapsed)}`;
        timerSecondaryTextEl.textContent = `${openedStr} · ${sessionStr}`;
      }
      timerDisplayGroupEl?.setAttribute('title', `Mode: CREATED (${formatRelativeTime(timerInfo.birthtimeMs)}). Click to cycle: Opened ↔ Created ↔ Session`);
    } else {
      // Session mode (Active solve stopwatch)
      if (timerDigitsEl) timerDigitsEl.textContent = formatHms(sessionElapsed);
      if (timerModeTagEl) {
        if (timerInfo.isRunning) {
          timerModeTagEl.textContent = 'SESSION';
          timerModeTagEl.classList.add('mode-session');
        } else {
          timerModeTagEl.textContent = 'PAUSED';
          timerModeTagEl.classList.add('mode-paused');
        }
      }
      if (timerSecondaryTextEl) {
        const openedStr = `Opened: ${formatRelativeTime(timerInfo.lastOpenedAt || timerInfo.sessionOpenedAt || now)}`;
        const createdStr = timerInfo.birthtimeMs ? `Created: ${formatRelativeTime(timerInfo.birthtimeMs)}` : '';
        timerSecondaryTextEl.textContent = createdStr ? `${openedStr} · ${createdStr}` : openedStr;
      }
      timerDisplayGroupEl?.setAttribute('title', `Mode: SESSION (${formatHms(sessionElapsed)} active solve time). Click to cycle: Opened ↔ Created ↔ Session`);
    }

    // Play/Pause icon update
    if (timerInfo.isRunning) {
      timerBar?.classList.remove('paused');
      if (timerPlayPauseIcon) {
        timerPlayPauseIcon.innerHTML = `
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/>
        `;
      }
    } else {
      timerBar?.classList.add('paused');
      if (timerPlayPauseIcon) {
        timerPlayPauseIcon.innerHTML = `
          <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
        `;
      }
    }
  }

  function startTimerLoop() {
    if (timerTickInterval) clearInterval(timerTickInterval);
    timerTickInterval = setInterval(updateTimerUi, 1000);
    updateTimerUi();
  }

  // Timer controls: Cycle between 'opened' ➔ 'created' ➔ 'session'
  function toggleTimerMode() {
    if (timerMode === 'opened') {
      timerMode = 'created';
    } else if (timerMode === 'created') {
      timerMode = 'session';
    } else {
      timerMode = 'opened';
    }
    updateTimerUi();
  }

  function toggleTimerPause() {
    const now = Date.now();
    if (timerInfo.isRunning) {
      timerInfo.accumulatedMs += Math.max(0, now - timerInfo.lastStartedAt);
      timerInfo.isRunning = false;
      timerInfo.isPausedByUser = true;
    } else {
      timerInfo.lastStartedAt = now;
      timerInfo.isRunning = true;
      timerInfo.isPausedByUser = false;
    }
    updateTimerUi();
    vscode.postMessage({ type: 'timerTogglePause' });
  }

  function resetTimer() {
    const now = Date.now();
    timerInfo.accumulatedMs = 0;
    timerInfo.lastStartedAt = now;
    timerInfo.sessionOpenedAt = now;
    timerInfo.lastOpenedAt = now;
    timerInfo.isRunning = true;
    timerInfo.isPausedByUser = false;
    updateTimerUi();
    vscode.postMessage({ type: 'timerReset' });
  }

  timerDisplayGroupEl?.addEventListener('click', toggleTimerMode);
  btnTimerToggleMode?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimerMode();
  });
  btnTimerPause?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimerPause();
  });
  btnTimerReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetTimer();
  });

  startTimerLoop();

  // ========================================================
  // Event Listeners for Toolbar and Modals
  // ========================================================

  btnAddTest?.addEventListener('click', () => {
    vscode.postMessage({ type: 'addTestCase' });
  });

  btnEmptyAdd?.addEventListener('click', () => {
    vscode.postMessage({ type: 'addTestCase' });
  });

  btnImportFolder?.addEventListener('click', () => {
    vscode.postMessage({ type: 'importFolder' });
  });

  btnEmptyImport?.addEventListener('click', () => {
    vscode.postMessage({ type: 'importFolder' });
  });

  function flushPendingEdits() {
    clearTimeout(settingsTimeout);
    if (timeLimitInput && memoryLimitInput) {
      const tl = parseInt(timeLimitInput.value, 10) || 1000;
      const ml = parseInt(memoryLimitInput.value, 10) || 256;
      vscode.postMessage({
        type: 'updateSettings',
        timeLimit: tl,
        memoryLimit: ml,
      });
    }

    testCardsContainer?.querySelectorAll('.test-card').forEach((card) => {
      const inEl = /** @type {HTMLTextAreaElement|null} */ (card.querySelector('.input-area'));
      const outEl = /** @type {HTMLTextAreaElement|null} */ (card.querySelector('.output-area'));
      const id = inEl?.getAttribute('data-id');
      if (id) {
        const tc = testCases.find((t) => t.id === id);
        if (tc) {
          const vIn = inEl ? inEl.value : '';
          const vOut = outEl ? outEl.value : '';
          if (tc.input !== vIn || tc.expectedOutput !== vOut) {
            tc.input = vIn;
            tc.expectedOutput = vOut;
            vscode.postMessage({
              type: 'updateTestCase',
              id: tc.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
            });
          }
        }
      }
    });
  }

  btnRunAll?.addEventListener('click', () => {
    if (!isJudging) {
      flushPendingEdits();
      hideCePanel();
      vscode.postMessage({ type: 'runAll' });
    }
  });

  btnClearAll?.addEventListener('click', () => {
    vscode.postMessage({ type: 'clearAllTestCases' });
  });

  btnToggleExpand?.addEventListener('click', () => {
    allExpanded = !allExpanded;
    vscode.postMessage({ type: 'toggleExpandAll', isExpanded: allExpanded });
  });

  // Modal Open / Close & Keyboard Shortcuts
  function openModal() {
    if (addNModal) {
      addNModal.classList.remove('hidden');
      if (nTestsCountInput) {
        nTestsCountInput.focus();
        nTestsCountInput.select();
      }
    }
  }

  function closeModal() {
    addNModal?.classList.add('hidden');
  }

  function submitAddNTests() {
    const count = parseInt(nTestsCountInput?.value || '5', 10);
    if (!isNaN(count) && count >= 1 && count <= 100) {
      vscode.postMessage({ type: 'addNTestCases', count });
      closeModal();
    }
  }

  btnAddNTests?.addEventListener('click', openModal);
  btnModalClose?.addEventListener('click', closeModal);
  btnModalCancel?.addEventListener('click', closeModal);
  btnModalConfirm?.addEventListener('click', submitAddNTests);

  addNModal?.addEventListener('click', (e) => {
    if (e.target === addNModal) {
      closeModal();
    }
  });

  nTestsCountInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAddNTests();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addNModal && !addNModal.classList.contains('hidden')) {
      e.preventDefault();
      closeModal();
    }
  });

  btnCloseCe?.addEventListener('click', hideCePanel);

  function hideCePanel() {
    cePanelEl?.classList.add('hidden');
  }

  function showCePanel(errorText) {
    if (cePanelEl && ceContentEl) {
      ceContentEl.textContent = errorText;
      cePanelEl.classList.remove('hidden');
    }
  }

  // Settings Debounced Updates
  let settingsTimeout;
  function triggerSettingsUpdate() {
    clearTimeout(settingsTimeout);
    settingsTimeout = setTimeout(() => {
      const tl = parseInt(timeLimitInput.value, 10) || 1000;
      const ml = parseInt(memoryLimitInput.value, 10) || 256;
      vscode.postMessage({
        type: 'updateSettings',
        timeLimit: tl,
        memoryLimit: ml,
      });
    }, 400);
  }

  const flushSettings = () => {
    clearTimeout(settingsTimeout);
    const tl = parseInt(timeLimitInput.value, 10) || 1000;
    const ml = parseInt(memoryLimitInput.value, 10) || 256;
    vscode.postMessage({
      type: 'updateSettings',
      timeLimit: tl,
      memoryLimit: ml,
    });
  };

  timeLimitInput?.addEventListener('input', triggerSettingsUpdate);
  timeLimitInput?.addEventListener('change', flushSettings);
  timeLimitInput?.addEventListener('blur', flushSettings);
  memoryLimitInput?.addEventListener('input', triggerSettingsUpdate);
  memoryLimitInput?.addEventListener('change', flushSettings);
  memoryLimitInput?.addEventListener('blur', flushSettings);

  // ========================================================
  // Message Handling from Extension
  // ========================================================

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'setActiveFile':
        if (activeFileNameEl) {
          activeFileNameEl.textContent = msg.fileName;
          activeFileNameEl.title = msg.filePath || msg.fileName;
        }
        if (activeLanguageEl) {
          activeLanguageEl.textContent = msg.language;
          // Set language specific color tag
          activeLanguageEl.setAttribute('data-lang', (msg.language || '').toLowerCase());
        }
        if (msg.timerInfo) {
          timerInfo = msg.timerInfo;
          if (!timerInfo.lastOpenedAt) {
            timerInfo.lastOpenedAt = timerInfo.sessionOpenedAt || Date.now();
          }
          updateTimerUi();
        }
        break;

      case 'updateTimerState':
        if (msg.timerInfo) {
          timerInfo = msg.timerInfo;
          if (!timerInfo.lastOpenedAt) {
            timerInfo.lastOpenedAt = timerInfo.sessionOpenedAt || Date.now();
          }
          updateTimerUi();
        }
        break;

      case 'setProblemData':
        timeLimit = msg.data.timeLimit;
        memoryLimit = msg.data.memoryLimit;
        testCases = msg.data.testCases || [];

        if (timeLimitInput) {
          timeLimitInput.value = String(timeLimit);
        }
        if (memoryLimitInput) {
          memoryLimitInput.value = String(memoryLimit);
        }

        renderTestCases();
        updateSummaryStats();
        break;

      case 'testCaseStatusUpdate': {
        const target = testCases.find((tc) => tc.id === msg.id);
        if (target) {
          target.verdict = msg.verdict;
          target.executionTimeMs = msg.executionTimeMs;
          target.memoryUsageMb = msg.memoryUsageMb;
          target.actualOutput = msg.actualOutput;
          target.diff = msg.diff;
          target.errorMessage = msg.errorMessage;
          if (msg.verdict !== 'AC') {
            target.isExpanded = true;
          }
          updateSingleCard(target);
          updateSummaryStats();
        }
        break;
      }

      case 'judgingStarted':
        isJudging = true;
        if (btnRunAll) {
          btnRunAll.classList.add('judging-running');
          btnRunAll.innerHTML = `
            <svg class="spinning-icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1zm0 2a5 5 0 1 1-5 5 5 5 0 0 1 5-5z" opacity="0.25"/>
              <path d="M8 1a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5V1z"/>
            </svg>
            <span>Judging...</span>
          `;
        }
        break;

      case 'judgingFinished':
        isJudging = false;
        if (btnRunAll) {
          btnRunAll.classList.remove('judging-running');
          btnRunAll.innerHTML = `
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
              <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
            </svg>
            <span>Run All</span>
          `;
        }
        updateSummaryStats();
        break;

      case 'compilationError':
        showCePanel(msg.error);
        break;
    }
  });

  // ========================================================
  // Rendering Logic
  // ========================================================

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateSummaryStats() {
    if (!judgeStatsBadgeEl) return;
    const total = testCases.length;
    if (total === 0) {
      judgeStatsBadgeEl.classList.add('hidden');
      return;
    }

    const acCount = testCases.filter((t) => t.verdict === 'AC').length;
    const judged = testCases.filter((t) => t.verdict && t.verdict !== 'PENDING' && t.verdict !== 'RUNNING').length;

    if (judged === 0) {
      judgeStatsBadgeEl.classList.add('hidden');
      return;
    }

    judgeStatsBadgeEl.classList.remove('hidden');
    if (acCount === total) {
      judgeStatsBadgeEl.className = 'stats-pill ac-all';
      judgeStatsBadgeEl.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> <span>All ${total} AC</span>`;
    } else {
      const failCount = total - acCount;
      judgeStatsBadgeEl.className = 'stats-pill mixed';
      judgeStatsBadgeEl.innerHTML = `<span>${acCount}/${total} AC</span> · <span class="fail-text">${failCount} Failed</span>`;
    }
  }

  function renderTestCases() {
    if (!testCardsContainer) return;

    if (testCountEl) {
      testCountEl.textContent = `${testCases.length} test case${testCases.length !== 1 ? 's' : ''}`;
    }

    if (testCases.length === 0) {
      testCardsContainer.innerHTML = '';
      emptyStateEl?.classList.remove('hidden');
      return;
    }

    emptyStateEl?.classList.add('hidden');
    testCardsContainer.innerHTML = '';

    testCases.forEach((tc) => {
      const cardEl = createCardElement(tc);
      testCardsContainer.appendChild(cardEl);
    });
  }

  function createCardElement(tc) {
    const card = document.createElement('div');
    card.id = `test-card-${tc.id}`;
    card.className = `test-card ${tc.isExpanded ? 'expanded' : ''} ${getVerdictClass(tc.verdict)}`;

    card.innerHTML = buildCardInnerHtml(tc);
    bindCardEvents(card, tc);
    return card;
  }

  function updateSingleCard(tc) {
    const existing = document.getElementById(`test-card-${tc.id}`);
    if (existing) {
      existing.className = `test-card ${tc.isExpanded ? 'expanded' : ''} ${getVerdictClass(tc.verdict)}`;
      existing.innerHTML = buildCardInnerHtml(tc);
      bindCardEvents(existing, tc);
    }
  }

  function getVerdictClass(verdict) {
    if (!verdict) return '';
    switch (verdict.toUpperCase()) {
      case 'AC':
        return 'status-ac';
      case 'WA':
        return 'status-wa';
      case 'TLE':
        return 'status-tle';
      case 'MLE':
        return 'status-mle';
      case 'RTE':
        return 'status-rte';
      case 'CE':
        return 'status-ce';
      case 'RUNNING':
        return 'status-running';
      default:
        return '';
    }
  }

  function getVerdictBadgeHtml(verdict) {
    if (!verdict) return '';
    const v = verdict.toUpperCase();
    let icon = '';
    switch (v) {
      case 'AC':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>';
        break;
      case 'WA':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';
        break;
      case 'TLE':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>';
        break;
      case 'MLE':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm2 1v8h8V4H4z"/></svg>';
        break;
      case 'RTE':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/></svg>';
        break;
      case 'CE':
        icon = '<svg class="badge-icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>';
        break;
      case 'RUNNING':
        icon = '<span class="spinner-dot"></span>';
        break;
    }
    return `<span class="verdict-badge ${v.toLowerCase()}">${icon}<span>${v}</span></span>`;
  }

  function buildCardInnerHtml(tc) {
    const verdictBadgeHtml = getVerdictBadgeHtml(tc.verdict);

    // Execution time & memory badge HTML
    let metricsHtml = '';
    if (tc.executionTimeMs !== undefined) {
      metricsHtml += `<span class="metric-tag" title="Execution Time">${tc.executionTimeMs}ms</span>`;
    }
    if (tc.memoryUsageMb !== undefined && tc.memoryUsageMb > 0) {
      metricsHtml += `<span class="metric-tag" title="Memory Usage">${tc.memoryUsageMb}MB</span>`;
    }

    // Diff view HTML
    let diffHtml = '';
    if (tc.diff && tc.diff.hasDifference) {
      const rowsHtml = tc.diff.diffLines
        .slice(0, 50)
        .map((dl) => {
          const rowClass = dl.isMatch ? 'diff-row match' : 'diff-row mismatch';
          return `<tr class="${rowClass}">
            <td class="diff-cell line-num">${dl.lineNumber}</td>
            <td class="diff-cell expected">${escapeHtml(dl.expected)}</td>
            <td class="diff-cell actual">${escapeHtml(dl.actual)}</td>
          </tr>`;
        })
        .join('');

      diffHtml = `
        <div class="field-group">
          <div class="field-header">
            <span class="field-label diff-header-label">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
              <span>DIFFERENCE COMPARISON</span>
            </span>
          </div>
          <div class="diff-container">
            <div class="diff-summary">${escapeHtml(tc.diff.summary)}</div>
            <table class="diff-table">
              <thead>
                <tr>
                  <th style="padding:3px 6px; width:28px;">#</th>
                  <th style="text-align:left; padding:3px 6px;">EXPECTED</th>
                  <th style="text-align:left; padding:3px 6px;">ACTUAL</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Actual Output HTML
    let actualOutputHtml = '';
    if (tc.actualOutput !== undefined) {
      actualOutputHtml = `
        <div class="field-group">
          <div class="field-header">
            <span class="field-label">ACTUAL OUTPUT</span>
            <button class="btn-copy" data-copy-target="actual" title="Copy actual output">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1a0 0 0 0 1 0 0H2a0 0 0 0 1 0 0V6a0 0 0 0 1 0 0h1V5H2z"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <textarea class="field-textarea readonly" readonly spellcheck="false">${escapeHtml(tc.actualOutput)}</textarea>
        </div>
      `;
    }

    // Error details HTML (RTE / Stderr)
    let errorDetailsHtml = '';
    if (tc.errorMessage) {
      errorDetailsHtml = `
        <div class="field-group">
          <div class="field-header">
            <span class="field-label" style="color:#f85149">ERROR DETAILS / STDERR</span>
            <button class="btn-copy" data-copy-target="error" title="Copy error details">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1a0 0 0 0 1 0 0H2a0 0 0 0 1 0 0V6a0 0 0 0 1 0 0h1V5H2z"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre class="error-output-box">${escapeHtml(tc.errorMessage)}</pre>
        </div>
      `;
    }

    return `
      <div class="card-header" data-id="${tc.id}">
        <svg class="chevron-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
        </svg>
        <span class="card-title">Test #${tc.testNumber}</span>

        <div class="card-meta">
          ${verdictBadgeHtml}
          ${metricsHtml}
        </div>

        <div class="card-actions">
          <button class="card-action-btn btn-run" data-id="${tc.id}" title="Run this test">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
            </svg>
          </button>
          <button class="card-action-btn btn-delete" data-id="${tc.id}" title="Delete test">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="card-body">
        <div class="field-group">
          <div class="field-header">
            <span class="field-label">INPUT</span>
            <button class="btn-copy" data-copy-target="input" title="Copy input">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1a0 0 0 0 1 0 0H2a0 0 0 0 1 0 0V6a0 0 0 0 1 0 0h1V5H2z"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <textarea class="field-textarea input-area" data-id="${tc.id}" spellcheck="false" placeholder="Enter test input...">${escapeHtml(tc.input)}</textarea>
        </div>

        <div class="field-group">
          <div class="field-header">
            <span class="field-label">EXPECTED OUTPUT</span>
            <button class="btn-copy" data-copy-target="expected" title="Copy expected output">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H8v1a0 0 0 0 1 0 0H2a0 0 0 0 1 0 0V6a0 0 0 0 1 0 0h1V5H2z"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <textarea class="field-textarea output-area" data-id="${tc.id}" spellcheck="false" placeholder="Enter expected output...">${escapeHtml(tc.expectedOutput)}</textarea>
        </div>

        ${actualOutputHtml}
        ${diffHtml}
        ${errorDetailsHtml}
      </div>
    `;
  }

  function copyTextToClipboard(text, btnEl) {
    const handleSuccess = () => {
      const origHtml = btnEl.innerHTML;
      btnEl.classList.add('copied');
      btnEl.innerHTML = `
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>
        <span>Copied!</span>
      `;
      setTimeout(() => {
        btnEl.innerHTML = origHtml;
        btnEl.classList.remove('copied');
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(handleSuccess).catch(() => {
        fallbackCopy(text, btnEl);
      });
    } else {
      fallbackCopy(text, btnEl);
    }
  }

  function fallbackCopy(text, btnEl) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      const origHtml = btnEl.innerHTML;
      btnEl.classList.add('copied');
      btnEl.innerHTML = `
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>
        <span>Copied!</span>
      `;
      setTimeout(() => {
        btnEl.innerHTML = origHtml;
        btnEl.classList.remove('copied');
      }, 1500);
    } catch {
      // Ignore
    } finally {
      document.body.removeChild(ta);
    }
  }

  function bindCardEvents(card, tc) {
    const header = card.querySelector('.card-header');
    const btnRun = card.querySelector('.btn-run');
    const btnDelete = card.querySelector('.btn-delete');
    const inputArea = card.querySelector('.input-area');
    const outputArea = card.querySelector('.output-area');

    // Toggle Accordion Collapse/Expand
    header?.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.card-action-btn')) {
        return;
      }
      tc.isExpanded = !tc.isExpanded;
      card.classList.toggle('expanded', tc.isExpanded);
      vscode.postMessage({
        type: 'toggleExpand',
        id: tc.id,
        isExpanded: tc.isExpanded,
      });
    });

    // Run Single Test
    btnRun?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isJudging) {
        flushPendingEdits();
        hideCePanel();
        vscode.postMessage({ type: 'runSingle', id: tc.id });
      }
    });

    // Delete Test
    btnDelete?.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'deleteTestCase', id: tc.id });
    });

    // Copy Buttons
    card.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = btn.getAttribute('data-copy-target');
        let textToCopy = '';
        if (target === 'input') {
          textToCopy = inputArea ? inputArea.value : tc.input;
        } else if (target === 'expected') {
          textToCopy = outputArea ? outputArea.value : tc.expectedOutput;
        } else if (target === 'actual') {
          textToCopy = tc.actualOutput || '';
        } else if (target === 'error') {
          textToCopy = tc.errorMessage || '';
        }
        copyTextToClipboard(textToCopy, btn);
      });
    });

    // Debounced update on textarea change
    let editTimeout;
    const onTextChange = () => {
      clearTimeout(editTimeout);
      editTimeout = setTimeout(() => {
        tc.input = inputArea?.value || '';
        tc.expectedOutput = outputArea?.value || '';
        vscode.postMessage({
          type: 'updateTestCase',
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        });
      }, 300);
    };

    const flushTextChange = () => {
      clearTimeout(editTimeout);
      const inVal = inputArea?.value || '';
      const outVal = outputArea?.value || '';
      if (tc.input !== inVal || tc.expectedOutput !== outVal) {
        tc.input = inVal;
        tc.expectedOutput = outVal;
        vscode.postMessage({
          type: 'updateTestCase',
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        });
      }
    };

    inputArea?.addEventListener('input', onTextChange);
    inputArea?.addEventListener('change', flushTextChange);
    inputArea?.addEventListener('blur', flushTextChange);
    outputArea?.addEventListener('input', onTextChange);
    outputArea?.addEventListener('change', flushTextChange);
    outputArea?.addEventListener('blur', flushTextChange);
  }

  // Signal ready to extension
  vscode.postMessage({ type: 'ready' });
})();

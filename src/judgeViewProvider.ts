import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { compareOutputs } from './judge/comparator';
import { CodeCompiler, detectLanguage } from './judge/compiler';
import { CodeRunner } from './judge/runner';
import {
  ExtensionToWebviewMessage,
  FileTimerInfo,
  JudgeVerdict,
  ProblemConfig,
  TestCase,
  WebviewToExtensionMessage,
} from './types';
import { StorageManager } from './utils/storage';
import { scanAndImportTestcases, generateId } from './utils/testImporter';
import { resolveBirthtimeMs } from './utils/timerUtils';

export class JudgeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'itsuki-judge.judgeView';

  private view?: vscode.WebviewView;
  private currentFilePath: string = '';
  private currentLanguage: string = 'cpp';
  private problemConfig: ProblemConfig = {
    timeLimit: 1000,
    memoryLimit: 256,
    testCases: [],
  };

  private fileTimers: Map<string, FileTimerInfo> = new Map();
  private storageManager: StorageManager;
  private compiler: CodeCompiler;
  private runner: CodeRunner;
  private isJudging: boolean = false;

  constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {
    this.storageManager = new StorageManager(context);
    this.compiler = new CodeCompiler();
    this.runner = new CodeRunner();

    // Listen to active editor change
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document && editor.document.uri.scheme === 'file') {
        const filePath = editor.document.uri.fsPath;
        const lang = detectLanguage(filePath);
        if (lang !== 'unsupported') {
          this.setActiveFile(filePath);
          return;
        }
      }
      // If editor closed or non-code tab focused, pause running solve timer
      this.pauseActiveFileTimer();
    });

    // Check currently active editor at launch
    const initialEditor = vscode.window.activeTextEditor;
    if (initialEditor && initialEditor.document && initialEditor.document.uri.scheme === 'file') {
      const filePath = initialEditor.document.uri.fsPath;
      const lang = detectLanguage(filePath);
      if (lang !== 'unsupported') {
        this.setActiveFile(filePath);
      }
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      switch (message.type) {
        case 'ready':
          if (this.currentFilePath) {
            await this.loadActiveFileConfig(this.currentFilePath);
          } else {
            // Find first code file in workspace if any
            const files = await vscode.workspace.findFiles('**/*.{cpp,cc,py,java,c}', '**/node_modules/**', 1);
            if (files.length > 0) {
              await this.setActiveFile(files[0].fsPath);
            } else {
              this.postMessage({
                type: 'setActiveFile',
                fileName: 'No file active',
                language: 'None',
                filePath: '',
              });
            }
          }
          break;

        case 'updateSettings':
          this.problemConfig.timeLimit = message.timeLimit;
          this.problemConfig.memoryLimit = message.memoryLimit;
          await this.saveCurrentConfig();
          break;

        case 'updateTestCase': {
          const tc = this.problemConfig.testCases.find((t) => t.id === message.id);
          if (tc) {
            tc.input = message.input;
            tc.expectedOutput = message.expectedOutput;
            await this.saveCurrentConfig();
          }
          break;
        }

        case 'addTestCase':
          await this.addTestCase();
          break;

        case 'addNTestCases':
          await this.addNTestCases(message.count);
          break;

        case 'deleteTestCase':
          await this.deleteTestCase(message.id);
          break;

        case 'clearAllTestCases':
          await this.clearAllTestCases();
          break;

        case 'importFolder':
          await this.batchImport();
          break;

        case 'runAll':
          await this.runAll();
          break;

        case 'runSingle':
          await this.runSingle(message.id);
          break;

        case 'toggleExpand': {
          const tc = this.problemConfig.testCases.find((t) => t.id === message.id);
          if (tc) {
            tc.isExpanded = message.isExpanded;
          }
          break;
        }

        case 'toggleExpandAll':
          this.problemConfig.testCases.forEach((tc) => {
            tc.isExpanded = message.isExpanded;
          });
          this.postProblemData();
          break;

        case 'timerTogglePause': {
          if (this.currentFilePath) {
            const timer = this.getOrCreateTimer(this.currentFilePath);
            const now = Date.now();
            if (timer.isRunning) {
              timer.accumulatedMs += Math.max(0, now - timer.lastStartedAt);
              timer.isRunning = false;
              timer.isPausedByUser = true;
            } else {
              timer.lastStartedAt = now;
              timer.isRunning = true;
              timer.isPausedByUser = false;
            }
            this.postMessage({
              type: 'updateTimerState',
              timerInfo: timer,
            });
          }
          break;
        }

        case 'timerReset': {
          if (this.currentFilePath) {
            const timer = this.getOrCreateTimer(this.currentFilePath);
            const now = Date.now();
            timer.accumulatedMs = 0;
            timer.lastStartedAt = now;
            timer.sessionOpenedAt = now;
            timer.lastOpenedAt = now;
            timer.isRunning = true;
            timer.isPausedByUser = false;
            this.postMessage({
              type: 'updateTimerState',
              timerInfo: timer,
            });
          }
          break;
        }
      }
    });
  }

  public async setActiveFile(filePath: string): Promise<void> {
    if (this.currentFilePath && this.currentFilePath !== filePath) {
      // Pause previous file's active timer so background idle time is isolated
      const prevTimer = this.fileTimers.get(this.currentFilePath);
      if (prevTimer && prevTimer.isRunning) {
        const now = Date.now();
        prevTimer.accumulatedMs += Math.max(0, now - prevTimer.lastStartedAt);
        prevTimer.isRunning = false;
      }
    }

    this.currentFilePath = filePath;
    this.currentLanguage = detectLanguage(filePath);
    await this.loadActiveFileConfig(filePath);
  }

  private pauseActiveFileTimer(): void {
    if (this.currentFilePath) {
      const timer = this.fileTimers.get(this.currentFilePath);
      if (timer && timer.isRunning) {
        const now = Date.now();
        timer.accumulatedMs += Math.max(0, now - timer.lastStartedAt);
        timer.isRunning = false;
        this.postMessage({
          type: 'updateTimerState',
          timerInfo: timer,
        });
      }
    }
  }

  private getOrCreateTimer(filePath: string): FileTimerInfo {
    let timer = this.fileTimers.get(filePath);
    const now = Date.now();
    let statBirthtimeMs: number | undefined;
    let statMtimeMs: number | undefined;

    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        statBirthtimeMs = resolveBirthtimeMs(stat);
        statMtimeMs = stat.mtimeMs;
      }
    } catch {
      // Ignore stat read failure
    }

    if (!timer) {
      timer = {
        birthtimeMs: statBirthtimeMs,
        mtimeMs: statMtimeMs,
        firstOpenedAt: now,
        lastOpenedAt: now,
        sessionOpenedAt: now,
        accumulatedMs: 0,
        isRunning: true,
        isPausedByUser: false,
        lastStartedAt: now,
      };
      this.fileTimers.set(filePath, timer);
    } else {
      if (statBirthtimeMs) {
        timer.birthtimeMs = statBirthtimeMs;
      }
      if (statMtimeMs) {
        timer.mtimeMs = statMtimeMs;
      }
      timer.lastOpenedAt = now;
      if (!timer.isPausedByUser) {
        timer.isRunning = true;
        timer.lastStartedAt = now;
      }
    }
    return timer;
  }

  private async loadActiveFileConfig(filePath: string): Promise<void> {
    this.problemConfig = await this.storageManager.loadProblemConfig(filePath);
    const timerInfo = this.getOrCreateTimer(filePath);

    // Send active file info with timer
    this.postMessage({
      type: 'setActiveFile',
      fileName: path.basename(filePath),
      language: this.formatLanguageName(this.currentLanguage),
      filePath,
      timerInfo,
    });

    // Send problem data
    this.postProblemData();
  }

  private formatLanguageName(lang: string): string {
    switch (lang) {
      case 'cpp':
        return 'C++';
      case 'c':
        return 'C';
      case 'python':
        return 'Python';
      case 'java':
        return 'Java';
      default:
        return lang.toUpperCase();
    }
  }

  private async saveCurrentConfig(): Promise<void> {
    if (this.currentFilePath) {
      await this.storageManager.saveProblemConfig(this.currentFilePath, this.problemConfig);
    }
  }

  private postProblemData(): void {
    this.postMessage({
      type: 'setProblemData',
      data: this.problemConfig,
    });
  }

  private postMessage(msg: ExtensionToWebviewMessage): void {
    if (this.view) {
      this.view.webview.postMessage(msg);
    }
  }

  // ========================================================
  // User Actions
  // ========================================================

  private async ensureActiveFile(): Promise<boolean> {
    if (!this.currentFilePath) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document && editor.document.uri.scheme === 'file') {
        const filePath = editor.document.uri.fsPath;
        const lang = detectLanguage(filePath);
        if (lang !== 'unsupported') {
          await this.setActiveFile(filePath);
          return true;
        }
      }
      return false;
    }
    return true;
  }

  public async addTestCase(): Promise<void> {
    if (!(await this.ensureActiveFile())) {
      vscode.window.showWarningMessage('Vui lòng mở một file mã nguồn (.cpp, .py, .java, .c) để thêm test case.');
      return;
    }

    const newTest: TestCase = {
      id: generateId(),
      testNumber: this.problemConfig.testCases.length + 1,
      input: '',
      expectedOutput: '',
      isExpanded: true,
    };
    this.problemConfig.testCases.push(newTest);
    this.renumberTestCases();
    await this.saveCurrentConfig();
    this.postProblemData();
  }

  public async addNTestCases(count?: number): Promise<void> {
    if (!(await this.ensureActiveFile())) {
      vscode.window.showWarningMessage('Vui lòng mở một file mã nguồn (.cpp, .py, .java, .c) để thêm test case.');
      return;
    }

    let n = count;
    if (n === undefined) {
      const input = await vscode.window.showInputBox({
        title: 'Add N Test Cases',
        prompt: 'Nhập số lượng test case muốn tạo (1 - 100):',
        placeHolder: '10',
        validateInput: (val) => {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 1 || num > 100) {
            return 'Vui lòng nhập số nguyên hợp lệ trong khoảng từ 1 đến 100';
          }
          return null;
        },
      });

      if (!input) {
        return;
      }
      n = parseInt(input, 10);
    }

    if (n < 1 || n > 100) {
      vscode.window.showWarningMessage('Số lượng test case phải từ 1 đến 100');
      return;
    }

    const currentLen = this.problemConfig.testCases.length;
    for (let i = 0; i < n; i++) {
      this.problemConfig.testCases.push({
        id: generateId(),
        testNumber: currentLen + i + 1,
        input: '',
        expectedOutput: '',
        isExpanded: i === 0 && currentLen === 0, // expand first only if empty
      });
    }

    this.renumberTestCases();
    await this.saveCurrentConfig();
    this.postProblemData();
    vscode.window.showInformationMessage(`Đã thêm thành công ${n} test cases.`);
  }

  public async deleteTestCase(id: string): Promise<void> {
    this.problemConfig.testCases = this.problemConfig.testCases.filter((tc) => tc.id !== id);
    this.renumberTestCases();
    await this.saveCurrentConfig();
    this.postProblemData();
  }

  public async clearAllTestCases(): Promise<void> {
    if (this.problemConfig.testCases.length === 0) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Bạn có chắc chắn muốn xóa tất cả test cases không?',
      { modal: true },
      'Xóa tất cả'
    );

    if (confirm === 'Xóa tất cả') {
      this.problemConfig.testCases = [];
      await this.saveCurrentConfig();
      this.postProblemData();
      vscode.window.showInformationMessage('Đã xóa toàn bộ test cases.');
    }
  }

  public async batchImport(): Promise<void> {
    if (!(await this.ensureActiveFile())) {
      vscode.window.showWarningMessage('Vui lòng mở một file mã nguồn (.cpp, .py, .java, .c) trước khi nạp test cases.');
      return;
    }

    const folderUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Import Tests Folder',
      title: 'Chọn thư mục chứa bộ test (Hỗ trợ Subfolder hoặc Folder phẳng)',
    });

    if (!folderUris || folderUris.length === 0) {
      return;
    }

    const selectedFolder = folderUris[0];
    try {
      const imported = await scanAndImportTestcases(selectedFolder);
      if (imported.length === 0) {
        vscode.window.showWarningMessage(
          'Không tìm thấy test case nào trong thư mục đã chọn. Hỗ trợ folder con (Test01/*.inp, *.out) hoặc folder phẳng (test1.inp, test1.out).'
        );
        return;
      }

      // Append tests
      const startNum = this.problemConfig.testCases.length;
      imported.forEach((tc, idx) => {
        tc.testNumber = startNum + idx + 1;
        this.problemConfig.testCases.push(tc);
      });

      this.renumberTestCases();
      await this.saveCurrentConfig();
      this.postProblemData();
      vscode.window.showInformationMessage(`Đã nạp thành công ${imported.length} test cases!`);
    } catch (err) {
      vscode.window.showErrorMessage(`Lỗi khi nạp test cases: ${(err as Error).message}`);
    }
  }

  private renumberTestCases(): void {
    this.problemConfig.testCases.forEach((tc, idx) => {
      tc.testNumber = idx + 1;
    });
  }

  // ========================================================
  // Judge Execution
  // ========================================================

  public async runAll(): Promise<void> {
    if (this.isJudging) {
      return;
    }
    if (!(await this.ensureActiveFile())) {
      vscode.window.showWarningMessage('Vui lòng mở một file mã nguồn (.cpp, .py, .java, .c) để chấm.');
      return;
    }
    if (this.problemConfig.testCases.length === 0) {
      vscode.window.showInformationMessage('Chưa có test case nào. Hãy thêm test case trước khi chấm.');
      return;
    }

    await this.judgeTestCases(this.problemConfig.testCases);
  }

  public async runSingle(id: string): Promise<void> {
    if (this.isJudging) {
      return;
    }
    if (!(await this.ensureActiveFile())) {
      vscode.window.showWarningMessage('Vui lòng mở một file mã nguồn (.cpp, .py, .java, .c) để chấm.');
      return;
    }

    const tc = this.problemConfig.testCases.find((t) => t.id === id);
    if (!tc) {
      return;
    }

    await this.judgeTestCases([tc]);
  }

  private async judgeTestCases(testsToRun: TestCase[]): Promise<void> {
    this.isJudging = true;
    this.postMessage({ type: 'judgingStarted' });

    // Save active document if dirty
    const activeDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.fsPath === this.currentFilePath
    );
    if (activeDoc && activeDoc.isDirty) {
      await activeDoc.save();
    }

    const vsConfig = vscode.workspace.getConfiguration('itsukiJudge');
    const compilerOptions = {
      cppCompiler: vsConfig.get<string>('cppCompiler', 'g++'),
      cppFlags: vsConfig.get<string[]>('cppFlags', ['-O3', '-std=c++17']),
      pythonCommand: vsConfig.get<string>('pythonCommand', 'python3'),
      javaCompiler: vsConfig.get<string>('javaCompiler', 'javac'),
      javaCommand: vsConfig.get<string>('javaCommand', 'java'),
    };

    // Mark tests as RUNNING
    for (const tc of testsToRun) {
      this.postMessage({
        type: 'testCaseStatusUpdate',
        id: tc.id,
        verdict: 'RUNNING',
      });
    }

    // Compile code
    const compilation = await this.compiler.compile(this.currentFilePath, compilerOptions);

    if (!compilation.success) {
      const err = compilation.error || 'Compilation Error';
      for (const tc of testsToRun) {
        tc.verdict = 'CE';
        tc.errorMessage = err;
        this.postMessage({
          type: 'testCaseStatusUpdate',
          id: tc.id,
          verdict: 'CE',
          errorMessage: err,
        });
      }
      this.postMessage({ type: 'compilationError', error: err });
      this.postMessage({ type: 'judgingFinished' });
      this.isJudging = false;
      return;
    }

    const timeLimitMs = this.problemConfig.timeLimit || 1000;
    const memoryLimitMb = this.problemConfig.memoryLimit || 256;
    const cwd = path.dirname(this.currentFilePath);

    try {
      for (const tc of testsToRun) {
        this.postMessage({
          type: 'testCaseStatusUpdate',
          id: tc.id,
          verdict: 'RUNNING',
        });

        const runResult = await this.runner.run(
          compilation.command!,
          compilation.args || [],
          tc.input,
          {
            timeLimitMs,
            memoryLimitMb,
            cwd,
          }
        );

        let finalVerdict: JudgeVerdict = runResult.verdict;
        let diffResult = undefined;

        if (runResult.verdict === 'PENDING') {
          diffResult = compareOutputs(runResult.stdout, tc.expectedOutput);
          finalVerdict = diffResult.hasDifference ? 'WA' : 'AC';
        }

        tc.verdict = finalVerdict;
        tc.executionTimeMs = runResult.executionTimeMs;
        tc.memoryUsageMb = runResult.memoryUsageMb;
        tc.actualOutput = runResult.stdout;
        tc.errorMessage = runResult.stderr || runResult.error;
        tc.diff = diffResult;

        // Auto-expand card if failed (WA, TLE, MLE, RTE)
        if (finalVerdict !== 'AC') {
          tc.isExpanded = true;
        }

        this.postMessage({
          type: 'testCaseStatusUpdate',
          id: tc.id,
          verdict: finalVerdict,
          executionTimeMs: runResult.executionTimeMs,
          memoryUsageMb: runResult.memoryUsageMb,
          actualOutput: runResult.stdout,
          errorMessage: runResult.stderr || runResult.error,
          diff: diffResult,
        });
      }
    } finally {
      if (compilation.cleanup) {
        await compilation.cleanup();
      }
      this.isJudging = false;
      this.postMessage({ type: 'judgingFinished' });
    }
  }

  // ========================================================
  // Webview HTML
  // ========================================================

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css'));
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg'));

    const nonce = crypto.randomBytes(16).toString('base64');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>ITSUKI JUDGE</title>
</head>
<body>
  <!-- Header Bar -->
  <header class="judge-header">
    <div class="logo-area">
      <img src="${iconUri}" alt="Logo" class="logo-icon" />
      <span class="logo-title">ITSUKI JUDGE</span>
    </div>
    <div class="file-info-area">
      <span id="active-filename" class="file-badge" title="No file selected">--</span>
      <span id="active-language" class="lang-badge">--</span>
    </div>
  </header>

  <!-- Solve & File Timer Bar -->
  <section class="timer-section" id="timer-bar">
    <div class="timer-display-group" id="timer-display" title="Click to cycle: Opened ↔ Created ↔ Session">
      <div class="timer-main">
        <svg class="timer-icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
        <span class="timer-mode-tag mode-opened" id="timer-mode-tag">OPENED</span>
        <span class="timer-digits" id="timer-digits">00:00:00</span>
      </div>
      <div class="timer-subtext" id="timer-secondary-text" title="File creation & session details">Created: -- · Session: 00:00:00</div>
    </div>
    <div class="timer-actions">
      <button id="btn-timer-toggle-mode" class="timer-action-btn" title="Cycle Mode: Opened ↔ Created ↔ Session">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 5H14.5a.5.5 0 0 0 .5-.5z"/>
        </svg>
      </button>
      <button id="btn-timer-pause" class="timer-action-btn" title="Pause / Resume Solve Stopwatch">
        <svg id="timer-play-pause-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/>
        </svg>
      </button>
      <button id="btn-timer-reset" class="timer-action-btn" title="Reset Solve Stopwatch">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
      </button>
    </div>
  </section>

  <!-- Limits Settings Bar -->
  <section class="settings-bar">
    <div class="setting-item">
      <svg class="setting-icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
        <path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 6.5-6.5 6.5 6.5 0 0 1-6.5 6.5zM7.5 4v4.5l3.5 2.1.8-1.2-2.8-1.7V4z"/>
      </svg>
      <span class="setting-label">TL:</span>
      <input type="number" id="time-limit-input" min="100" max="60000" step="100" value="1000" />
      <span class="setting-unit">ms</span>
    </div>

    <div class="setting-item">
      <svg class="setting-icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm2 1v8h8V4H4zm1 2h2v2H5V6zm4 0h2v2H9V6zm-4 4h2v2H5v-2zm4 0h2v2H9v-2z"/>
      </svg>
      <span class="setting-label">ML:</span>
      <input type="number" id="memory-limit-input" min="16" max="2048" step="16" value="256" />
      <span class="setting-unit">MB</span>
    </div>
  </section>

  <!-- Summary and Global Actions -->
  <section class="summary-bar">
    <div class="summary-info">
      <span class="test-count-label" id="test-count">0 test cases</span>
      <span class="stats-pill hidden" id="judge-stats-badge"></span>
    </div>
    <div class="summary-actions">
      <button id="btn-toggle-expand" class="icon-btn" title="Expand/Collapse All">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M8 1L4 5h8L8 1zM8 15l4-4H4l4 4z"/>
        </svg>
      </button>
      <button id="btn-clear-all" class="text-icon-btn danger" title="Clear all tests">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
        <span>Clear All</span>
      </button>
    </div>
  </section>

  <!-- Main Toolbar (Two-row layout) -->
  <section class="toolbar-layout">
    <div class="toolbar-row row-primary">
      <button id="btn-add-test" class="btn btn-secondary btn-action" title="Add Test Case (Ctrl+Alt+A)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
        </svg>
        <span>+ Add Test</span>
      </button>
      <button id="btn-run-all" class="btn btn-primary btn-action" title="Run all test cases (Ctrl+Alt+R)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
        </svg>
        <span>Run All</span>
      </button>
    </div>
    <div class="toolbar-row row-secondary">
      <button id="btn-add-n-tests" class="btn btn-secondary btn-utility" title="Add N test cases">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M2.5 3.5a.5.5 0 0 1 0-1h11a.5.5 0 0 1 0 1h-11zm0 4.5a.5.5 0 0 1 0-1h11a.5.5 0 0 1 0 1h-11zm0 4.5a.5.5 0 0 1 0-1h11a.5.5 0 0 1 0 1h-11z"/>
        </svg>
        <span>+ N Tests</span>
      </button>
      <button id="btn-import-folder" class="btn btn-secondary btn-utility" title="Batch import tests from folder (Subfolders or Flat)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31z"/>
        </svg>
        <span>Import Folder</span>
      </button>
    </div>
  </section>

  <!-- Compilation Error Notice -->
  <div id="ce-panel" class="ce-box hidden">
    <div class="ce-header">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
        <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/>
      </svg>
      <span>Compilation Error</span>
      <button class="ce-close" id="btn-close-ce">&times;</button>
    </div>
    <pre id="ce-content" class="ce-text"></pre>
  </div>

  <!-- Test Cases Container -->
  <main id="testcase-container" class="test-cards-container">
    <!-- Rendered dynamically by main.js -->
  </main>

  <!-- Empty State -->
  <div id="empty-state" class="empty-placeholder hidden">
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
    <p>Chưa có test case nào</p>
    <div class="empty-actions">
      <button class="btn btn-secondary btn-sm" id="btn-empty-add">+ Add Test</button>
      <button class="btn btn-secondary btn-sm" id="btn-empty-import">📁 Import Folder</button>
    </div>
  </div>

  <!-- Modal for Add N Tests -->
  <div id="add-n-modal" class="modal-backdrop hidden">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Add N Test Cases</h3>
        <button class="modal-close" id="btn-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <label for="n-tests-count">Số lượng test case cần tạo (1 - 100):</label>
        <input type="number" id="n-tests-count" min="1" max="100" value="5" />
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-modal-cancel">Hủy</button>
        <button class="btn btn-primary" id="btn-modal-confirm">Tạo ngay</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

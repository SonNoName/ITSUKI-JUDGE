export type JudgeVerdict = 
  | 'PENDING'
  | 'RUNNING'
  | 'AC'    // Accepted
  | 'WA'    // Wrong Answer
  | 'TLE'   // Time Limit Exceeded
  | 'MLE'   // Memory Limit Exceeded
  | 'RTE'   // Runtime Error
  | 'CE';   // Compilation Error

export interface DiffLine {
  lineNumber: number;
  expected: string;
  actual: string;
  isMatch: boolean;
}

export interface DiffResult {
  hasDifference: boolean;
  mismatchLine?: number;
  expectedLine?: string;
  actualLine?: string;
  diffLines: DiffLine[];
  summary: string;
}

export interface TestCase {
  id: string;
  testNumber: number;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  verdict?: JudgeVerdict;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  errorMessage?: string;
  diff?: DiffResult;
  isExpanded?: boolean;
}

export interface ProblemConfig {
  timeLimit: number;    // in ms (e.g. 1000)
  memoryLimit: number;  // in MB (e.g. 256)
  testCases: TestCase[];
}

export type SupportedLanguage = 'cpp' | 'c' | 'python' | 'java' | 'unsupported';

export interface CompilationResult {
  success: boolean;
  executablePath?: string;
  command?: string;
  args?: string[];
  error?: string;
  compilationTimeMs?: number;
  cleanup?: () => Promise<void>;
}

export interface ExecutionResult {
  verdict: JudgeVerdict;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  memoryUsageMb: number;
  exitCode: number | null;
  signal: string | null;
  error?: string;
}

export interface FileTimerInfo {
  birthtimeMs?: number;
  mtimeMs?: number;
  firstOpenedAt: number;
  lastOpenedAt: number;
  sessionOpenedAt: number;
  accumulatedMs: number;
  isRunning: boolean;
  isPausedByUser?: boolean;
  lastStartedAt: number;
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'updateSettings'; timeLimit: number; memoryLimit: number }
  | { type: 'updateTestCase'; id: string; input: string; expectedOutput: string }
  | { type: 'addTestCase' }
  | { type: 'addNTestCases'; count: number }
  | { type: 'deleteTestCase'; id: string }
  | { type: 'clearAllTestCases' }
  | { type: 'importFolder' }
  | { type: 'runAll' }
  | { type: 'runSingle'; id: string }
  | { type: 'toggleExpand'; id: string; isExpanded: boolean }
  | { type: 'toggleExpandAll'; isExpanded: boolean }
  | { type: 'timerTogglePause' }
  | { type: 'timerReset' };

export type ExtensionToWebviewMessage =
  | { 
      type: 'setActiveFile'; 
      fileName: string; 
      language: string; 
      filePath: string;
      timerInfo?: FileTimerInfo;
    }
  | { type: 'updateTimerState'; timerInfo: FileTimerInfo }
  | { type: 'setProblemData'; data: ProblemConfig }
  | { 
      type: 'testCaseStatusUpdate'; 
      id: string; 
      verdict: JudgeVerdict; 
      executionTimeMs?: number; 
      memoryUsageMb?: number; 
      actualOutput?: string; 
      diff?: DiffResult; 
      errorMessage?: string;
    }
  | { type: 'judgingStarted' }
  | { type: 'judgingFinished' }
  | { type: 'compilationError'; error: string }
  | { type: 'showInfo'; message: string }
  | { type: 'showError'; message: string };

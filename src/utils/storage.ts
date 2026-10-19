import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProblemConfig, TestCase } from '../types';
import {
  computeStorageFilePath,
  computeLegacyStorageFilePath,
  computeStateKey,
} from './storagePaths';

export * from './storagePaths';

export class StorageManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Derives storage file path for a source code file.
   * Format: <workspaceRoot>/.itsuki/<relPath>.json
   */
  private getStorageFilePath(sourceFilePath: string): string | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceFilePath));
    if (!workspaceFolder) {
      return null;
    }
    return computeStorageFilePath(workspaceFolder.uri.fsPath, sourceFilePath);
  }

  /**
   * Loads problem configuration (TL, ML, test cases) for a source file.
   */
  public async loadProblemConfig(sourceFilePath: string): Promise<ProblemConfig> {
    const config = vscode.workspace.getConfiguration('itsukiJudge');
    const defaultTimeLimit = config.get<number>('defaultTimeLimit', 1000);
    const defaultMemoryLimit = config.get<number>('defaultMemoryLimit', 256);

    const defaultConfig: ProblemConfig = {
      timeLimit: defaultTimeLimit,
      memoryLimit: defaultMemoryLimit,
      testCases: [],
    };

    if (!sourceFilePath) {
      return defaultConfig;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceFilePath));
    const workspaceRoot = workspaceFolder?.uri.fsPath;

    // Try reading from .itsuki/<relPath>.json first, fall back to legacy .itsuki/<baseName>.json
    let filePath: string | null = null;
    if (workspaceRoot) {
      const primaryPath = computeStorageFilePath(workspaceRoot, sourceFilePath);
      const legacyPath = computeLegacyStorageFilePath(workspaceRoot, sourceFilePath);

      if (fs.existsSync(primaryPath)) {
        filePath = primaryPath;
      } else if (fs.existsSync(legacyPath)) {
        filePath = legacyPath;
      } else {
        filePath = primaryPath;
      }
    }

    if (filePath && fs.existsSync(filePath)) {
      try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as ProblemConfig;
        return {
          timeLimit: parsed.timeLimit || defaultTimeLimit,
          memoryLimit: parsed.memoryLimit || defaultMemoryLimit,
          testCases: (parsed.testCases || []).map((tc, idx) => ({
            ...tc,
            testNumber: idx + 1,
            verdict: undefined,
            actualOutput: undefined,
            diff: undefined,
            errorMessage: undefined,
          })),
        };
      } catch {
        // Fall back to workspaceState
      }
    }

    // Fall back to workspaceState: check primary collision-free key, then legacy key
    const primaryKey = computeStateKey(workspaceRoot, sourceFilePath);
    const legacyKey = `itsuki_judge_${path.basename(sourceFilePath)}`;
    const saved =
      this.context.workspaceState.get<ProblemConfig>(primaryKey) ||
      this.context.workspaceState.get<ProblemConfig>(legacyKey);

    if (saved) {
      return {
        timeLimit: saved.timeLimit || defaultTimeLimit,
        memoryLimit: saved.memoryLimit || defaultMemoryLimit,
        testCases: (saved.testCases || []).map((tc, idx) => ({
          ...tc,
          testNumber: idx + 1,
          verdict: undefined,
          actualOutput: undefined,
          diff: undefined,
          errorMessage: undefined,
        })),
      };
    }

    return defaultConfig;
  }

  /**
   * Saves problem configuration to .itsuki/<relPath>.json and workspaceState.
   */
  public async saveProblemConfig(sourceFilePath: string, problemConfig: ProblemConfig): Promise<void> {
    if (!sourceFilePath) {
      return;
    }

    // Prepare serializable tests (strip run-time artifacts like actualOutput, diff)
    const cleanTests: TestCase[] = problemConfig.testCases.map((tc, idx) => ({
      id: tc.id,
      testNumber: idx + 1,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isExpanded: tc.isExpanded,
    }));

    const dataToSave: ProblemConfig = {
      timeLimit: problemConfig.timeLimit,
      memoryLimit: problemConfig.memoryLimit,
      testCases: cleanTests,
    };

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceFilePath));
    const workspaceRoot = workspaceFolder?.uri.fsPath;

    // Save to workspaceState using collision-free key
    const stateKey = computeStateKey(workspaceRoot, sourceFilePath);
    await this.context.workspaceState.update(stateKey, dataToSave);

    // Save to .itsuki/<relPath>.json
    if (workspaceRoot) {
      const filePath = computeStorageFilePath(workspaceRoot, sourceFilePath);
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true });
        }
        await fs.promises.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to save .itsuki config file:', err);
      }
    }
  }
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageManager = void 0;
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const storagePaths_1 = require("./storagePaths");
__exportStar(require("./storagePaths"), exports);
class StorageManager {
    context;
    constructor(context) {
        this.context = context;
    }
    /**
     * Derives storage file path for a source code file.
     * Format: <workspaceRoot>/.itsuki/<relPath>.json
     */
    getStorageFilePath(sourceFilePath) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceFilePath));
        if (!workspaceFolder) {
            return null;
        }
        return (0, storagePaths_1.computeStorageFilePath)(workspaceFolder.uri.fsPath, sourceFilePath);
    }
    /**
     * Loads problem configuration (TL, ML, test cases) for a source file.
     */
    async loadProblemConfig(sourceFilePath) {
        const config = vscode.workspace.getConfiguration('itsukiJudge');
        const defaultTimeLimit = config.get('defaultTimeLimit', 1000);
        const defaultMemoryLimit = config.get('defaultMemoryLimit', 256);
        const defaultConfig = {
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
        let filePath = null;
        if (workspaceRoot) {
            const primaryPath = (0, storagePaths_1.computeStorageFilePath)(workspaceRoot, sourceFilePath);
            const legacyPath = (0, storagePaths_1.computeLegacyStorageFilePath)(workspaceRoot, sourceFilePath);
            if (fs.existsSync(primaryPath)) {
                filePath = primaryPath;
            }
            else if (fs.existsSync(legacyPath)) {
                filePath = legacyPath;
            }
            else {
                filePath = primaryPath;
            }
        }
        if (filePath && fs.existsSync(filePath)) {
            try {
                const raw = await fs.promises.readFile(filePath, 'utf8');
                const parsed = JSON.parse(raw);
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
            }
            catch {
                // Fall back to workspaceState
            }
        }
        // Fall back to workspaceState: check primary collision-free key, then legacy key
        const primaryKey = (0, storagePaths_1.computeStateKey)(workspaceRoot, sourceFilePath);
        const legacyKey = `itsuki_judge_${path.basename(sourceFilePath)}`;
        const saved = this.context.workspaceState.get(primaryKey) ||
            this.context.workspaceState.get(legacyKey);
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
    async saveProblemConfig(sourceFilePath, problemConfig) {
        if (!sourceFilePath) {
            return;
        }
        // Prepare serializable tests (strip run-time artifacts like actualOutput, diff)
        const cleanTests = problemConfig.testCases.map((tc, idx) => ({
            id: tc.id,
            testNumber: idx + 1,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isExpanded: tc.isExpanded,
        }));
        const dataToSave = {
            timeLimit: problemConfig.timeLimit,
            memoryLimit: problemConfig.memoryLimit,
            testCases: cleanTests,
        };
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourceFilePath));
        const workspaceRoot = workspaceFolder?.uri.fsPath;
        // Save to workspaceState using collision-free key
        const stateKey = (0, storagePaths_1.computeStateKey)(workspaceRoot, sourceFilePath);
        await this.context.workspaceState.update(stateKey, dataToSave);
        // Save to .itsuki/<relPath>.json
        if (workspaceRoot) {
            const filePath = (0, storagePaths_1.computeStorageFilePath)(workspaceRoot, sourceFilePath);
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    await fs.promises.mkdir(dir, { recursive: true });
                }
                await fs.promises.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            }
            catch (err) {
                console.error('Failed to save .itsuki config file:', err);
            }
        }
    }
}
exports.StorageManager = StorageManager;
//# sourceMappingURL=storage.js.map
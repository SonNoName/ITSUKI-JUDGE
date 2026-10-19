"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeStorageFilePath = computeStorageFilePath;
exports.computeLegacyStorageFilePath = computeLegacyStorageFilePath;
exports.computeStateKey = computeStateKey;
const path = require("path");
/**
 * Computes collision-free storage path inside .itsuki/ mirroring relative directory structure.
 * e.g., <workspaceRoot>/round1/sol.cpp -> <workspaceRoot>/.itsuki/round1/sol.cpp.json
 */
function computeStorageFilePath(workspaceRoot, sourceFilePath) {
    const relPath = path.relative(workspaceRoot, sourceFilePath);
    return path.join(workspaceRoot, '.itsuki', `${relPath}.json`);
}
/**
 * Legacy storage path: <workspaceRoot>/.itsuki/<basename>.json
 */
function computeLegacyStorageFilePath(workspaceRoot, sourceFilePath) {
    const baseName = path.basename(sourceFilePath);
    return path.join(workspaceRoot, '.itsuki', `${baseName}.json`);
}
/**
 * Computes workspaceState key using relative path to avoid collision across folders.
 */
function computeStateKey(workspaceRoot, sourceFilePath) {
    if (workspaceRoot) {
        const rel = path.relative(workspaceRoot, sourceFilePath).replace(/\\/g, '/');
        return `itsuki_judge_${rel}`;
    }
    return `itsuki_judge_${path.basename(sourceFilePath)}`;
}
//# sourceMappingURL=storagePaths.js.map
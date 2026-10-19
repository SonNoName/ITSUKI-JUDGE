import * as path from 'path';

/**
 * Computes collision-free storage path inside .itsuki/ mirroring relative directory structure.
 * e.g., <workspaceRoot>/round1/sol.cpp -> <workspaceRoot>/.itsuki/round1/sol.cpp.json
 */
export function computeStorageFilePath(workspaceRoot: string, sourceFilePath: string): string {
  const relPath = path.relative(workspaceRoot, sourceFilePath);
  return path.join(workspaceRoot, '.itsuki', `${relPath}.json`);
}

/**
 * Legacy storage path: <workspaceRoot>/.itsuki/<basename>.json
 */
export function computeLegacyStorageFilePath(workspaceRoot: string, sourceFilePath: string): string {
  const baseName = path.basename(sourceFilePath);
  return path.join(workspaceRoot, '.itsuki', `${baseName}.json`);
}

/**
 * Computes workspaceState key using relative path to avoid collision across folders.
 */
export function computeStateKey(workspaceRoot: string | undefined, sourceFilePath: string): string {
  if (workspaceRoot) {
    const rel = path.relative(workspaceRoot, sourceFilePath).replace(/\\/g, '/');
    return `itsuki_judge_${rel}`;
  }
  return `itsuki_judge_${path.basename(sourceFilePath)}`;
}

import * as assert from 'assert';
import * as path from 'path';
import { test, describe } from 'node:test';
import {
  computeStorageFilePath,
  computeLegacyStorageFilePath,
  computeStateKey,
} from '../src/utils/storagePaths';

describe('Storage Manager Collision Safety Tests', () => {
  const workspaceRoot = '/home/user/competitive-programming';

  test('computeStorageFilePath mirrors relative paths under .itsuki', () => {
    const file1 = path.join(workspaceRoot, 'contest1', 'solution.cpp');
    const storage1 = computeStorageFilePath(workspaceRoot, file1);
    assert.strictEqual(
      storage1,
      path.join(workspaceRoot, '.itsuki', 'contest1', 'solution.cpp.json')
    );

    const rootFile = path.join(workspaceRoot, 'main.cpp');
    const rootStorage = computeStorageFilePath(workspaceRoot, rootFile);
    assert.strictEqual(
      rootStorage,
      path.join(workspaceRoot, '.itsuki', 'main.cpp.json')
    );
  });

  test('Collision safety: Identical file names in different subdirectories have distinct storage paths', () => {
    const fileA = path.join(workspaceRoot, 'contest1', 'solution.cpp');
    const fileB = path.join(workspaceRoot, 'contest2', 'solution.cpp');

    const storageA = computeStorageFilePath(workspaceRoot, fileA);
    const storageB = computeStorageFilePath(workspaceRoot, fileB);

    assert.notStrictEqual(storageA, storageB);
    assert.strictEqual(
      storageA,
      path.join(workspaceRoot, '.itsuki', 'contest1', 'solution.cpp.json')
    );
    assert.strictEqual(
      storageB,
      path.join(workspaceRoot, '.itsuki', 'contest2', 'solution.cpp.json')
    );
  });

  test('Legacy storage path matches old basename pattern for backward compatibility', () => {
    const nestedFile = path.join(workspaceRoot, 'contest1', 'solution.cpp');
    const legacyStorage = computeLegacyStorageFilePath(workspaceRoot, nestedFile);
    assert.strictEqual(
      legacyStorage,
      path.join(workspaceRoot, '.itsuki', 'solution.cpp.json')
    );
  });

  test('computeStateKey produces unique keys for files in different directories', () => {
    const fileA = path.join(workspaceRoot, 'contest1', 'solution.cpp');
    const fileB = path.join(workspaceRoot, 'contest2', 'solution.cpp');

    const keyA = computeStateKey(workspaceRoot, fileA);
    const keyB = computeStateKey(workspaceRoot, fileB);

    assert.notStrictEqual(keyA, keyB);
    assert.strictEqual(keyA, 'itsuki_judge_contest1/solution.cpp');
    assert.strictEqual(keyB, 'itsuki_judge_contest2/solution.cpp');
  });

  test('computeStateKey falls back to basename if workspaceRoot is undefined', () => {
    const file = '/tmp/standalone.cpp';
    const key = computeStateKey(undefined, file);
    assert.strictEqual(key, 'itsuki_judge_standalone.cpp');
  });

  test('computeStorageFilePath supports deeply nested hierarchies', () => {
    const deepFile = path.join(workspaceRoot, 'codeforces', 'round_900', 'div2', 'problem_a', 'sol.cpp');
    const storagePath = computeStorageFilePath(workspaceRoot, deepFile);
    assert.strictEqual(
      storagePath,
      path.join(workspaceRoot, '.itsuki', 'codeforces', 'round_900', 'div2', 'problem_a', 'sol.cpp.json')
    );

    const deepKey = computeStateKey(workspaceRoot, deepFile);
    assert.strictEqual(
      deepKey,
      'itsuki_judge_codeforces/round_900/div2/problem_a/sol.cpp'
    );
  });
});

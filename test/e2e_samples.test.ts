import * as assert from 'assert';
import * as path from 'path';
import { test, describe } from 'node:test';
import { scanAndImportTestcasesFromPath } from '../src/utils/testImporter';
import { CodeCompiler } from '../src/judge/compiler';
import { CodeRunner } from '../src/judge/runner';
import { compareOutputs } from '../src/judge/comparator';

describe('E2E Samples Verification', () => {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const sourcePath = path.join(workspaceRoot, 'samples', 'caykhe.cpp');
  const caseAPath = path.join(workspaceRoot, 'samples', 'tests_case_a_subfolders');
  const caseBPath = path.join(workspaceRoot, 'samples', 'tests_case_b_flat');

  test('E2E: Compiles caykhe.cpp and judges Case A tests as AC', async () => {
    const compiler = new CodeCompiler();
    const runner = new CodeRunner();

    const tests = await scanAndImportTestcasesFromPath(caseAPath);
    assert.strictEqual(tests.length, 3, 'Should import 3 tests from Case A');

    const compRes = await compiler.compile(sourcePath);
    assert.strictEqual(compRes.success, true, 'Compilation of caykhe.cpp should succeed');

    for (const tc of tests) {
      const runRes = await runner.run(compRes.command!, compRes.args!, tc.input, {
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        cwd: path.dirname(sourcePath),
      });

      assert.strictEqual(runRes.verdict, 'PENDING');
      const diff = compareOutputs(runRes.stdout, tc.expectedOutput);
      assert.strictEqual(diff.hasDifference, false, `Test #${tc.testNumber} should be AC`);
    }

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });

  test('E2E: Compiles caykhe.cpp and judges Case B tests as AC', async () => {
    const compiler = new CodeCompiler();
    const runner = new CodeRunner();

    const tests = await scanAndImportTestcasesFromPath(caseBPath);
    assert.strictEqual(tests.length, 3, 'Should import 3 tests from Case B');

    const compRes = await compiler.compile(sourcePath);
    assert.strictEqual(compRes.success, true, 'Compilation of caykhe.cpp should succeed');

    for (const tc of tests) {
      const runRes = await runner.run(compRes.command!, compRes.args!, tc.input, {
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        cwd: path.dirname(sourcePath),
      });

      assert.strictEqual(runRes.verdict, 'PENDING');
      const diff = compareOutputs(runRes.stdout, tc.expectedOutput);
      assert.strictEqual(diff.hasDifference, false, `Test #${tc.testNumber} should be AC`);
    }

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });
});

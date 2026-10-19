import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, describe, before, after } from 'node:test';
import { CodeCompiler, detectLanguage } from '../src/judge/compiler';
import { CodeRunner } from '../src/judge/runner';
import { compareOutputs } from '../src/judge/comparator';

describe('Compiler and Runner Tests', () => {
  const tempDir = path.join(os.tmpdir(), `itsuki_runner_test_${Date.now()}`);
  const compiler = new CodeCompiler();
  const runner = new CodeRunner();

  before(async () => {
    await fs.promises.mkdir(tempDir, { recursive: true });
  });

  after(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // ========================================================
  // C++ Tests
  // ========================================================
  test('C++: Normal compilation and Accepted (AC) execution', async () => {
    const cppCode = `
#include <iostream>
using namespace std;
int main() {
    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << "\\n";
    }
    return 0;
}
`;
    const cppPath = path.join(tempDir, 'add.cpp');
    await fs.promises.writeFile(cppPath, cppCode);

    const compRes = await compiler.compile(cppPath);
    assert.strictEqual(compRes.success, true);
    assert.ok(compRes.command);

    const runRes = await runner.run(compRes.command!, compRes.args!, '15 27\n', {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'PENDING');
    assert.strictEqual(runRes.stdout.trim(), '42');

    const diff = compareOutputs(runRes.stdout, '42');
    assert.strictEqual(diff.hasDifference, false);

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });

  test('C++: Time Limit Exceeded (TLE) terminates quickly', async () => {
    const loopCode = `
#include <iostream>
int main() {
    volatile long long x = 0;
    while (true) {
        x++;
    }
    return 0;
}
`;
    const loopPath = path.join(tempDir, 'loop.cpp');
    await fs.promises.writeFile(loopPath, loopCode);

    const compRes = await compiler.compile(loopPath);
    assert.strictEqual(compRes.success, true);

    const startTime = Date.now();
    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 400,
      memoryLimitMb: 256,
      cwd: tempDir,
    });
    const elapsed = Date.now() - startTime;

    assert.strictEqual(runRes.verdict, 'TLE');
    assert.ok(elapsed >= 350 && elapsed < 2000, `Elapsed ${elapsed}ms is within expected TLE margin`);

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });

  test('C++: Runtime Error (RTE) on division by zero / crash', async () => {
    const crashCode = `
#include <cstdlib>
int main() {
    std::abort();
    return 0;
}
`;
    const crashPath = path.join(tempDir, 'crash.cpp');
    await fs.promises.writeFile(crashPath, crashCode);

    const compRes = await compiler.compile(crashPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'RTE');

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });

  test('C++: Compilation Error (CE) returns error diagnostics', async () => {
    const brokenCode = `
#include <iostream>
int main() {
    syntax_error_here_unknown_token;;;
    return 0;
}
`;
    const brokenPath = path.join(tempDir, 'broken.cpp');
    await fs.promises.writeFile(brokenPath, brokenCode);

    const compRes = await compiler.compile(brokenPath);
    assert.strictEqual(compRes.success, false);
    assert.ok(compRes.error && compRes.error.length > 0);
  });

  // ========================================================
  // Python Tests
  // ========================================================
  test('Python: Normal execution and AC', async () => {
    const pyCode = `
import sys
line = sys.stdin.read().split()
if len(line) >= 2:
    print(int(line[0]) + int(line[1]))
`;
    const pyPath = path.join(tempDir, 'add.py');
    await fs.promises.writeFile(pyPath, pyCode);

    const compRes = await compiler.compile(pyPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '100 250\n', {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'PENDING');
    assert.strictEqual(runRes.stdout.trim(), '350');
  });

  test('Python: TLE termination', async () => {
    const pyCode = `
while True:
    pass
`;
    const pyPath = path.join(tempDir, 'loop.py');
    await fs.promises.writeFile(pyPath, pyCode);

    const compRes = await compiler.compile(pyPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 400,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'TLE');
  });

  test('Python: Runtime Error (RTE) captures exception', async () => {
    const pyCode = `
raise ValueError("Custom RTE occurred")
`;
    const pyPath = path.join(tempDir, 'err.py');
    await fs.promises.writeFile(pyPath, pyCode);

    const compRes = await compiler.compile(pyPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'RTE');
    assert.ok(runRes.stderr.includes('ValueError: Custom RTE occurred'));
  });

  test('Python: Syntax Error detection', async () => {
    const pyBroken = `
def broken_syntax(
`;
    const pyBrokenPath = path.join(tempDir, 'broken.py');
    await fs.promises.writeFile(pyBrokenPath, pyBroken);

    const compRes = await compiler.compile(pyBrokenPath);
    assert.strictEqual(compRes.success, false);
    assert.ok(compRes.error && compRes.error.includes('SyntaxError'));
  });

  // ========================================================
  // Runner Robustness & Memory Tests
  // ========================================================
  test('Runner: Stdin EPIPE safety when child exits immediately without reading input', async () => {
    const pyEarlyExit = `
import sys
# Exits immediately without consuming stdin
sys.exit(0)
`;
    const pyEarlyPath = path.join(tempDir, 'early_exit.py');
    await fs.promises.writeFile(pyEarlyPath, pyEarlyExit);

    const compRes = await compiler.compile(pyEarlyPath);
    assert.strictEqual(compRes.success, true);

    // Provide large input stream to provoke EPIPE if unhandled
    const largeInput = 'x'.repeat(1024 * 1024); // 1MB input
    const runRes = await runner.run(compRes.command!, compRes.args!, largeInput, {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'PENDING');
    assert.strictEqual(runRes.exitCode, 0);
  });

  test('Runner: Peak memory tracking records physical memory usage', async () => {
    const pyMemCode = `
# Allocate an array to use memory
arr = [i for i in range(1000000)]
print("DONE")
`;
    const pyMemPath = path.join(tempDir, 'mem_test.py');
    await fs.promises.writeFile(pyMemPath, pyMemCode);

    const compRes = await compiler.compile(pyMemPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'PENDING');
    assert.strictEqual(runRes.stdout.trim(), 'DONE');
    assert.ok(runRes.memoryUsageMb >= 0, `Memory usage ${runRes.memoryUsageMb}MB should be non-negative`);
    if (process.platform === 'linux') {
      assert.ok(runRes.memoryUsageMb > 10, `Linux physical memory usage should exceed 10MB, got ${runRes.memoryUsageMb}MB`);
    }
  });

  test('Runner: Memory Limit Exceeded (MLE) terminates process when limit is exceeded', async () => {
    const pyMleCode = `
import time
arr = [i for i in range(5000000)]
time.sleep(2)
print("SHOULD_NOT_REACH")
`;
    const pyMlePath = path.join(tempDir, 'mle_test.py');
    await fs.promises.writeFile(pyMlePath, pyMleCode);

    const compRes = await compiler.compile(pyMlePath);
    assert.strictEqual(compRes.success, true);

    const startTime = Date.now();
    const runRes = await runner.run(compRes.command!, compRes.args!, '', {
      timeLimitMs: 4000,
      memoryLimitMb: 30, // 30MB limit will be exceeded by 5M array
      cwd: tempDir,
    });
    const elapsed = Date.now() - startTime;

    assert.strictEqual(runRes.verdict, 'MLE');
    assert.ok(elapsed < 3500, `Should terminate process before time limit, elapsed: ${elapsed}ms`);
  });

  // ========================================================
  // C Language Tests
  // ========================================================
  test('C: Normal compilation and Accepted (AC) execution', async () => {
    const cCode = `
#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a * b);
    }
    return 0;
}
`;
    const cPath = path.join(tempDir, 'mul.c');
    await fs.promises.writeFile(cPath, cCode);

    const compRes = await compiler.compile(cPath);
    assert.strictEqual(compRes.success, true);

    const runRes = await runner.run(compRes.command!, compRes.args!, '6 7\n', {
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      cwd: tempDir,
    });

    assert.strictEqual(runRes.verdict, 'PENDING');
    assert.strictEqual(runRes.stdout.trim(), '42');

    if (compRes.cleanup) {
      await compRes.cleanup();
    }
  });

  // ========================================================
  // Language Detection Tests
  // ========================================================
  test('Compiler: detectLanguage recognizes all supported CP extensions', () => {
    assert.strictEqual(detectLanguage('solution.cpp'), 'cpp');
    assert.strictEqual(detectLanguage('solution.cc'), 'cpp');
    assert.strictEqual(detectLanguage('solution.cxx'), 'cpp');
    assert.strictEqual(detectLanguage('main.c'), 'c');
    assert.strictEqual(detectLanguage('script.py'), 'python');
    assert.strictEqual(detectLanguage('Main.java'), 'java');
    assert.strictEqual(detectLanguage('readme.txt'), 'unsupported');
    assert.strictEqual(detectLanguage('doc.pdf'), 'unsupported');
  });
});


import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, describe, before, after } from 'node:test';
import { scanAndImportTestcasesFromPath, naturalSortCompare } from '../src/utils/testImporter';

describe('Test Importer Tests', () => {
  const tempTestDir = path.join(os.tmpdir(), `itsuki_import_test_${Date.now()}`);

  before(async () => {
    await fs.promises.mkdir(tempTestDir, { recursive: true });
  });

  after(async () => {
    try {
      await fs.promises.rm(tempTestDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('naturalSortCompare sorts numbers naturally', () => {
    const list = ['Test10', 'Test1', 'Test2', 'Test20', 'Test3'];
    list.sort(naturalSortCompare);
    assert.deepStrictEqual(list, ['Test1', 'Test2', 'Test3', 'Test10', 'Test20']);
  });

  test('Case A: Scans subfolders with .inp and .out', async () => {
    const subfolderRoot = path.join(tempTestDir, 'case_a');
    await fs.promises.mkdir(path.join(subfolderRoot, 'Test01'), { recursive: true });
    await fs.promises.mkdir(path.join(subfolderRoot, 'Test02'), { recursive: true });
    await fs.promises.mkdir(path.join(subfolderRoot, 'Test10'), { recursive: true });

    await fs.promises.writeFile(path.join(subfolderRoot, 'Test01', 'bai1.inp'), '1 2\n');
    await fs.promises.writeFile(path.join(subfolderRoot, 'Test01', 'bai1.out'), '3\n');

    await fs.promises.writeFile(path.join(subfolderRoot, 'Test02', 'input.in'), '10 20\n');
    await fs.promises.writeFile(path.join(subfolderRoot, 'Test02', 'output.ans'), '30\n');

    await fs.promises.writeFile(path.join(subfolderRoot, 'Test10', 'test.txt'), '100 200\n');
    await fs.promises.writeFile(path.join(subfolderRoot, 'Test10', 'ans.txt'), '300\n');

    const tests = await scanAndImportTestcasesFromPath(subfolderRoot);

    assert.strictEqual(tests.length, 3);
    assert.strictEqual(tests[0].testNumber, 1);
    assert.strictEqual(tests[0].input.trim(), '1 2');
    assert.strictEqual(tests[0].expectedOutput.trim(), '3');

    assert.strictEqual(tests[1].testNumber, 2);
    assert.strictEqual(tests[1].input.trim(), '10 20');
    assert.strictEqual(tests[1].expectedOutput.trim(), '30');

    assert.strictEqual(tests[2].testNumber, 3);
    assert.strictEqual(tests[2].input.trim(), '100 200');
    assert.strictEqual(tests[2].expectedOutput.trim(), '300');
  });

  test('Case B: Scans flat folder with paired files', async () => {
    const flatRoot = path.join(tempTestDir, 'case_b');
    await fs.promises.mkdir(flatRoot, { recursive: true });

    await fs.promises.writeFile(path.join(flatRoot, 'caykhe1.INP'), '5 10\n1 2 3\n');
    await fs.promises.writeFile(path.join(flatRoot, 'caykhe1.OUT'), '15\n');

    await fs.promises.writeFile(path.join(flatRoot, 'caykhe2.inp'), '2 4\n5 5\n');
    await fs.promises.writeFile(path.join(flatRoot, 'caykhe2.out'), '10\n');

    await fs.promises.writeFile(path.join(flatRoot, 'input03.txt'), '7 8\n');
    await fs.promises.writeFile(path.join(flatRoot, 'output03.txt'), '56\n');

    const tests = await scanAndImportTestcasesFromPath(flatRoot);

    assert.strictEqual(tests.length, 3);
    // Verified 3 pairs were matched and loaded correctly
    const inputs = tests.map((t) => t.input.trim());
    assert.ok(inputs.includes('5 10\n1 2 3'));
    assert.ok(inputs.includes('2 4\n5 5'));
    assert.ok(inputs.includes('7 8'));
  });

  test('Case A: Ignores source code and binary files when pairing inputs and outputs', async () => {
    const mixedRoot = path.join(tempTestDir, 'case_mixed');
    const test01 = path.join(mixedRoot, 'Test01');
    await fs.promises.mkdir(test01, { recursive: true });

    // Include source code, compiled binaries, and documents alongside legitimate test files
    await fs.promises.writeFile(path.join(test01, 'main.cpp'), '#include <iostream>\nint main(){return 0;}\n');
    await fs.promises.writeFile(path.join(test01, 'sol.py'), 'print("test")\n');
    await fs.promises.writeFile(path.join(test01, 'caykhe.exe'), 'BINARY');
    await fs.promises.writeFile(path.join(test01, 'problem.pdf'), 'PDF_DATA');
    await fs.promises.writeFile(path.join(test01, 'caykhe.inp'), '15 25\n');
    await fs.promises.writeFile(path.join(test01, 'caykhe.out'), '40\n');

    const tests = await scanAndImportTestcasesFromPath(mixedRoot);

    assert.strictEqual(tests.length, 1, 'Should find exactly 1 test case ignoring source/binary files');
    assert.strictEqual(tests[0].input.trim(), '15 25');
    assert.strictEqual(tests[0].expectedOutput.trim(), '40');
  });
});

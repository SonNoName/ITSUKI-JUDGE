import * as assert from 'assert';
import { test, describe } from 'node:test';
import { compareOutputs, normalizeOutput } from '../src/judge/comparator';

describe('Comparator Tests', () => {
  test('normalizeOutput handles CRLF and trailing spaces', () => {
    const raw = 'line 1   \r\nline 2\t\r\nline 3   \r\n\r\n\r\n';
    const lines = normalizeOutput(raw);
    assert.deepStrictEqual(lines, ['line 1', 'line 2', 'line 3']);
  });

  test('normalizeOutput handles empty string', () => {
    assert.deepStrictEqual(normalizeOutput(''), []);
    assert.deepStrictEqual(normalizeOutput('   \n\n\r\n  '), []);
  });

  test('compareOutputs returns match when outputs are identical', () => {
    const actual = '63\n3 1 2 4\n';
    const expected = '63\r\n3 1 2 4\r\n';
    const res = compareOutputs(actual, expected);
    assert.strictEqual(res.hasDifference, false);
    assert.strictEqual(res.mismatchLine, undefined);
  });

  test('compareOutputs detects mismatch on specific line', () => {
    const actual = '63\n3 1 2 5\n';
    const expected = '63\n3 1 2 4\n';
    const res = compareOutputs(actual, expected);
    assert.strictEqual(res.hasDifference, true);
    assert.strictEqual(res.mismatchLine, 2);
    assert.strictEqual(res.actualLine, '3 1 2 5');
    assert.strictEqual(res.expectedLine, '3 1 2 4');
  });

  test('compareOutputs detects missing lines (premature EOF)', () => {
    const actual = '63\n';
    const expected = '63\n3 1 2 4\n';
    const res = compareOutputs(actual, expected);
    assert.strictEqual(res.hasDifference, true);
    assert.strictEqual(res.mismatchLine, 2);
    assert.strictEqual(res.actualLine, '<EOF>');
    assert.strictEqual(res.expectedLine, '3 1 2 4');
  });

  test('compareOutputs detects unexpected extra lines', () => {
    const actual = '63\n3 1 2 4\nextra line\n';
    const expected = '63\n3 1 2 4\n';
    const res = compareOutputs(actual, expected);
    assert.strictEqual(res.hasDifference, true);
    assert.strictEqual(res.mismatchLine, 3);
    assert.strictEqual(res.actualLine, 'extra line');
    assert.strictEqual(res.expectedLine, '<EOF>');
  });
});

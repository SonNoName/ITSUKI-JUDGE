import { DiffLine, DiffResult } from '../types';

/**
 * Normalizes output string according to standard Competitive Programming rules:
 * - Replaces Windows CRLF and classic Mac CR with LF (\n)
 * - Trims trailing whitespace from every line
 * - Trims trailing blank lines from the end of the entire text
 */
export function normalizeOutput(text: string): string[] {
  if (!text) {
    return [];
  }

  // Normalize newlines to \n
  const uniform = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines and trim trailing whitespace per line
  const lines = uniform.split('\n').map((line) => line.trimEnd());

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * Compares actual output against expected output and generates a detailed diff.
 */
export function compareOutputs(actualRaw: string, expectedRaw: string): DiffResult {
  const actualLines = normalizeOutput(actualRaw);
  const expectedLines = normalizeOutput(expectedRaw);

  const maxLines = Math.max(actualLines.length, expectedLines.length);
  const diffLines: DiffLine[] = [];
  let mismatchLine: number | undefined;
  let expectedMismatch: string | undefined;
  let actualMismatch: string | undefined;

  for (let i = 0; i < maxLines; i++) {
    const act = i < actualLines.length ? actualLines[i] : undefined;
    const exp = i < expectedLines.length ? expectedLines[i] : undefined;
    const isMatch = act === exp;

    diffLines.push({
      lineNumber: i + 1,
      expected: exp ?? '<EOF>',
      actual: act ?? '<EOF>',
      isMatch,
    });

    if (!isMatch && mismatchLine === undefined) {
      mismatchLine = i + 1;
      expectedMismatch = exp ?? '<EOF>';
      actualMismatch = act ?? '<EOF>';
    }
  }

  const hasDifference = mismatchLine !== undefined;
  let summary = 'Outputs match';

  if (hasDifference) {
    if (actualLines.length !== expectedLines.length) {
      summary = `Mismatch at line ${mismatchLine} (Expected ${expectedLines.length} lines, got ${actualLines.length} lines)`;
    } else {
      summary = `Mismatch at line ${mismatchLine}: expected "${expectedMismatch}", got "${actualMismatch}"`;
    }
  }

  return {
    hasDifference,
    mismatchLine,
    expectedLine: expectedMismatch,
    actualLine: actualMismatch,
    diffLines,
    summary,
  };
}

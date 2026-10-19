import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestCase } from '../types';

const IGNORED_EXTENSIONS = new Set([
  '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp',
  '.py', '.java', '.class',
  '.exe', '.bin', '.o', '.so', '.dll',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.md', '.markdown',
  '.json', '.yml', '.yaml', '.xml'
]);

/**
 * Natural sort comparator for alphanumeric strings (e.g. Test1, Test2, Test10)
 */
export function naturalSortCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Generates a unique test case ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Normalizes file stem to find matching input/output pairs in flat folders.
 * e.g. "input01.txt" -> "01", "output01.txt" -> "01"
 * e.g. "test_1_in.txt" -> "test_1"
 */
function extractStem(fileName: string, isInput: boolean): string {
  const ext = path.extname(fileName);
  let base = path.basename(fileName, ext);

  if (isInput) {
    base = base.replace(/^input[_-]?/i, '').replace(/[_-]?input$/i, '');
    base = base.replace(/^in[_-]?/i, '').replace(/[_-]?in$/i, '');
  } else {
    base = base.replace(/^output[_-]?/i, '').replace(/[_-]?output$/i, '');
    base = base.replace(/^out[_-]?/i, '').replace(/[_-]?out$/i, '');
    base = base.replace(/^ans[_-]?/i, '').replace(/[_-]?ans$/i, '');
    base = base.replace(/^answer[_-]?/i, '').replace(/[_-]?answer$/i, '');
  }

  return base.toLowerCase().trim();
}

function getInputScore(fileName: string): number {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);
  if (IGNORED_EXTENSIONS.has(ext)) {
    return 0;
  }
  let score = 0;
  if (['.inp', '.in', '.input'].includes(ext)) {
    score += 100;
  }
  const base = path.basename(lower, ext);
  if (base.includes('input')) {
    score += 50;
  } else if (/^(in|test)[_-]?/i.test(base) || /[_-]?(in|input)$/i.test(base)) {
    score += 30;
  }
  if (ext === '.txt' && (base.includes('in') || base.includes('test') || /^\d+$/.test(base))) {
    score += 20;
  }
  return score;
}

function getOutputScore(fileName: string): number {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);
  if (IGNORED_EXTENSIONS.has(ext)) {
    return 0;
  }
  let score = 0;
  if (['.out', '.ans', '.output', '.sol'].includes(ext)) {
    score += 100;
  }
  const base = path.basename(lower, ext);
  if (base.includes('output') || base.includes('answer')) {
    score += 50;
  } else if (/^(out|ans|sol)[_-]?/i.test(base) || /[_-]?(out|ans|sol)$/i.test(base)) {
    score += 30;
  }
  if (ext === '.txt' && (base.includes('out') || base.includes('ans') || base.includes('sol'))) {
    score += 20;
  }
  return score;
}

/**
 * Scans a folder on disk and returns test cases.
 * Handles:
 * Case A: Subfolders (e.g. Test01, Test02, 1, 2...) containing input & output files.
 * Case B: Flat directory containing paired files (e.g. test1.inp & test1.out, input01.txt & output01.txt).
 */
export async function scanAndImportTestcasesFromPath(folderPath: string): Promise<TestCase[]> {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const subdirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(naturalSortCompare);

  const flatFiles = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(naturalSortCompare);

  const testCases: TestCase[] = [];

  // ========================================================
  // Case A: Subfolders (Test01, Test02, 1, 2, ...)
  // ========================================================
  if (subdirs.length > 0) {
    for (const subdirName of subdirs) {
      const subDirPath = path.join(folderPath, subdirName);
      try {
        const subFiles = (await fs.promises.readdir(subDirPath, { withFileTypes: true }))
          .filter((e) => e.isFile() && !e.name.startsWith('.'))
          .map((e) => e.name);

        if (subFiles.length < 2) {
          continue;
        }

        // Rank files by input score and output score
        const inputRanked = [...subFiles]
          .map((f) => ({ file: f, score: getInputScore(f) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);

        const outputRanked = [...subFiles]
          .map((f) => ({ file: f, score: getOutputScore(f) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);

        let chosenInput: string | undefined;
        let chosenOutput: string | undefined;

        for (const inItem of inputRanked) {
          const outMatch = outputRanked.find((o) => o.file !== inItem.file);
          if (outMatch) {
            chosenInput = inItem.file;
            chosenOutput = outMatch.file;
            break;
          }
        }

        if (chosenInput && chosenOutput) {
          const inputFilePath = path.join(subDirPath, chosenInput);
          const outputFilePath = path.join(subDirPath, chosenOutput);

          const [inputContent, outputContent] = await Promise.all([
            fs.promises.readFile(inputFilePath, 'utf8'),
            fs.promises.readFile(outputFilePath, 'utf8'),
          ]);

          testCases.push({
            id: generateId(),
            testNumber: testCases.length + 1,
            input: inputContent,
            expectedOutput: outputContent,
            isExpanded: testCases.length === 0,
          });
        }
      } catch {
        // Skip unreadable subdir
      }
    }
  }

  // ========================================================
  // Case B: Flat directory with paired files (fallback if no subfolder tests found)
  // ========================================================
  if (testCases.length === 0 && flatFiles.length > 0) {
    const inputCandidates: { file: string; stem: string }[] = [];
    const outputCandidates: { file: string; stem: string }[] = [];

    for (const fileName of flatFiles) {
      const lower = fileName.toLowerCase();
      const ext = path.extname(lower);

      const inScore = getInputScore(fileName);
      const outScore = getOutputScore(fileName);

      if (inScore > 0 && inScore >= outScore) {
        inputCandidates.push({
          file: fileName,
          stem: extractStem(fileName, true),
        });
      } else if (outScore > 0) {
        outputCandidates.push({
          file: fileName,
          stem: extractStem(fileName, false),
        });
      }
    }

    // Pair input candidates with matching output candidates
    for (const inputItem of inputCandidates) {
      const inBase = path.basename(inputItem.file, path.extname(inputItem.file)).toLowerCase();

      const matchingOutput = outputCandidates.find((outItem) => {
        if (outItem.stem && inputItem.stem && outItem.stem === inputItem.stem) {
          return true;
        }
        const outBase = path.basename(outItem.file, path.extname(outItem.file)).toLowerCase();
        return inBase === outBase;
      });

      if (matchingOutput) {
        try {
          const inputPath = path.join(folderPath, inputItem.file);
          const outputPath = path.join(folderPath, matchingOutput.file);

          const [inputContent, outputContent] = await Promise.all([
            fs.promises.readFile(inputPath, 'utf8'),
            fs.promises.readFile(outputPath, 'utf8'),
          ]);

          testCases.push({
            id: generateId(),
            testNumber: testCases.length + 1,
            input: inputContent,
            expectedOutput: outputContent,
            isExpanded: testCases.length === 0,
          });

          // Remove matched output to avoid duplicate pairings
          const outIndex = outputCandidates.indexOf(matchingOutput);
          if (outIndex !== -1) {
            outputCandidates.splice(outIndex, 1);
          }
        } catch {
          // Skip if unreadable
        }
      }
    }
  }

  // Renumber test cases sequentially
  testCases.forEach((tc, idx) => {
    tc.testNumber = idx + 1;
  });

  return testCases;
}

/**
 * VS Code entry point for scanning and importing testcases
 */
export async function scanAndImportTestcases(folderUri: vscode.Uri): Promise<TestCase[]> {
  return scanAndImportTestcasesFromPath(folderUri.fsPath);
}

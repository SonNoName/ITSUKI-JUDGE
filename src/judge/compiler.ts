import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CompilationResult, SupportedLanguage } from '../types';

export interface CompilerOptions {
  cppCompiler?: string;
  cppFlags?: string[];
  pythonCommand?: string;
  javaCompiler?: string;
  javaCommand?: string;
}

export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'cpp';
    case '.c':
      return 'c';
    case '.py':
      return 'python';
    case '.java':
      return 'java';
    default:
      return 'unsupported';
  }
}

export class CodeCompiler {
  private tempBuildDir: string;

  constructor() {
    this.tempBuildDir = path.join(os.tmpdir(), 'itsuki-judge-build');
    if (!fs.existsSync(this.tempBuildDir)) {
      try {
        fs.mkdirSync(this.tempBuildDir, { recursive: true });
      } catch {
        // Ignore if already created
      }
    }
  }

  public async compile(
    sourceFilePath: string,
    options: CompilerOptions = {}
  ): Promise<CompilationResult> {
    const lang = detectLanguage(sourceFilePath);
    const startTime = Date.now();

    if (lang === 'unsupported') {
      return {
        success: false,
        error: `Unsupported language for file: ${path.basename(sourceFilePath)}. ITSUKI JUDGE supports C++ (.cpp), C (.c), Python (.py), and Java (.java).`,
      };
    }

    const rand = Math.random().toString(36).substring(2, 7);
    const fileHash = `${path.basename(sourceFilePath, path.extname(sourceFilePath))}_${Date.now()}_${rand}`;
    const isWindows = process.platform === 'win32';

    if (lang === 'cpp') {
      const compiler = options.cppCompiler || 'g++';
      const flags = options.cppFlags || ['-O3', '-std=c++17'];
      const outExeName = isWindows ? `${fileHash}.exe` : `${fileHash}.bin`;
      const outExePath = path.join(this.tempBuildDir, outExeName);

      const compileArgs = [...flags, sourceFilePath, '-o', outExePath];

      const res = await this.executeProcess(compiler, compileArgs, path.dirname(sourceFilePath));
      const compilationTimeMs = Date.now() - startTime;

      if (!res.success) {
        return {
          success: false,
          error: res.stderr || res.stdout || 'Compilation failed with unknown error',
          compilationTimeMs,
        };
      }

      return {
        success: true,
        executablePath: outExePath,
        command: outExePath,
        args: [],
        compilationTimeMs,
        cleanup: async () => {
          try {
            if (fs.existsSync(outExePath)) {
              await fs.promises.unlink(outExePath);
            }
          } catch {
            // Ignore cleanup failure
          }
        },
      };
    }

    if (lang === 'c') {
      const compiler = 'gcc';
      const flags = ['-O3', '-std=c11'];
      const outExeName = isWindows ? `${fileHash}.exe` : `${fileHash}.bin`;
      const outExePath = path.join(this.tempBuildDir, outExeName);

      const compileArgs = [...flags, sourceFilePath, '-o', outExePath];

      const res = await this.executeProcess(compiler, compileArgs, path.dirname(sourceFilePath));
      const compilationTimeMs = Date.now() - startTime;

      if (!res.success) {
        return {
          success: false,
          error: res.stderr || res.stdout || 'C compilation failed',
          compilationTimeMs,
        };
      }

      return {
        success: true,
        executablePath: outExePath,
        command: outExePath,
        args: [],
        compilationTimeMs,
        cleanup: async () => {
          try {
            if (fs.existsSync(outExePath)) {
              await fs.promises.unlink(outExePath);
            }
          } catch {
            // Ignore
          }
        },
      };
    }

    if (lang === 'python') {
      let pyCmd = options.pythonCommand || (process.platform === 'win32' ? 'python' : 'python3');
      if (process.platform === 'win32' && pyCmd === 'python3') {
        pyCmd = 'python';
      }
      // Validate Python syntax first using py_compile
      const syntaxCheck = await this.executeProcess(
        pyCmd,
        ['-m', 'py_compile', sourceFilePath],
        path.dirname(sourceFilePath)
      );
      const compilationTimeMs = Date.now() - startTime;

      if (!syntaxCheck.success) {
        return {
          success: false,
          error: syntaxCheck.stderr || syntaxCheck.stdout || 'Python syntax error',
          compilationTimeMs,
        };
      }

      return {
        success: true,
        command: pyCmd,
        args: [sourceFilePath],
        compilationTimeMs,
      };
    }

    if (lang === 'java') {
      const javacCmd = options.javaCompiler || 'javac';
      const javaCmd = options.javaCommand || 'java';
      const classOutDir = path.join(this.tempBuildDir, fileHash);
      await fs.promises.mkdir(classOutDir, { recursive: true });

      const compileRes = await this.executeProcess(
        javacCmd,
        [sourceFilePath, '-d', classOutDir],
        path.dirname(sourceFilePath)
      );
      const compilationTimeMs = Date.now() - startTime;

      if (!compileRes.success) {
        return {
          success: false,
          error: compileRes.stderr || compileRes.stdout || 'Java compilation failed',
          compilationTimeMs,
        };
      }

      const mainClass = path.basename(sourceFilePath, '.java');
      return {
        success: true,
        command: javaCmd,
        args: ['-cp', classOutDir, mainClass],
        compilationTimeMs,
        cleanup: async () => {
          try {
            await fs.promises.rm(classOutDir, { recursive: true, force: true });
          } catch {
            // Ignore
          }
        },
      };
    }

    return {
      success: false,
      error: 'Unhandled language',
    };
  }

  private executeProcess(
    command: string,
    args: string[],
    cwd: string
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = cp.spawn(command, args, {
        cwd,
        env: process.env,
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          stdout,
          stderr: `${err.message}\nCommand: ${command} ${args.join(' ')}`,
        });
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
        });
      });
    });
  }
}

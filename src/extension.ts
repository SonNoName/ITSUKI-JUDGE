import * as vscode from 'vscode';
import { JudgeViewProvider } from './judgeViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new JudgeViewProvider(context.extensionUri, context);

  // Register Webview View Provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(JudgeViewProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('itsuki-judge.addTest', async () => {
      await provider.addTestCase();
    }),

    vscode.commands.registerCommand('itsuki-judge.addNTests', async () => {
      await provider.addNTestCases();
    }),

    vscode.commands.registerCommand('itsuki-judge.batchImport', async () => {
      await provider.batchImport();
    }),

    vscode.commands.registerCommand('itsuki-judge.runAll', async () => {
      await provider.runAll();
    }),

    vscode.commands.registerCommand('itsuki-judge.clearAll', async () => {
      await provider.clearAllTestCases();
    })
  );
}

export function deactivate(): void {
  // Clean up resources if necessary
}

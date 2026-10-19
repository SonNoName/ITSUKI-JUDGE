"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const judgeViewProvider_1 = require("./judgeViewProvider");
function activate(context) {
    const provider = new judgeViewProvider_1.JudgeViewProvider(context.extensionUri, context);
    // Register Webview View Provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(judgeViewProvider_1.JudgeViewProvider.viewType, provider, {
        webviewOptions: {
            retainContextWhenHidden: true,
        },
    }));
    // Register Commands
    context.subscriptions.push(vscode.commands.registerCommand('itsuki-judge.addTest', async () => {
        await provider.addTestCase();
    }), vscode.commands.registerCommand('itsuki-judge.addNTests', async () => {
        await provider.addNTestCases();
    }), vscode.commands.registerCommand('itsuki-judge.batchImport', async () => {
        await provider.batchImport();
    }), vscode.commands.registerCommand('itsuki-judge.runAll', async () => {
        await provider.runAll();
    }), vscode.commands.registerCommand('itsuki-judge.clearAll', async () => {
        await provider.clearAllTestCases();
    }));
}
function deactivate() {
    // Clean up resources if necessary
}
//# sourceMappingURL=extension.js.map
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { getWorkspacePath } from "../../utils/path"
import path from "path"

export function buildSelectedContent(context: vscode.ExtensionContext, provider: ClineProvider) {
	// 主要的选择变化事件监听器
	const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
		const editor = event.textEditor
		const selections = event.selections

		// 获取第一个选择区域（通常用户只有一个选择）
		const primarySelection = selections[0]

		if (!primarySelection.isEmpty) {
			const filePath = editor.document.uri.fsPath
			const selectedText = editor.document.getText(primarySelection)
			const startLine = primarySelection.start.line + 1
			const endLine = primarySelection.end.line + 1
			const startChar = primarySelection.start.character
			const endChar = primarySelection.end.character

			const workspacePath = getWorkspacePath()
			const relativeFilePath = path.relative(workspacePath, filePath).replace(/\\/g, "/")
			const selectFileContent = `@/${relativeFilePath}:${startLine}-${endLine}`
			// console.log("选择的内容:", selectFileContent)

			provider.postMessageToWebview({ type: "tjlSelectedContent", text: selectFileContent })
		} else {
			provider.postMessageToWebview({ type: "tjlSelectedContent", text: "" })
		}
	})

	context.subscriptions.push(selectionChangeDisposable)
}

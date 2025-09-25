import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"

// [vscode - chatgpt - plugin.tools.command.markdown](https:;//github.com/tjlcast/vscode-chatgpt-plugin/blob/bee11b8e9f2b633732fd2cec595ef3b9e04aaefa/package.json#L60)
// [vscode - chatgpt - plugin.tools.command.markdown](https:;//github.com/tjlcast/vscode-chatgpt-plugin/blob/bee11b8e9f2b633732fd2cec595ef3b9e04aaefa/package.json#L142)
const MARKDOWN_COMMAND_NAME = "roo.tools.command.markdown"

export function buildMarkdownTool(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(MARKDOWN_COMMAND_NAME, () => {
			let activeEditor = vscode.window.activeTextEditor
			if (!activeEditor || activeEditor.document.languageId !== "markdown") {
				vscode.window.showErrorMessage("请打开一个Markdown文件")
				return
			}

			const panel = vscode.window.createWebviewPanel(
				"markdownPreview",
				"Markdown 实时预览 - " + path.basename(activeEditor.document.fileName),
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.file(path.join(context.extensionPath, "tjl", "markdownprovider", "media")),
					],
				},
			)

			// 加载HTML内容
			const htmlPath = path.join(
				context.extensionPath,
				"tjl",
				"markdownprovider",
				"media",
				"index-mdpreview.html",
			)
			let htmlContent = fs.readFileSync(htmlPath, "utf-8")

			// 设置Webview内容 html2pdf.bundle.min.js
			function replaceMediaUri(html: string, context: vscode.ExtensionContext, fileName: string): string {
				const fileUri = vscode.Uri.file(
					path.join(context.extensionPath, "tjl", "markdownprovider", "media", fileName),
				)
				const webviewUri = panel.webview.asWebviewUri(fileUri)
				return html.replace(fileName, webviewUri.toString())
			}

			// 使用
			htmlContent = replaceMediaUri(htmlContent, context, "html2pdf.bundle.min.js")
			htmlContent = replaceMediaUri(htmlContent, context, "highlight.min.css")
			htmlContent = replaceMediaUri(htmlContent, context, "highlight.min.js")
			htmlContent = replaceMediaUri(htmlContent, context, "marked.min.js")

			panel.webview.html = htmlContent

			// 发送初始内容
			panel.webview.postMessage({
				command: "init",
				text: activeEditor.document.getText(),
			})

			// 监听Webview消息
			panel.webview.onDidReceiveMessage(async (message) => {
				switch (message.command) {
					case "updateContent":
						// 更新原始文档
						if (activeEditor) {
							const edit = new vscode.WorkspaceEdit()
							const fullRange = new vscode.Range(
								activeEditor.document.positionAt(0),
								activeEditor.document.positionAt(activeEditor.document.getText().length),
							)
							edit.replace(activeEditor.document.uri, fullRange, message.text)
							await vscode.workspace.applyEdit(edit)
						}
						break

					case "ready":
						panel.webview.postMessage({
							command: "init",
							text: activeEditor?.document.getText() || "",
						})
						break

					case "save":
						try {
							if (activeEditor) {
								// 创建全范围替换编辑
								const edit = new vscode.WorkspaceEdit()
								const fullRange = new vscode.Range(
									activeEditor.document.positionAt(0),
									activeEditor.document.positionAt(activeEditor.document.getText().length),
								)
								edit.replace(activeEditor.document.uri, fullRange, message.text)

								// 应用编辑并保存
								const success = await vscode.workspace.applyEdit(edit)
								if (success) {
									await activeEditor.document.save()
									panel.webview.postMessage({
										command: "saveResult",
										success: true,
									})
								} else {
									throw new Error("应用编辑失败")
								}
							} else {
								throw new Error("无活动编辑器")
							}
						} catch (error) {
							panel.webview.postMessage({
								command: "saveResult",
								success: false,
								error: error instanceof Error ? error.message : String(error),
							})
							console.error("保存失败:", error)
						}
						break
				}
			})

			// 监听文档变化
			const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
				if (activeEditor && e.document === activeEditor.document) {
					panel.webview.postMessage({
						command: "update",
						text: e.document.getText(),
					})
				}
			})

			// 清理资源
			panel.onDidDispose(() => {
				changeSubscription.dispose()
				activeEditor = undefined
			})

			// 跟踪活动编辑器变化
			const editorChangeSubscription = vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && editor.document.languageId === "markdown") {
					activeEditor = editor
					panel.webview.postMessage({
						command: "update",
						text: editor.document.getText(),
					})
				}
			})

			panel.onDidDispose(() => {
				editorChangeSubscription.dispose()
			})
		}),
	)
}

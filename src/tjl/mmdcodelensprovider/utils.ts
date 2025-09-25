import * as vscode from "vscode"
import * as path from "node:path"
import * as fs from "node:fs"

export function showHtmlDialog(code: string, type: string, context: vscode.ExtensionContext) {
	if (type === "html") {
		console.log("html")
		const panel = vscode.window.createWebviewPanel("htmlDialog", "ECharts Graph", vscode.ViewColumn.One, {
			enableScripts: true, // 允许Webview使用JavaScript
		})

		const echartsUri = panel.webview.asWebviewUri(
			vscode.Uri.parse("https://cdn.jsdelivr.net/npm/echarts@5.3.3/dist/echarts.min.js"),
		)

		const htmlContent = code

		panel.webview.html = htmlContent
	} else if (type === "mmd") {
		console.log("mmd")
		const panel = vscode.window.createWebviewPanel("htmlDialog", "Mermaid Diagram", vscode.ViewColumn.One, {
			enableScripts: true, // 允许Webview使用JavaScript
			localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "tjl", "mmdcodelensprovider"))],
		})

		const mermaidUri = panel.webview.asWebviewUri(
			// vscode.Uri.file(path.join(context.extensionPath, "media", "mermaid.min.js")),
			vscode.Uri.file(path.join(context.extensionPath, "tjl", "mmdcodelensprovider", "mermaid.min.js")),
		)

		panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "vscode-chatgpt-plugin-cgp-mermaid-update":
						// 可以在这里保存代码到文件
						vscode.window.showInformationMessage(`Diagram updated!`)
						break

					case "vscode-chatgpt-plugin-cgp-mermaid-save": {
						const uri = await vscode.window.showSaveDialog({
							filters: {
								Images: [message.type],
							},
							defaultUri: vscode.Uri.file(`diagram.${message.type}`),
						})

						if (uri) {
							if (message.type === "svg") {
								// SVG 是字符串，直接写入
								await vscode.workspace.fs.writeFile(uri, Buffer.from(message.content, "utf-8"))
							} else if (message.type === "png") {
								// PNG 是 Uint8Array 数组（前端发来），我们构建 Buffer 写入
								// 确保 content 是 Uint8Array
								const pngData = new Uint8Array(message.content)
								await vscode.workspace.fs.writeFile(uri, pngData)
								// await vscode.workspace.fs.writeFile(
								//   uri,
								//   Buffer.from(message.content), // content 是 number[]
								// );
							}

							vscode.window.showInformationMessage(`Diagram saved as ${message.type}`)
						}
						break
					}
				}
			},
			undefined,
			context.subscriptions,
		)

		panel.webview.html = getMermaidHtml(code, mermaidUri, context)
	}
}

function getMermaidHtml(code: string, mermaidUri: vscode.Uri, context: vscode.ExtensionContext): string {
	// 获取模板文件路径
	const templatePath = path.join(context.extensionPath, "tjl", "mmdcodelensprovider", "index-mermaid.html")

	// 读取模板文件
	let html = fs.readFileSync(templatePath, "utf-8")

	// 替换占位符
	html = html.replace("<!-- MERMAIRD_CODE_PLACEHOLDER -->", code.replace(/&gt;/g, ">").replace(/&lt;/g, "<"))

	// 特殊处理 mermaid.js 路径
	html = html.replace("MERMAIRD_JS_URI_PLACEHOLDER", mermaidUri.toString())

	return html
}

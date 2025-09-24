import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"

export function fileMapActivate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"roo-cline.generateFileMap",
		async (uri: vscode.Uri, selectedUris?: vscode.Uri[]) => {
			const targets = selectedUris && selectedUris.length > 0 ? selectedUris : [uri]

			let fileTree: string[] = []
			let fileContents: string[] = []

			for (const target of targets) {
				const stat = fs.statSync(target.fsPath)
				if (stat.isDirectory()) {
					const files = await walkDir(target.fsPath)
					fileTree.push(treeify(target.fsPath, files))
					for (const filePath of files) {
						const rel = vscode.workspace.asRelativePath(filePath)
						const content = fs.readFileSync(filePath, "utf-8")
						fileContents.push(`--- ${rel} ---\n${content}`)
					}
				} else {
					const rel = vscode.workspace.asRelativePath(target.fsPath)
					fileTree.push(`📄 ${rel}`)
					const content = fs.readFileSync(target.fsPath, "utf-8")
					fileContents.push(`--- ${rel} ---\n${content}`)
				}
			}

			const finalText = [...fileTree, "", ...fileContents].join("\n")
			openFilemapWebview(context, finalText)
		},
	)

	context.subscriptions.push(disposable)
}

async function walkDir(dir: string): Promise<string[]> {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	const files = await Promise.all(
		entries.map((entry) => {
			const res = path.resolve(dir, entry.name)
			return entry.isDirectory() ? walkDir(res) : Promise.resolve([res])
		}),
	)
	return files.flat()
}

function treeify(baseDir: string, files: string[]): string {
	const treeLines: string[] = [`📁 ${vscode.workspace.asRelativePath(baseDir)}`]
	for (const file of files) {
		const relPath = path.relative(baseDir, file).split(path.sep)
		let indent = "  "
		relPath.forEach((part, i) => {
			const prefix = i === relPath.length - 1 ? "├── " : "│   "
			treeLines.push(`${indent.repeat(i)}${prefix}${part}`)
		})
	}
	return treeLines.join("\n")
}

function openFilemapWebview(context: vscode.ExtensionContext, content: string) {
	const panel = vscode.window.createWebviewPanel("filemapView", "Filemap Viewer", vscode.ViewColumn.One, {
		enableScripts: true,
	})

	panel.webview.html = getWebviewContent(content)
}

function getWebviewContent(text: string): string {
	const escaped = text.replace(/</g, "&lt;").replace(/>/g, "&gt;")
	return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        textarea {
          width: 100%;
          height: 90vh;
          font-family: monospace;
          padding: 10px;
        }
        button {
          margin-top: 10px;
          padding: 5px 10px;
        }
      </style>
    </head>
    <body>
      <br />
      <button onclick="copyText()">复制</button>
      <br />
      <textarea id="filemap">${escaped}</textarea>
      <script>
        function copyText() {
          const textarea = document.getElementById('filemap');
          textarea.select();
          document.execCommand('copy');
        }
      </script>
    </body>
    </html>
  `
}

export function deactivate() {}

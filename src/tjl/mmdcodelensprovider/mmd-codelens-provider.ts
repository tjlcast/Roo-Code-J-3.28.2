import FormData from "form-data"
import * as fs from "fs"
import * as vscode from "vscode"
import { Package } from "../../shared/package"
import { showHtmlDialog } from "./utils"

const MMD_COMMAND_NAME = "roo.tools.command.mermaid"

export function buildMmdTool(context: vscode.ExtensionContext) {
	// 判断是否启用函数焦点模式
	if (!vscode.workspace.getConfiguration(Package.name).get<boolean>("enableCodeActions", true)) {
		return
	}

	vscode.languages.registerCodeLensProvider("*", new MmdCodeLensProvider(context))
	context.subscriptions.push(
		vscode.commands.registerCommand(MMD_COMMAND_NAME, async (curlCommand: string) => {
			showHtmlDialog(curlCommand, "mmd", context)
		}),
	)
}

export class MmdCodeLensProvider implements vscode.CodeLensProvider {
	private codeLenses: vscode.CodeLens[] = []
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
	readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		this.codeLenses = []
		// 判断是否启用函数焦点模式
		if (!vscode.workspace.getConfiguration(Package.name).get<boolean>("enableCodeActions", true)) {
			return []
		}

		const text = document.getText()

		const commandRanges = this.findMermaidCommands(text)
		for (const { command, absoluteOffset } of commandRanges) {
			const pos = new vscode.Position(absoluteOffset, 0)
			const range = new vscode.Range(pos, pos)
			this.codeLenses.push(
				new vscode.CodeLens(range, {
					title: "🧪 Run mermaid",
					command: MMD_COMMAND_NAME,
					arguments: [command],
				}),
			)
		}

		return this.codeLenses
	}

	private findMermaidCommands(text: string): { command: string; absoluteOffset: number }[] {
		const results: { command: string; absoluteOffset: number }[] = []
		const lines = text.split(/\r?\n/)
		let accumulatedOffset = 0

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const trimmed = line.trim()

			// Check if this line starts a mermaid code block
			if (trimmed.startsWith("```mermaid") || trimmed.startsWith("``` mermaid")) {
				let mermaidLines = []
				let mermaidStartOffset = i
				let j = i + 1

				// Collect lines until we find the closing ```
				while (j < lines.length) {
					const nextLine = lines[j]
					if (nextLine.trim() === "```") {
						break
					}
					mermaidLines.push(nextLine)
					j++
				}

				// If we found the closing ```, add the mermaid block
				if (j < lines.length && lines[j].trim() === "```") {
					// Update the loop index to skip processed lines
					i = j

					// Join the mermaid lines
					let fullMermaidCode = mermaidLines.join("\n").trim()

					results.push({
						command: fullMermaidCode,
						absoluteOffset: mermaidStartOffset,
					})
				}
			}

			accumulatedOffset += line.length + 1
		}

		return results
	}
}

/**
 * Parses a curl command into fetch-compatible options
 */
function parseCurlCommand(curlCommand: string): {
	url: string
	options: RequestInit
	formData: FormData | null
} {
	let formData: FormData | null = null
	// 保留原始换行符以便正确处理多行数据
	const normalizedCmd = curlCommand
		.replace(/\\\r?\n/g, "\n") // 将续行符转换为实际换行
		.replace(/\s+\n/g, "\n") // 清理行尾空格
		.replace(/\n\s+/g, "\n") // 清理行首空格
		.trim()

	const args: string[] = []
	let currentArg = ""
	let inQuotes = false
	let quoteChar = ""

	// 更智能的参数分割，处理带引号和换行的参数
	for (let i = 0; i < normalizedCmd.length; i++) {
		const char = normalizedCmd[i]

		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true
			quoteChar = char
			continue
		}

		if (char === quoteChar && inQuotes) {
			inQuotes = false
			quoteChar = ""
			continue
		}

		if (char === " " && !inQuotes) {
			if (currentArg) {
				args.push(currentArg)
				currentArg = ""
			}
			continue
		}

		if (char === "\n" && !inQuotes) {
			if (currentArg) {
				args.push(currentArg)
				currentArg = ""
			}
			continue
		}

		currentArg += char
	}

	if (currentArg) {
		args.push(currentArg)
	}

	let url = ""
	const options: RequestInit = {
		method: "GET",
		headers: {} as Record<string, string>,
	}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]

		if (arg === "curl") {
			continue
		} else if (arg.startsWith("http://") || arg.startsWith("https://")) {
			url = arg
		} else if (arg === "-X" || arg === "--request") {
			options.method = args[++i].toUpperCase()
		} else if (arg === "-H" || arg === "--header") {
			const header = args[++i].split(/:(.*)/) // 只在第一个冒号处分割
			const key = header[0].trim()
			const value = header[1].trim()
			;(options.headers as Record<string, string>)[key] = value
		} else if (arg === "-d" || arg === "--data") {
			// 处理多行数据
			let data = args[++i]

			// 检查是否以引号开始，如果是则寻找匹配的结束引号
			if (data.startsWith("'") && data.endsWith("'")) {
				data = data.slice(1, -1)
			} else if (data.startsWith('"') && data.endsWith('"')) {
				data = data.slice(1, -1)
			} else {
				// 如果不是引号包裹的，可能是多行数据的一部分
				while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
					data += "\n" + args[++i]
				}
			}

			options.body = data
			if (!options.method || options.method === "GET") {
				options.method = "POST"
			}
		} else if (arg === "-u" || arg === "--user") {
			const credentials = args[++i]
			;(options.headers as Record<string, string>)["Authorization"] = `Basic ${Buffer.from(credentials).toString(
				"base64",
			)}`
		} else if (arg === "--form" || arg === "-F") {
			if (formData === null) {
				formData = new FormData()
			}
			const formArg = args[++i]
			const [key, valueRaw] = formArg.split("=")

			if (valueRaw.startsWith("@")) {
				const filePath = valueRaw.slice(1)
				formData.append(key, fs.createReadStream(filePath))
			} else {
				formData.append(key, valueRaw)
			}
		}
	}

	if (!url) {
		throw new Error("No URL found in curl command")
	}

	return { url, options, formData }
}

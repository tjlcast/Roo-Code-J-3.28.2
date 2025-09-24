// import fetch from 'isomorphic-fetch';
import FormData from "form-data"
import * as fs from "fs"
import nodeFetch from "node-fetch"
import { PassThrough } from "stream"
import * as vscode from "vscode"

const CURL_COMMAND_NAME = "roo.tools.command.curl"

export function buildCurlTool(context: vscode.ExtensionContext) {
	// vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new CurlCodeLensProvider());
	vscode.languages.registerCodeLensProvider("*", new CurlCodeLensProvider())
	context.subscriptions.push(
		// Register the command to run curl as fetch
		vscode.commands.registerCommand(CURL_COMMAND_NAME, async (curlCommand: string) => {
			try {
				// Parse the curl command into fetch options
				const fetchOptions = parseCurlCommand(curlCommand)

				// Show progress notification
				vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Executing curl request...`,
						cancellable: true,
					},
					async (progress, token) => {
						// 创建一个 AbortController 用于取消 fetch 请求
						const abortController = new AbortController()

						token.onCancellationRequested(() => {
							abortController.abort()
							vscode.window.showInformationMessage("Request was cancelled by user")
						})

						// 创建文档
						const doc = await vscode.workspace.openTextDocument({
							language: "plaintext",
							content: `>>>>>>>> Request to ${fetchOptions.url} >>>>>>>>\n\n`,
						})
						const editor = await vscode.window.showTextDocument(doc, { preview: false })

						// 监听文档关闭事件，取消请求
						const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
							if (closedDoc === doc) {
								abortController.abort()
								closeListener.dispose()
							}
						})

						try {
							await handleFetch(
								fetchOptions.url,
								fetchOptions.options,
								fetchOptions.formData,
								abortController.signal,
								editor,
							)
						} catch (error) {
							await appendText(
								editor,
								`\n\n[Error] ${error instanceof Error ? error.message : String(error)}\n`,
							)
						}
					},
				)
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to execute curl command: ${(error as Error).message}`)
			}
		}),
	)
}

export class CurlCodeLensProvider implements vscode.CodeLensProvider {
	private codeLenses: vscode.CodeLens[] = []
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
	readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		this.codeLenses = []
		if (!vscode.workspace.getConfiguration("chatgpt").get<boolean>("tools.enable.codelen.curl")) {
			return this.codeLenses
		}

		const text = document.getText()

		const commandRanges = this.findCurlCommands(text)
		for (const { command, absoluteOffset } of commandRanges) {
			const pos = new vscode.Position(absoluteOffset, 0)
			const range = new vscode.Range(pos, pos)
			this.codeLenses.push(
				new vscode.CodeLens(range, {
					title: "🧪 Run curl",
					command: CURL_COMMAND_NAME,
					arguments: [command],
				}),
			)
		}

		return this.codeLenses
	}

	private findCurlCommands(text: string): { command: string; absoluteOffset: number }[] {
		const results: { command: string; absoluteOffset: number }[] = []
		const lines = text.split(/\r?\n/)
		let accumulatedOffset = 0

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const trimmed = line.trim()

			// Check if this line starts a curl command
			if (trimmed.startsWith("curl")) {
				let commandLines = [line]
				// let commandStartOffset = accumulatedOffset + line.indexOf('curl');
				let commandStartOffset = i
				let currentOffset = accumulatedOffset + line.length + 1
				let openQuotes = false
				let continuation = false

				// Check for line continuation or open quotes
				openQuotes = this.hasOpenQuotes(line)
				continuation = line.trimEnd().endsWith("\\") && !openQuotes

				// Collect continuation lines
				let j = i + 1
				while (j < lines.length && (continuation || openQuotes)) {
					const nextLine = lines[j]
					commandLines.push(nextLine)
					currentOffset += nextLine.length + 1

					openQuotes = this.hasOpenQuotes(commandLines.join("\n"))
					continuation = nextLine.trimEnd().endsWith("\\") && !openQuotes
					j++
				}

				// If we collected multiple lines, update the loop index
				if (j > i + 1) {
					i = j - 1
				}

				// Join the command lines and clean up continuations
				let fullCommand = commandLines
					.join("\n")
					.replace(/\\\s*\n\s*/g, " ") // Replace line continuations with space
					.replace(/\s+/g, " ") // Collapse multiple spaces
					.trim()

				results.push({
					command: fullCommand,
					absoluteOffset: commandStartOffset,
				})
			}

			accumulatedOffset += line.length + 1
		}

		return results
	}

	private hasOpenQuotes(text: string): boolean {
		// Count single and double quotes, ignoring escaped quotes
		const singleQuotes = (text.match(/(?<!\\)'/g) || []).length
		const doubleQuotes = (text.match(/(?<!\\)"/g) || []).length
		return (singleQuotes + doubleQuotes) % 2 !== 0
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

async function handleFetch(
	url: string,
	options: RequestInit,
	form: FormData | null,
	signal: AbortSignal,
	editor: vscode.TextEditor,
) {
	const sendTs = new Date()
	// 构造新的请求参数，使用 form 作为 body（如果存在）
	const finalOptions: RequestInit = {
		...options,
		body: options.body,
		signal,
	}

	// Remove any existing Content-Type header as FormData will set it
	let response
	if (form && finalOptions.headers) {
		// const headers = finalOptions.headers as Record<string, string>;
		// delete headers['Content-Type'];

		response = await nodeFetch(url, {
			method: "POST",
			body: form,
			headers: form.getHeaders(),
		})
	} else {
		response = await fetch(url, finalOptions)
	}

	await appendText(
		editor,
		"REQUEST: >>>>>>>> \n\r\n\r" +
			JSON.stringify(
				{
					request: {
						url: url,
						timestamp: sendTs.toISOString(),
					},
				},
				null,
				2,
			) +
			"\n\r\n\rRESPONSE_STATUS: >>>>>>>> \n\r\n\r" +
			JSON.stringify(
				{
					response: {
						status: response.status,
						statusText: response.statusText,
						headers: response.headers,
					},
					timestemp: new Date().toISOString(),
				},
				null,
				2,
			) +
			"\n\r\n\rRESPONSE_BODY: >>>>>>>> \n\r\n\r",
	)
	// await appendText(editor, `\nStatus: ${response.status} ${response.statusText}\n`);

	const contentType = response.headers.get("Content-Type") || ""

	if (contentType.includes("text/event-stream")) {
		await appendText(editor, `\nResponse (SSE): >>>>>>>>\r\n`)
		await handleSSEStream(response as Response, editor, signal)
	} else {
		const text = await response.text()
		try {
			const parsed = JSON.parse(text)
			await appendText(editor, `\nResponse (JSON): >>>>>>>>\r\n${JSON.stringify(parsed, null, 2)}\r\n`)
		} catch {
			await appendText(editor, `\nResponse (Text): >>>>>>>>\r\n${text}\r\n`)
		}
	}
	await appendText(editor, `>>>>>>>>\r\n\r\n`)

	await appendText(editor, `\n\r\n\rFINISH(at ` + new Date().toISOString() + `): >>>>>>>> \n\r\n\r`)
}

async function handleSSEStream(response: Response, editor: vscode.TextEditor, signal: AbortSignal): Promise<void> {
	const body = response.body!
	const isReader = typeof body?.getReader === "function"

	// Common SSE parser function
	const processSSEEvent = async (data: string) => {
		try {
			await appendText(editor, `${data}\n`)
		} catch (err) {
			await appendText(editor, `\n[Data Parse Error] ${(err as Error).message}\n`)
		}
	}

	if (!isReader) {
		// Legacy stream handling for older environments
		return new Promise((resolve, reject) => {
			let buffer = ""

			const body = response.body as unknown as PassThrough
			if (!body?.on || !body?.read) {
				appendText(editor, `\n[Stream Error] unsupported "fetch" implementation\n`)
					.then(() => reject(new Error("Unsupported fetch implementation")))
					.catch(reject)
				return
			}

			body.on("readable", async () => {
				let chunk: Buffer | string | null
				while (null !== (chunk = body.read())) {
					await processSSEEvent(chunk.toString("utf8"))
				}
			})

			body.on("error", (err) => {
				appendText(editor, `\n[Stream Error] ${err.message}\n`)
				reject(err)
			})

			body.on("close", () => {
				if (buffer.trim()) {
					// Process any remaining data
					processSSEEvent(buffer.trim()).finally(() => resolve())
				} else {
					resolve()
				}
			})
		})
	} else {
		// Modern ReadableStream handling

		const reader = body.getReader()
		const decoder = new TextDecoder("utf-8")
		let buffer = ""

		try {
			while (true) {
				const { value, done } = await reader.read()
				if (done) {
					break
				}

				buffer += decoder.decode(value, { stream: true })

				let lines = buffer.split(/\r?\n/)
				buffer = lines.pop()! // 保留最后一行未处理

				for (const line of lines) {
					if (line.trim() === "") {
						continue
					}
					await appendText(editor, `${line}\n`)
				}

				if (signal.aborted) {
					break
				}
			}
		} catch (err) {
			if ((err as any)?.name !== "AbortError") {
				await appendText(editor, `\n[Stream Error] ${(err as any)?.message || err}\n`)
			}
		}
	}
}

async function appendText(editor: vscode.TextEditor, text: string) {
	const doc = editor.document
	const end = new vscode.Position(doc.lineCount, 0)
	await editor.edit((editBuilder) => {
		editBuilder.insert(end, text)
	})
}

import * as vscode from "vscode"
import {
	CancellationToken,
	InlineCompletionContext,
	InlineCompletionItem,
	InlineCompletionItemProvider,
	InlineCompletionTriggerKind,
	NotebookDocument,
	NotebookRange,
	Position,
	Range,
	TextDocument,
	window,
} from "vscode"
import { CompletionRequest, CompletionResponse } from "./TabbyCompletionContext"
import { defaultAgentConfig } from "./agent/AgentConfig"
import { agent } from "./agent/agent"
import { logger } from "./logger"
import { Package } from "../../shared/package"

export class TabbyCompletionProvider implements InlineCompletionItemProvider {
	// vscode内置的'输出'日志器
	private readonly logger = logger()
	// 定义的触发方式
	private triggerMode: "automatic" | "manual" | "disabled" = "automatic"
	// 是否处于请求动作中
	private loading: boolean = false
	// 异步关闭信号
	private onGoingRequestAbortController: AbortController | null = null

	public constructor() {}

	/**
	 * 提供内联自动补全建议的函数
	 *
	 * @param document 当前编辑的文档对象。它包含了文档的文本内容和其他元数据。
	 * @param position 光标在文档中的位置。它是一个包含行（line）和列（character）的对象，用于标识光标在文档中的具体位置。
	 * @param context 内联自动补全的上下文。它包含了触发自动补全的文本、光标位置以及其他相关信息。
	 * @param token 取消令牌。当用户取消操作或VS Code关闭时，这个令牌会被触发，用于取消异步操作。
	 * @returns
	 */
	public async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<InlineCompletionItem[] | null> {
		// enable code infill
		if (!vscode.workspace.getConfiguration(Package.name).get<boolean>("enableCodeInfill", true)) {
			return []
		}

		if (defaultAgentConfig.server.endpoint.length === 0) {
			this.logger.warn("Code completions disabled.")
			return null
		}

		this.logger.info("Call provideInlineCompletionItems.")

		// Skip automatic trigger when triggerMode is manual
		if (context.triggerKind === InlineCompletionTriggerKind.Automatic && this.triggerMode === "manual") {
			this.logger.info("Skip automatic trigger when triggerMode is manual.")
			return null
		}

		// Skip when trigger automatically and text selected
		if (
			context.triggerKind === InlineCompletionTriggerKind.Automatic &&
			window.activeTextEditor &&
			!window.activeTextEditor.selection.isEmpty
		) {
			this.logger.info("Text selected, skipping.")
			return null
		}

		// Check if autocomplete widget is visible
		if (context.selectedCompletionInfo !== undefined) {
			this.logger.info("Autocomplete widget is visible, skipping.")
			return null
		}

		// Skip when the request is canceled
		if (token?.isCancellationRequested) {
			this.logger.info("Completion request is canceled before agent request.")
			return null
		}

		const additionalContext = this.buildAdditionalContext(document)
		this.logger.info("additionalContext: ", JSON.stringify(additionalContext))
		const request: CompletionRequest = {
			filepath: document.uri.fsPath,
			language: document.languageId,
			text: additionalContext.prefix + document.getText() + additionalContext.suffix,
			position: additionalContext.prefix.length + document.offsetAt(position),
			indentation: this.getEditorIndentation(),
			manually: context.triggerKind === InlineCompletionTriggerKind.Invoke,
		}

		const abortController = new AbortController()
		this.onGoingRequestAbortController = abortController
		token?.onCancellationRequested(() => {
			this.logger.info("Completion request is canceled.")
			abortController.abort()
		})

		try {
			this.loading = true
			const result: CompletionResponse = await agent().provideCompletion(request, {
				signal: abortController.signal,
			})
			this.loading = false

			if (token?.isCancellationRequested) {
				this.logger.info("Completion request is canceled after agent request.")
				return null
			}

			// Assume only one choice is provided, do not support multiple choices for now.
			if (result.choices.length > 0) {
				const choice = result.choices[0]!

				return [
					new InlineCompletionItem(
						choice.text,
						new Range(
							document.positionAt(choice.replaceRange.start - additionalContext.prefix.length),
							document.positionAt(choice.replaceRange.end - additionalContext.prefix.length),
						),
						{
							title: "",
							command: "tabby.applyCallback",
							arguments: [() => {}],
						},
					),
				]
			}
		} catch (error: any) {
			if (this.onGoingRequestAbortController === abortController) {
				// the request was not replaced by a new request, set loading to false safely
				this.loading = false
			}
			if (error.name !== "AbortError") {
				this.logger.error("Error when providing completions", JSON.stringify({ error }))
			}
		}

		return null
	}

	private buildAdditionalContext(document: TextDocument): { prefix: string; suffix: string } {
		if (
			document.uri.scheme === "vscode-noteboot-cell" &&
			window.activeNotebookEditor?.notebook.uri.path === document.uri.path
		) {
			// Add all the cells in the notebook as context
			const notebook = window.activeNotebookEditor.notebook
			const current = window.activeNotebookEditor.selection.start
			const prefix =
				this.buildNotebootContext(notebook, new NotebookRange(0, current), document.languageId) + "\n\n"
			const suffix =
				"\n\n" +
				this.buildNotebootContext(
					notebook,
					new NotebookRange(current + 1, notebook.cellCount),
					document.languageId,
				)
			return {
				prefix,
				suffix,
			}
		}
		return {
			prefix: "",
			suffix: "",
		}
	}

	private buildNotebootContext(notebook: NotebookDocument, range: NotebookRange, languageId: string): string {
		return notebook
			.getCells(range)
			.map((cell) => {
				if (cell.document.languageId === languageId) {
					return cell.document.getText()
				} else if (Object.keys(this.notebookLanguageComments).includes(languageId)) {
					return this.notebookLanguageComments[languageId]!(cell.document.getText())
				} else {
					return ""
				}
			})
			.join("\n\n")
	}

	private notebookLanguageComments: { [languageId: string]: (code: string) => string } = {
		markdown: (code) => "```\n" + code + "\n```",
		python: (code) =>
			code
				.split("\n")
				.map((l) => "# " + l)
				.join("\n"),
	}

	private getEditorIndentation(): string | undefined {
		const editor = window.activeTextEditor
		if (!editor) {
			return undefined
		}

		const { insertSpaces, tabSize } = editor.options
		if (insertSpaces && typeof tabSize === "number" && tabSize > 0) {
			return " ".repeat(tabSize)
		} else if (!insertSpaces) {
			return "\t"
		}
		return undefined
	}
}

import { ClineProvider } from "../core/webview/ClineProvider"
import { updateAgentInstance } from "./codeinfill/agent/agent"
import { TabbyCompletionProvider } from "./codeinfill/TabbyCompletionProvider"
import CodeLensProvider from "./codelensprovider"
import vscode from "vscode"
import { asyncGenerateCommitMessageHandler } from "./git/generate-commit-message"
import { fileMapActivate } from "./filemap/file-map"
import { buildCurlTool } from "./curlcodelensprovider/curl-codelens-provider"
import { buildMmdTool } from "./mmdcodelensprovider/mmd-codelens-provider"
import { buildSelectedContent } from "./sendselectedcontent/send_selected_content"
import { buildMarkdownTool } from "./markdownprovider/markdown-command-provider"
import { registerPromptManager } from "./promptmanager/promptManagerModule"

export function tjl(context: vscode.ExtensionContext, provider: ClineProvider) {
	// 注册函数焦点
	new CodeLensProvider(context)

	// 注册函数补全
	const completionProvider = new TabbyCompletionProvider()
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, completionProvider),
	)
	updateAgentInstance(context, "http://localhost:9966")

	// 注册git commit gc
	let disposable = vscode.commands.registerCommand("roo-cline.generateCommitMessage", async () => {
		await asyncGenerateCommitMessageHandler(provider)
	})
	context.subscriptions.push(disposable)

	// 注册file map功能
	fileMapActivate(context)

	// 注册curl codelens
	buildCurlTool(context)

	// 注册mermaid codelens
	buildMmdTool(context)

	// 注册实时文件内容选择
	buildSelectedContent(context, provider)

	// 注册markdown provider
	buildMarkdownTool(context)

	// 注册提示词管理页面
	registerPromptManager(context)

	// done.
}

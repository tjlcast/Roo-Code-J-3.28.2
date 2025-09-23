import { updateAgentInstance } from "./codeinfill/agent/agent"
import { TabbyCompletionProvider } from "./codeinfill/TabbyCompletionProvider"
import CodeLensProvider from "./codelensprovider"
import vscode from "vscode"

export function tjl(context: vscode.ExtensionContext) {
	// 注册函数焦点
	new CodeLensProvider(context)

	// 注册函数补全
	const completionProvider = new TabbyCompletionProvider()
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, completionProvider),
	)
	updateAgentInstance(context, "http://localhost:9966")

	// done.
}

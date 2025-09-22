import CodeLensProvider from "./codelensprovider"
import vscode from "vscode"

export function tjl(context: vscode.ExtensionContext) {
	new CodeLensProvider(context)
}

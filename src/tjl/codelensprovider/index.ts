import vscode, { ExtensionContext } from "vscode"
// import { logger } from '../../logger';
import { getAllFunctionsRange, SyntaxService } from "./syntax"
import { getCodeActionCommand } from "../../utils/commands"

/**
 * 说明：
 * 这里label 是在函数头上显示的文字信息，同时也是对应了触发的指令；
 * value 对应的是触发时执行的命令（已经在package.json）注册；
 * enable 控制是否在函数头部显示
 */
export const OP_ITEMS = [
	{ label: "Explain with Roo Code", value: getCodeActionCommand("explainCode"), enable: true },
	{ label: "Improve with Roo Code", value: getCodeActionCommand("improveCode"), enable: true },
	{ label: "Add to Roo Code", value: getCodeActionCommand("addToContext"), enable: true },
]

export function createFullLineRange(row: number) {
	const start = new vscode.Position(row, 0)
	const end = new vscode.Position(row, Number.MAX_SAFE_INTEGER)
	return new vscode.Range(start, end)
}

function selectRange(range: vscode.Range) {
	let editor = vscode.window.activeTextEditor
	if (editor) {
		editor.selection = new vscode.Selection(range.start, range.end)
	}
}

export default class CodeLensProvider implements vscode.CodeLensProvider {
	private _context: vscode.ExtensionContext
	private _commandName = "chatgpt.runOperation"
	private _showActionsCommand = "chatgpt.showActions"
	private syntaxService!: SyntaxService
	// private readonly logger = logger()

	constructor(context: ExtensionContext) {
		this._context = context
		this.syntaxService = new SyntaxService()
		this.initialize()
	}

	initialize() {
		this._context.subscriptions.push(
			vscode.languages.registerCodeLensProvider(
				{
					pattern:
						"**/*.{ts,js,tsx,jsx,java,py,go,rust,css,dart,html,kt,kts,scala,sc,swift,rs,cpp,,cc,c,vue}",
				},
				this,
			),
		)
		this._context.subscriptions.push(
			vscode.commands.registerCommand(this._commandName, (range, command) => {
				selectRange(range)
				vscode.commands.executeCommand(command)
			}),
		)

		// 注册显示操作列表的命令
		this._context.subscriptions.push(
			vscode.commands.registerCommand(this._showActionsCommand, (range) => {
				// 创建操作项列表
				const quickPickItems = OP_ITEMS.filter((item) => item.enable).map((item) => ({
					label: item.label,
					description: item.value,
				}))

				// 显示快速选择框
				vscode.window
					.showQuickPick(quickPickItems, {
						placeHolder: "Select an action to perform on the function",
					})
					.then((selectedItem) => {
						if (selectedItem) {
							selectRange(range)
							vscode.commands.executeCommand(selectedItem.description)
						}
					})
			}),
		)
		console.log("Finished installation codelensProvider")
	}

	async provideCodeLenses(
		document: vscode.TextDocument,
		token: vscode.CancellationToken,
	): Promise<vscode.CodeLens[] | undefined> {
		console.log("provideCodeLenses")
		// if (!vscode.workspace.getConfiguration("chatgpt").get<boolean>("methodShortcut")) {
		// 	// this.logger.debug("methodShortcut disabled")
		// 	return
		// }

		const ast = await this.syntaxService.parse(document)
		if (!ast) {
			// this.logger.debug("Syntax tree not found")
			return
		}

		const lenses: vscode.CodeLens[] = []

		const allFunctions = [...getAllFunctionsRange(ast)]
		for (const range of allFunctions) {
			const functionHead = createFullLineRange(range.start.line)

			// 添加显示操作列表的 CodeLens
			lenses.push(
				new vscode.CodeLens(functionHead, {
					title: "$(chatgpt-logo-s)",
					command: this._showActionsCommand,
					arguments: [range],
				}),
			)
		}

		return lenses
	}
}

import { exec } from "child_process"
import { promisify } from "util"
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { buildApiHandler } from "../../api"
import Anthropic from "@anthropic-ai/sdk"

const execPromise = promisify(exec)

const GIT_HISOTRY = `
      feat: add some tests about cache.

      fix: fix some errors on chat.`
const PROMPT = `
$git_history

上面是之前提交的两条历史commit的message，包含了feat和fix两种模式。
现在你的任务时根据下面我的git diff，给我生成相同格式的git message。
注意feat表示新的开发功能，fix表示修复问题，其中只能使用一个。对修改需要进行较为明确的修改。

$git_diff

只输出commit_message，结尾不要说明，不要解释，不要输出git diff信息。
`

export async function asyncGenerateCommitMessageHandler(clineProvider: ClineProvider) {
	// workStatusBar(`generating commit messages`)
	try {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports
		const api = gitExtension.getAPI(1)

		const repository = api.repositories[0] // 获取当前打开的git仓库

		// 获取工作区的状态
		const indexChanges = repository.state.indexChanges
		if (indexChanges === 0 || indexChanges.length === 0) {
			vscode.window.showInformationMessage("No changes in the staging area.")
			return
		}

		// 获取git diff
		const { stdout: gitDiff } = await execPromise(`git diff --cached`, {
			cwd: repository.rootUri.fsPath,
		})
		// vscode.window.showInformationMessage(`Diff:${gitDiff}`);

		// 如果 gitDiff 为空直接返回
		if (!gitDiff) {
			vscode.window.showInformationMessage("No changes in the staging area.")
			return
		}

		const GIT_DIFF = gitDiff
		const PROMPT_TPL = vscode.workspace.getConfiguration("chatgpt").get<string>(`git.generateCommit`) || PROMPT
		const prompt = PROMPT_TPL.replace("$git_history", GIT_HISOTRY.trim()).replace("$git_diff", GIT_DIFF.trim())

		if (!repository) {
			vscode.window.showErrorMessage("未找到git仓库!")
			return
		}

		// 使用配置创建 ApiHandler
		const state = await clineProvider.getState()
		const apiConfiguration = state.apiConfiguration
		const apiHandler = buildApiHandler(apiConfiguration)
		// 使用 createMessage 方法发送请求
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text" as const,
						text: prompt,
					},
				],
			},
		]
		const sys_prompt = `
You are an expert software engineer that generates concise, one-line Git commit messages based on the provided diffs.
Review the provided context and diffs which are about to be committed to a git repo.
Review the diffs carefully.
Generate a one-line commit message for those changes.
The commit message should be structured as follows: <type>: <description>
Use these for <type>: fix, feat, build, chore, ci, docs, style, refactor, perf, test

Ensure the commit message:
- Starts with the appropriate prefix.
- Is in the imperative mood (e.g., "Add feature" not "Added feature" or "Adding feature").
- Does not exceed 72 characters.

Reply only with the one-line commit message, without any additional text, explanations, or line breaks.

`
		const stream = apiHandler.createMessage(sys_prompt, messages)

		let gMessage = ""
		for await (const chunk of stream) {
			if (chunk.type === "text") {
				gMessage += chunk.text

				const newCommitMsg = removeMarkdownCodeBlock(gMessage) // 设置commit message
				repository.inputBox.value = removeBackticks(newCommitMsg)
			}
		}

		// 如果 gMessage 为空直接返回
		if (!gMessage) {
			vscode.window.showErrorMessage("生成commit message失败")
			return
		}
	} finally {
		// normalStatusBar()
	}
}

/**
 * @desc 这个方法的作用是移除字符串开头和结尾的三个反引号
 * @param input
 * @returns
 */
export function removeBackticks(input: string): string {
	// 正则表达式匹配开头和结尾的三个反引号
	const regex = /^```|```$/g
	// 使用正则表达式替换开头和结尾的三个反引号
	return input.replace(regex, "")
}

/**
 * @desc 这个方法的作用是移除Markdown代码块
 * @param input
 * @returns
 */
export function removeMarkdownCodeBlock(input: string): string {
	// 正则表达式匹配Markdown代码块
	const markdownCodeBlockRegex = /```[\s\S]*?\n([\s\S]*?)\n?```/s
	// 使用正则表达式测试字符串
	const match = input.trim().match(markdownCodeBlockRegex)
	// 如果匹配到代码块，返回匹配到的内容，否则返回原始字符串
	return match ? match[1] : input
}

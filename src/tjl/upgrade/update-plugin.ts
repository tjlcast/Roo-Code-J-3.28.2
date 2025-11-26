import * as fs from "fs"
import path from "path"
import * as vscode from "vscode"
import { Parser } from "xml2js"
import { updateAgentInstance } from "../codeinfill/agent/agent"
// import { logger } from './logger';
// import { asyncRunWithStatusBarUpdate } from "./status-bar-item"

// 配置的下载xml地址
// xml的格式信息参考 ./release.xml 文件
export const remoteUrl = "https://tjlcast.github.io/static-web/release.xml"
// export const remoteUrl = "http://197.68.33.61:82/versions/releases/vscode/release.xml"

// 本插件的 extensionId
export const extensionId = "RooVeterinaryInc.roo-cline"

export function getExtensionCurrentVersion(): string {
	return vscode.extensions.getExtension(extensionId)?.packageJSON.version
}

export const asyncCheckForUpdates = async (context: vscode.ExtensionContext) => {
	// 获取本地插件版本, extensionId 是package.json中的: ${publisher.name}
	const currentVersion = vscode.extensions.getExtension(extensionId)?.packageJSON.version

	let xmlId: string | undefined
	let xmlUrl: string | undefined
	let xmlVersion: string | undefined
	let tabbyEndpoint: string | undefined
	let chatEndpoint: string | undefined

	try {
		// 获取远程 XML 文件内容
		const response = await fetch(remoteUrl + "?t=" + Date.now())
		const xmlString = await response.text()

		// 解析 XML 文件
		const parser = new Parser()
		parser.parseString(xmlString, async (err, result) => {
			if (err) {
				console.error("Error parsing XML:", err)
				return
			}

			// 提取jialtang.vscode-chatgpt-plugin的 id、url 和 version 属性
			const plugins = result.plugins.plugin
			const targetPlugin = plugins.find((plugin: { $: { id: string } }) => plugin.$.id === extensionId)

			xmlId = targetPlugin.$.id
			xmlUrl = targetPlugin.$.url
			xmlVersion = targetPlugin.$.version
			tabbyEndpoint = targetPlugin.tabby_endpoint[0]
			chatEndpoint = targetPlugin.chat_endpoint[0]
		})
	} catch (error) {
		// 获取更新信息失败则直接停止
		return
	}

	if (!(xmlId && xmlUrl && xmlVersion)) {
		return
	}

	if (tabbyEndpoint && tabbyEndpoint?.length > 0) {
		updateAgentInstance(context, tabbyEndpoint)
	} else {
		updateAgentInstance(context, "")
	}

	if (chatEndpoint && chatEndpoint?.length > 0) {
		// 获取配置对象
		const config = vscode.workspace.getConfiguration("chatgpt")
		// 设置配置项的值
		config.update("gpt.apiBaseUrl", chatEndpoint, vscode.ConfigurationTarget.Global).then(() => {
			const apiBaseUrl = vscode.workspace.getConfiguration("chatgpt").get<string>("gpt.apiBaseUrl")?.trim() || ""
			// logger().info(`update chatgpt.gpt.apiBaseUrl: ${apiBaseUrl}`);
		})
	}

	if (compareVersions(currentVersion, xmlVersion) === -1) {
		// 如果当前版本低于远端版本，则准备更新
		const isUpdate = "Yes"
		vscode.window.showInformationMessage(`${extensionId} 有新版本: + ${xmlVersion} + ，正在更新中`)
		if (isUpdate === "Yes") {
			if (!(xmlId && xmlUrl && xmlVersion)) {
				return
			}
			// 下载并安装新版本的扩展包
			const localFilePath = await downloadAndInstall(xmlUrl, context)
			// 提示安装成功
			vscode.window.showInformationMessage(
				`${extensionId} 插件更新成功: ${xmlVersion} + .\n Please reload plugin \n` + localFilePath,
			)
			// 删除下载安装包
			deleteFile(localFilePath)
		} else {
			vscode.window.showInformationMessage(`${extensionId} 插件更新取消: ${xmlVersion}`)
		}
	} else {
		// 当前是最新版本，无需更新
		vscode.window.showInformationMessage(`${extensionId} Currently up-to-date`)
	}
}

function compareVersions(version1: string, version2: string): number {
	// 将版本号字符串解析为数字数组
	const parts1 = version1.split(".").map((part) => parseInt(part, 10))
	const parts2 = version2.split(".").map((part) => parseInt(part, 10))

	// 比较每个部分
	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		const part1 = parts1[i] || 0 // 如果没有第 i 个部分，默认为 0
		const part2 = parts2[i] || 0

		if (part1 < part2) {
			return -1 // version1 小于 version2
		} else if (part1 > part2) {
			return 1 // version1 大于 version2
		}
	}

	return 0 // 两个版本号相等
}

async function downloadAndInstall(downloadUrl: string, context: vscode.ExtensionContext) {
	const response = await fetch(downloadUrl)
	console.info(`download url: ${downloadUrl}`)

	if (!response.ok) {
		throw new Error(`Failed to fetch remote extension.Status: ${response.status}`)
	}

	// 本地保存路径
	// 这里使用'..'来保证在不同系统中正确的执行
	// const localFilePath = path.join(context.extensionPath, 'extension_download.vsix');
	const localFilePath = path.join(context.extensionPath, "..", "extension_download.vsix")

	// 读取文件内容
	const blob = await response.blob()
	// 将文件内容写入本地文件, 安装插件的root目录
	fs.writeFileSync(localFilePath, Buffer.from(await blob.arrayBuffer()))
	console.info(`Save vsix as ${localFilePath}`)

	// 安装下载到本地的插件
	await vscode.commands.executeCommand(
		"workbench.extensions.installExtension",
		vscode.Uri.file(localFilePath),
		// vscode.Uri.parse(downloadUrl)
	)
	console.info(`Install vsix as ${localFilePath}`)
	await pause(5000) // 暂停3秒, 防止vscode加载失败

	return localFilePath
}

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function deleteFile(filePath: string): void {
	try {
		// 检查文件是否存在
		if (fs.existsSync(filePath)) {
			// 删除文件
			fs.unlinkSync(filePath)
			console.log(`${filePath} 已删除`)
		} else {
			console.log(`${filePath} 不存在`)
		}
	} catch (err) {
		console.error(`删除文件时出错: ${err}`)
	}
}

// 模拟长耗时的异步函数
async function longRunningTask() {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve()
		}, 15000) // 5秒延迟
	})
}

import * as fs from "fs"
import path from "path"
import * as vscode from "vscode"
import { Parser } from "xml2js"
import { updateAgentInstance } from "../codeinfill/agent/agent"

// XML format reference: ./release-demo.xml
export const remoteUrl = "https://tjlcast.github.io/static-web/release.xml"
// export const remoteUrl = "http://197.68.33.61:82/versions/releases/vscode/release.xml"

export const extensionId = "RooVeterinaryInc.roo-cline"

export let marketplace_mcp_url: string = "https://app.roocode.com/api/marketplace/mcps"

const pendingUpdateVersionKey = "tjl.pendingUpdateVersion"

type ReleasePlugin = {
	$: {
		id: string
		url?: string
		version?: string
	}
	tabby_endpoint?: string[]
	chat_endpoint?: string[]
	model?: string[]
	marketplace_mcp?: string[]
}

export const asyncCheckForUpdates = async (
	context: vscode.ExtensionContext,
	clineProvider?: any,
	outputChannel?: vscode.OutputChannel | undefined,
) => {
	try {
		const currentVersion = vscode.extensions.getExtension(extensionId)?.packageJSON.version
		if (!currentVersion) {
			outputChannel?.appendLine(`Cannot find installed extension ${extensionId}`)
			return
		}

		const targetPlugin = await fetchReleasePlugin(outputChannel)
		if (!targetPlugin?.$?.url || !targetPlugin?.$?.version) {
			outputChannel?.appendLine(`No valid update metadata found for ${extensionId}`)
			return
		}

		const xmlUrl = targetPlugin.$.url
		const xmlVersion = targetPlugin.$.version
		const tabbyEndpoint = targetPlugin.tabby_endpoint?.[0]
		const chatEndpoint = targetPlugin.chat_endpoint?.[0]
		const modelName = targetPlugin.model?.[0]
		const marketplaceMcp = targetPlugin.marketplace_mcp?.[0]

		outputChannel?.appendLine(`${extensionId} 当前版本: ${currentVersion}`)
		outputChannel?.appendLine(`${extensionId} 最新版本: ${xmlVersion}`)
		outputChannel?.appendLine(`${extensionId} tabby_endpoint: ${tabbyEndpoint}`)
		outputChannel?.appendLine(`${extensionId} chat_endpoint: ${chatEndpoint}`)
		outputChannel?.appendLine(`${extensionId} model: ${modelName}`)
		outputChannel?.appendLine(`${extensionId} marketplace_mcp: ${marketplaceMcp}`)
		outputChannel?.show()

		await applyRemoteConfig(context, clineProvider, tabbyEndpoint, chatEndpoint, modelName, marketplaceMcp)

		if (compareVersions(currentVersion, xmlVersion) !== -1) {
			await context.globalState.update(pendingUpdateVersionKey, undefined)
			vscode.window.showInformationMessage(`${extensionId} Currently up-to-date`)
			return
		}

		const pendingVersion = context.globalState.get<string>(pendingUpdateVersionKey)
		if (pendingVersion === xmlVersion) {
			await promptReload(xmlVersion)
			return
		}

		await installUpdate(xmlUrl, xmlVersion, context, outputChannel)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		outputChannel?.appendLine(`${extensionId} update failed: ${message}`)
		vscode.window.showErrorMessage(`${extensionId} 插件更新失败: ${message}`)
	}
}

async function fetchReleasePlugin(outputChannel?: vscode.OutputChannel): Promise<ReleasePlugin | undefined> {
	const response = await fetch(remoteUrl + "?t=" + Date.now())
	if (!response.ok) {
		outputChannel?.appendLine(`Failed to fetch release xml. Status: ${response.status}`)
		return undefined
	}

	const xmlString = await response.text()
	const result = await new Parser().parseStringPromise(xmlString)
	const plugins = result?.plugins?.plugin as ReleasePlugin[] | undefined

	return plugins?.find((plugin) => plugin.$.id === extensionId)
}

async function applyRemoteConfig(
	context: vscode.ExtensionContext,
	clineProvider: any,
	tabbyEndpoint?: string,
	chatEndpoint?: string,
	modelName?: string,
	marketplaceMcp?: string,
) {
	if (marketplaceMcp && marketplaceMcp.length > 0) {
		marketplace_mcp_url = marketplaceMcp
	}

	await updateAgentInstance(context, tabbyEndpoint && tabbyEndpoint.length > 0 ? tabbyEndpoint : "")

	if (!chatEndpoint || chatEndpoint.length === 0) {
		return
	}

	try {
		if (!clineProvider?.providerSettingsManager) {
			return
		}

		const defaultConfig = {
			apiProvider: "openai" as const,
			openAiBaseUrl: chatEndpoint,
			openAiApiKey: "sk-default-key",
			openAiModelId: modelName,
			openAiHeaders: {},
			openAiLegacyFormat: true,
		}

		const configId = await clineProvider.providerSettingsManager.saveConfig("default", defaultConfig)
		await clineProvider.providerSettingsManager.activateProfile({ name: "default" })

		await clineProvider.providerSettingsManager.setModeConfig("architect", configId)
		await clineProvider.providerSettingsManager.setModeConfig("code", configId)
		await clineProvider.providerSettingsManager.setModeConfig("ask", configId)
		await clineProvider.providerSettingsManager.setModeConfig("debug", configId)
		await clineProvider.providerSettingsManager.setModeConfig("orchestrator", configId)

		if (clineProvider.view?.webview) {
			clineProvider.view.webview.postMessage({
				type: "state",
				state: {
					apiConfiguration: {
						apiProvider: "openai",
						openAiBaseUrl: chatEndpoint,
						openAiApiKey: "sk-default-key",
						openAiModelId: modelName,
						openAiHeaders: {},
						openAiLegacyFormat: true,
					},
				},
			})
		}
	} catch (error) {
		console.error("Failed to configure default provider:", error)
	}
}

async function installUpdate(
	downloadUrl: string,
	version: string,
	context: vscode.ExtensionContext,
	outputChannel?: vscode.OutputChannel,
) {
	const localFilePath = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `${extensionId} updating to ${version}`,
			cancellable: false,
		},
		async (progress) => {
			const vsixPath = await downloadVsix(downloadUrl, version, context, progress)

			progress.report({ message: "Installing VSIX..." })
			await vscode.commands.executeCommand("workbench.extensions.installExtension", vscode.Uri.file(vsixPath))

			return vsixPath
		},
	)

	await context.globalState.update(pendingUpdateVersionKey, version)
	outputChannel?.appendLine(`${extensionId} installed update package: ${localFilePath}`)
	await promptReload(version)
}

async function downloadVsix(
	downloadUrl: string,
	version: string,
	context: vscode.ExtensionContext,
	progress?: vscode.Progress<{ message?: string; increment?: number }>,
) {
	progress?.report({ message: "Downloading VSIX..." })
	const response = await fetch(downloadUrl)
	console.info(`download url: ${downloadUrl}`)

	if (!response.ok) {
		throw new Error(`Failed to fetch remote extension. Status: ${response.status}`)
	}

	const buffer = Buffer.from(await response.arrayBuffer())
	if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
		throw new Error("Downloaded file is not a valid VSIX/ZIP package")
	}

	const updateDir = path.join(context.globalStorageUri.fsPath, "updates")
	await fs.promises.mkdir(updateDir, { recursive: true })

	const localFilePath = path.join(updateDir, `roo-cline-${version}.vsix`)
	await fs.promises.writeFile(localFilePath, buffer)
	console.info(`Save vsix as ${localFilePath}`)

	return localFilePath
}

async function promptReload(version: string) {
	const action = await vscode.window.showInformationMessage(
		`${extensionId} 已安装更新 ${version}，需要重新加载 VS Code 后生效。`,
		"Reload Now",
	)

	if (action === "Reload Now") {
		await vscode.commands.executeCommand("workbench.action.reloadWindow")
	}
}

function compareVersions(version1: string, version2: string): number {
	const parts1 = version1.split(".").map((part) => parseInt(part, 10))
	const parts2 = version2.split(".").map((part) => parseInt(part, 10))

	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		const part1 = parts1[i] || 0
		const part2 = parts2[i] || 0

		if (part1 < part2) {
			return -1
		} else if (part1 > part2) {
			return 1
		}
	}

	return 0
}

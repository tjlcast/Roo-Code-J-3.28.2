import { ExtensionContext } from "vscode"
import { defaultAgentConfig, PartialAgentConfig } from "./AgentConfig"
import { DataStore } from "./dataStore"
import { TabbyAgent } from "./TabbyAgent"

let instance: TabbyAgent | undefined = undefined
export function agent(): TabbyAgent {
	if (!instance) {
		throw new Error("Tabby Agent not initialized")
	}
	return instance
}

export type AbortSignalOption = { signal: AbortSignal }

type ClientProperties = Partial<{
	user: Record<string, any>
	session: Record<string, any>
}>

import { logger } from "../logger"
import type { Logger } from "./logger"

export type AgentInitOptions = Partial<{
	config: PartialAgentConfig
	clientProperties: ClientProperties
	dataStore: DataStore
	loggers: Logger[]
}>

function buildInitOptions(context: ExtensionContext): AgentInitOptions {
	const config: PartialAgentConfig = {}
	return {
		config,
		clientProperties: {
			user: {
				id: context.globalState.get("userId"),
			},
		},
	}
}

/**
 * 此函数用于更新 TabbyAgent 实例，确保其与给定的 endpoint 一致。
 * 如果已经存在一个与新 endpoint 相同的实例，则直接返回该实例。
 * 否则，将创建一个新的 TabbyAgent 实例，并使用给定的 ExtensionContext 初始化它。
 * @param {ExtensionContext} context - 扩展上下文，用于初始化 Agent 实例。
 * @param {string} endpoint - 要设置的服务器端点。
 * @returns {Promise<TabbyAgent>} 一个 Promise，解析为一个初始化后的 TabbyAgent 实例。
 */
export async function updateAgentInstance(context: ExtensionContext, endpoint: string): Promise<TabbyAgent> {
	if (defaultAgentConfig.server.endpoint === endpoint && instance) {
		const log = logger()
		log.info(`Endpoint is same as default config: ${endpoint}.`)
		return instance
	}
	defaultAgentConfig.server.endpoint = endpoint
	logger().info(`Update tabby agent vi endpoint: ${endpoint}.`)
	instance = new TabbyAgent()
	const initPromise = instance.initialize(buildInitOptions(context))
	return instance
}

export async function createAgentInstance(context: ExtensionContext): Promise<TabbyAgent> {
	if (!instance) {
		const agent = new TabbyAgent()
		const initPromise = agent.initialize(buildInitOptions(context))
		//   workspace.onDidChangeConfiguration(async (event) => {
		//     await initPromise;
		//     const configuration = workspace.getConfiguration("tabby");
		//     if (event.affectsConfiguration("tabby.api.endpoint")) {
		//       const endpoint = configuration.get<string>("api.endpoint");
		//       if (endpoint && endpoint.trim().length > 0) {
		//         agent.updateConfig("server.endpoint", endpoint);
		//       } else {
		//         agent.clearConfig("server.endpoint");
		//       }
		//     }
		//     if (event.affectsConfiguration("tabby.usage.anonymousUsageTracking")) {
		//       const anonymousUsageTrackingDisabled = configuration.get<boolean>("usage.anonymousUsageTracking", false);
		//       if (anonymousUsageTrackingDisabled) {
		//         agent.updateConfig("anonymousUsageTracking.disable", true);
		//       } else {
		//         agent.clearConfig("anonymousUsageTracking.disable");
		//       }
		//     }
		//     if (event.affectsConfiguration("tabby.inlineCompletion.triggerMode")) {
		//       const triggerMode = configuration.get<string>("inlineCompletion.triggerMode", "automatic");
		//       agent.updateClientProperties("user", "vscode.triggerMode", triggerMode);
		//     }
		//     if (event.affectsConfiguration("tabby.keybindings")) {
		//       const keybindings = configuration.get<string>("keybindings", "vscode-style");
		//       agent.updateClientProperties("user", "vscode.keybindings", keybindings);
		//     }
		//   });
		//   instance = agent;
		instance = agent
	}
	return instance
}

export async function disposeAgentInstance(): Promise<void> {
	if (instance) {
		await instance.finalize()
		instance = undefined
	}
}

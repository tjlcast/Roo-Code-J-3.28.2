import axios from "axios"
import * as yaml from "yaml"
import { z } from "zod"
import { getRooCodeApiUrl } from "@roo-code/cloud"
import type { MarketplaceItem, MarketplaceItemType } from "@roo-code/types"
import { modeMarketplaceItemSchema, mcpMarketplaceItemSchema } from "@roo-code/types"
import * as vscode from "vscode"
import { getOutputChannel } from "../../extension"
import { marketplace_mcp_url } from "../../tjl/upgrade/update-plugin"

// Response schemas for YAML API responses
const modeMarketplaceResponse = z.object({
	items: z.array(modeMarketplaceItemSchema),
})

const mcpMarketplaceResponse = z.object({
	items: z.array(mcpMarketplaceItemSchema),
})

export class RemoteConfigLoader {
	private apiBaseUrl: string
	private cache: Map<string, { data: MarketplaceItem[]; timestamp: number }> = new Map()
	private cacheDuration = 5 * 60 * 1000 // 5 minutes

	constructor() {
		this.apiBaseUrl = getRooCodeApiUrl()
	}

	async loadAllItems(hideMarketplaceMcps = false): Promise<MarketplaceItem[]> {
		const items: MarketplaceItem[] = []

		// tjl
		// const modesPromise = this.fetchModes()
		// const mcpsPromise = hideMarketplaceMcps ? Promise.resolve([]) : this.fetchMcps()
		// const [modes, mcps] = await Promise.all([modesPromise, mcpsPromise])
		// items.push(...modes, ...mcps)

		// Closing marketplace modes for now
		const mcpsPromise = this.fetchMcps()
		const [mcps] = await Promise.all([mcpsPromise])
		items.push(...mcps)

		return items
	}

	private async fetchModes(): Promise<MarketplaceItem[]> {
		const cacheKey = "modes"
		const cached = this.getFromCache(cacheKey)
		if (cached) return cached

		const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/modes`)

		// Parse and validate YAML response
		const yamlData = yaml.parse(data)
		const validated = modeMarketplaceResponse.parse(yamlData)

		const items: MarketplaceItem[] = validated.items.map((item) => ({
			type: "mode" as const,
			...item,
		}))

		this.setCache(cacheKey, items)
		return items
	}

	private async fetchMcps(): Promise<MarketplaceItem[]> {
		try {
			const cacheKey = "mcps"
			const cached = this.getFromCache(cacheKey)
			if (cached) return cached

			// 获取全局配置中的 marketplace_mcp 值
			// tjl
			const marketplaceMcpUrl =
				marketplace_mcp_url || "https://tjlcast.github.io/static-web/marketplace-mcps.yaml"
			getOutputChannel().appendLine(`Using marketplace_mcp: ${marketplaceMcpUrl}`)
			const data = await this.fetchWithRetry<string>(`${marketplaceMcpUrl}`)
			// "https://app.roocode.com/api/marketplace/mcps"
			// const data = await this.fetchWithRetry<string>(`${this.apiBaseUrl}/api/marketplace/mcps`)

			// Parse and validate YAML response
			const yamlData = yaml.parse(data)
			const validated = mcpMarketplaceResponse.parse(yamlData)

			const items: MarketplaceItem[] = validated.items.map((item) => ({
				type: "mcp" as const,
				...item,
			}))

			this.setCache(cacheKey, items)
			return items
		} catch (error) {
			await vscode.window.showErrorMessage(`Failed to load MCPs from ${marketplace_mcp_url}: ${error}`)
			return []
		}
	}

	private async fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
		let lastError: Error

		for (let i = 0; i < maxRetries; i++) {
			try {
				const response = await axios.get(url, {
					timeout: 10000, // 10 second timeout
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
					},
				})
				return response.data as T
			} catch (error) {
				lastError = error as Error
				if (i < maxRetries - 1) {
					// Exponential backoff: 1s, 2s, 4s
					const delay = Math.pow(2, i) * 1000
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw lastError!
	}

	async getItem(id: string, type: MarketplaceItemType): Promise<MarketplaceItem | null> {
		const items = await this.loadAllItems()
		return items.find((item) => item.id === id && item.type === type) || null
	}

	private getFromCache(key: string): MarketplaceItem[] | null {
		const cached = this.cache.get(key)
		if (!cached) return null

		const now = Date.now()
		if (now - cached.timestamp > this.cacheDuration) {
			this.cache.delete(key)
			return null
		}

		return cached.data
	}

	private setCache(key: string, data: MarketplaceItem[]): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
		})
	}

	clearCache(): void {
		this.cache.clear()
	}
}

import createClient from "openapi-fetch"
import { v4 as uuid } from "uuid"
import { CompletionRequest, CompletionResponse } from "../TabbyCompletionContext"
import { Auth } from "../auth"
import { logger } from "../logger"
import type { paths as TabbyApi } from "../types/tabbyApi"
import { AgentConfig, defaultAgentConfig } from "./AgentConfig"
import { CompletionCache } from "./CompletionCache"
import { CompletionContext } from "./CompletionContext"
import { CompletionDebounce } from "./CompletionDebounce"
import { CompletionProviderStats, CompletionProviderStatsEntry } from "./CompletionProviderStats"
import { AgentInitOptions } from "./agent"
import { postCacheProcess, preCacheProcess } from "./postprocess"
import { abortSignalFromAnyOf, isBlank, isCanceledError, isTimeoutError } from "./utils"

export type AgentStatus = "notInitialized" | "ready" | "disconnected" | "unauthorized" | "finalized"

export class TabbyAgent {
	private readonly logger = logger()
	private config: AgentConfig = defaultAgentConfig
	private nonParallelProvideCompletionAbortController?: AbortController
	private completionCache = new CompletionCache()
	private completionDebounce = new CompletionDebounce()
	private completionProviderStats = new CompletionProviderStats()
	private status: AgentStatus = "notInitialized"
	private auth?: Auth
	private api?: ReturnType<typeof createClient<TabbyApi>>

	constructor() {
		this.api = createClient<TabbyApi>({
			baseUrl: this.config.server.endpoint.replace(/\/+$/, ""), // remove trailing slash
			headers: {
				Authorization: this.config.server.token,
				...this.config.server.requestHeaders,
			},
		})
	}

	public async provideCompletion(
		request: CompletionRequest,
		options?: { signal: AbortSignal },
	): Promise<CompletionResponse> {
		this.logger.info("Call provideCompletions")
		if (this.nonParallelProvideCompletionAbortController) {
			this.nonParallelProvideCompletionAbortController.abort()
		}
		this.nonParallelProvideCompletionAbortController = new AbortController()
		const signal = abortSignalFromAnyOf([this.nonParallelProvideCompletionAbortController.signal, options?.signal])

		let completionResponse: CompletionResponse
		let stats: CompletionProviderStatsEntry | undefined = {
			triggerMode: request.manually ? "manual" : "auto",
			cacheHit: false,
			aborted: false,
			requestSent: false,
			requestLatency: 0,
			requestCanceled: false,
			requestTimeout: false,
		}
		let requestStartedAt: number | undefined

		const context = new CompletionContext(request)
		try {
			if (this.completionCache.has(context)) {
				// Cache hit
				stats.cacheHit = true
				await this.completionDebounce.debounce(
					{
						request,
						config: this.config.completion.debounce,
						responseTime: 0,
					},
					{ signal },
				)

				completionResponse = this.completionCache.get(context)!
			} else {
				// Cache miss
				const segments = this.createSegments(context)

				if (isBlank(segments.prefix)) {
					// Empty prompt
					this.logger.debug("Segment prefix is blank, returning empty completion response")
					completionResponse = {
						id: "agent-" + uuid(),
						choices: [],
					}
				} else {
					// Debounce before sending request
					await this.completionDebounce.debounce(
						{
							request,
							config: this.config.completion.debounce,
							responseTime: this.completionProviderStats.windowed().stats.averageResponseTime,
						},
						options,
					)

					// Send http request
					const requestId = uuid()
					stats.requestSent = true
					requestStartedAt = performance.now()
					try {
						if (!this.api) {
							throw new Error("http client not initialized")
						}
						const requestPath = "/v1/completions"
						// const newAbortController = new AbortController();
						const requestOptions = {
							body: {
								language: request.language,
								segments,
								user: this.auth?.user,
							},
							signal: this.createAbortSignal({ signal }),
							// signal: newAbortController.signal,
						}
						this.logger.info(
							"Completion request",
							JSON.stringify({
								requestId,
								requestOptions,
								url: this.config.server.endpoint + requestPath,
							}),
						)
						// const response = await this.api.POST(requestPath, requestOptions);
						const response = await fetchPostData(requestPath, requestOptions)
						// if (response.error || !response.response.ok) {
						//   throw new HttpError(response.response);
						// }
						const responseData = await response.json()
						this.logger.info("Completion response", JSON.stringify({ requestId, responseData }))
						stats.requestLatency = performance.now() - requestStartedAt
						completionResponse = {
							id: responseData.id,
							choices: responseData.choices.map((choice: { index: any; text: any }) => {
								return {
									index: choice.index,
									text: choice.text,
									replaceRange: {
										start: request.position,
										end: request.position,
									},
								}
							}),
						}
					} catch (error) {
						if (isCanceledError(error)) {
							this.logger.debug("Completion request canceled")
							stats.requestCanceled = true
							stats.requestLatency = performance.now() - requestStartedAt
						} else if (isTimeoutError(error)) {
							this.logger.debug("Completion request timeout")
							stats.requestTimeout = true
							stats.requestLatency = NaN
						} else {
							this.logger.error("Completion request failed with unknown error")
							// schedule a health check
							this.healthCheck()
						}
						// rethrow error
						throw error
					}
					// Postprocess (pre-cache)
					completionResponse = await preCacheProcess(context, this.config.postprocess, completionResponse)
					if (signal.aborted) {
						throw signal.reason
					}
					// Build cache
					this.completionCache.buildCache(context, JSON.parse(JSON.stringify(completionResponse)))
				}
			}
			// Postprocess (post-cache)
			completionResponse = await postCacheProcess(context, this.config.postprocess, completionResponse)
			if (signal.aborted) {
				throw signal.reason
			}
		} catch (error) {
			if (isCanceledError(error) || isTimeoutError(error)) {
				if (stats) {
					stats.aborted = true
				}
			} else {
				// unexpected error
				stats = undefined
			}
			// rethrow error
			throw error
		} finally {
			if (stats) {
				this.completionProviderStats.add(stats)

				if (stats.requestSent && !stats.requestCanceled) {
					const windowedStats = this.completionProviderStats.windowed()
					const checkResult = this.completionProviderStats.check(windowedStats)
					switch (checkResult) {
						case "healthy":
							this.popIssue("slowCompletionResponseTime")
							this.popIssue("highCompletionTimeoutRate")
							break
						case "highTimeoutRate":
							this.popIssue("slowCompletionResponseTime")
							this.pushIssue("highCompletionTimeoutRate")
							break
						case "slowResponseTime":
							this.popIssue("highCompletionTimeoutRate")
							this.pushIssue("slowCompletionResponseTime")
							break
					}
				}
			}
		}
		this.logger.trace("Return from provideCompletions", { context, completionResponse })
		return completionResponse
	}

	private createSegments(context: CompletionContext): {
		prefix: string
		suffix: string
		clipboard?: string
	} {
		// max lines in prefix and suffix configurable
		const maxPrefixLines = this.config.completion.prompt.maxPrefixLines
		const maxSuffixLines = this.config.completion.prompt.maxSuffixLines
		const { prefixLines, suffixLines } = context
		const prefix = prefixLines.slice(Math.max(prefixLines.length - maxPrefixLines, 0)).join("")
		let suffix
		if (this.config.completion.prompt.experimentalStripAutoClosingCharacters && context.mode !== "fill-in-line") {
			suffix = "\n" + suffixLines.slice(1, maxSuffixLines).join("")
		} else {
			suffix = suffixLines.slice(0, maxSuffixLines).join("")
		}

		let clipboard = undefined
		const clipboardConfig = this.config.completion.prompt.clipboard
		if (
			context.clipboard.length >= clipboardConfig.maxChars &&
			context.clipboard.length <= clipboardConfig.maxChars
		) {
			clipboard = context.clipboard
		}

		return { prefix, suffix, clipboard }
	}

	private createAbortSignal(options?: { signal?: AbortSignal; timeout?: number }): AbortSignal {
		const timeout = Math.min(0x7fffffff, options?.timeout || this.config.server.requestTimeout)

		const controller = new AbortController()

		// 如果设置了超时时间，创建一个超时的定时器
		if (timeout) {
			const timeoutId = setTimeout(() => controller.abort(), timeout)

			// 清理定时器，以防止在实际取消时它仍然在运行
			const originalSignal = options?.signal
			if (originalSignal) {
				originalSignal.addEventListener("abort", () => clearTimeout(timeoutId))
			}
		}

		// 如果原始信号存在并且已经被中止，则也中止新的信号
		if (options?.signal) {
			options.signal.addEventListener("abort", () => controller.abort())
		}

		return controller.signal
	}

	// private createAbortSignal(options?: { signal?: AbortSignal; timeout?: number; }): AbortSignal {
	//   const timeout = Math.min(0x7fffffff, options?.timeout || this.config.server.requestTimeout);
	//   return abortSignalFromAnyOf([AbortSignal.timeout(timeout), options?.signal]);
	// }

	private async healthCheck(options?: { signal?: AbortSignal; method?: "GET" | "POST" }): Promise<void> {
		getHealthStatus(defaultAgentConfig.server.endpoint + "/v1/health").catch((error) => {
			logger().error(`${error.message}`)
		})
		return
	}

	private pushIssue(issue: string) {
		// todo
	}

	private popIssue(issue: string) {
		// todo
	}

	public async initialize(options: AgentInitOptions): Promise<boolean> {
		// todo
		return true
	}

	public async finalize(): Promise<boolean> {
		if (this.status === "finalized") {
			return false
		}

		// await this.submitStats();

		// if (this.tryingConnectTimer) {
		//     clearInterval(this.tryingConnectTimer);
		// }
		// if (this.submitStatsTimer) {
		//     clearInterval(this.submitStatsTimer);
		// }
		// this.changeStatus("finalized");
		return true
	}
}

/**
 * 
 * @param requestPath 
 * @param requestOptions {
              body: {
                language: request.language,
                segments,
                user: this.auth?.user,
              },
              signal: this.createAbortSignal({ signal }),
            }
 * @returns 
 */
async function fetchPostData(requestPath: string, requestOptions: any): Promise<any> {
	try {
		const url = defaultAgentConfig.server.endpoint + requestPath
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer auth_fac3c00c936945a4a28f1bc6d1007111",
			},
			body: JSON.stringify(requestOptions.body),
			signal: requestOptions.signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`)
		}
		return response
	} catch (error) {
		// 更精确地处理中止错误
		if (error instanceof Error && error.name === "AbortError") {
			logger().debug("Request was aborted:", error.message)
			// 这是预期行为，不需要特殊处理
			throw error
		}
		logger().error(`Fetch post error: ${JSON.stringify(error)}`)
		throw error
	}
}

async function getHealthStatus(url: string, method: "GET" | "POST" = "GET"): Promise<any> {
	try {
		const response = await fetch(url, {
			method: method,
		})

		if (!response.ok) {
			throw new Error(`${response.status}`)
		}

		const data = await response.json()
		return data
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Unhealth ${defaultAgentConfig.server.endpoint} error! Status: ${error.message}`)
		} else {
			throw new Error(`Unhealth ${defaultAgentConfig.server.endpoint} error! Status: Unknown error`)
		}
	}
}

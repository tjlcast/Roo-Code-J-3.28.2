import { CompletionRequest } from "../TabbyCompletionContext"
import { AgentConfig } from "./AgentConfig"
import { AbortSignalOption } from "./agent"
import { splitLines } from "./utils"

function clamp(min: number, max: number, value: number): number {
	return Math.max(min, Math.min(max, value))
}

export class CompletionDebounce {
	private lastCalledTimeStamp = 0
	private baseInteral = 200 // ms
	private calledIntervalHistory: number[] = []

	private options = {
		baseIntervalSlideWindowAvg: {
			minSize: 20,
			maxSize: 100,
			min: 100,
			max: 400,
		},
		adaptiveRate: {
			min: 1.5,
			max: 3.0,
		},
		contextScoreWeights: {
			triggerCharacter: 0.5,
			noSuffixInCurrentLine: 0.4,
			noSuffix: 0.1,
		},
		requestDelay: {
			min: 100, // ms
			max: 1000, // ms
		},
	}

	/**
	 * 该函数是一个异步的防抖函数，
	 * 通过接收一个包含请求、配置和响应时间的对象
	 * 以及可选的中断信号选项作为参数来控制请求的延迟发送。
	 * @param context
	 * @param options
	 * @returns
	 */
	async debounce(
		context: {
			request: CompletionRequest
			config: AgentConfig["completion"]["debounce"]
			responseTime: number
		},
		options?: AbortSignalOption,
	): Promise<void> {
		const { request, config, responseTime } = context
		// 根据配置的不同模式，函数将采用不同的延迟策略：如果是手动触发的请求，则立即返回
		if (request.manually) {
			return this.sleep(0, options)
		}
		// 如果是固定模式，则按照配置的间隔进行延迟；
		if (config.mode === "fixed") {
			return this.sleep(config.interval, options)
		}

		const now = Date.now()
		this.updateBaseInterval(now - this.lastCalledTimeStamp)
		this.lastCalledTimeStamp = now

		// 如果是自适应模式，则根据请求上下文的评分和配置的自适应率计算期望延迟时间，
		// 并结合实际响应时间进行调整，最终执行延迟后返回。
		const contextScore = this.calcContextScore(request)
		const adaptiveRate =
			this.options.adaptiveRate.max -
			(this.options.adaptiveRate.max - this.options.adaptiveRate.min) * contextScore
		const expectedLatency = adaptiveRate * this.baseInteral
		const delay = clamp(
			this.options.requestDelay.min,
			this.options.requestDelay.max,
			expectedLatency - responseTime,
		)
		return this.sleep(delay, options)
	}

	/**
	 * 此函数接收一个CompletionRequest对象作为参数，
	 * 基于其中的文本信息（触发字符、后缀及当前行后缀）与预定义权重计算上下文得分
	 * @param request
	 * @returns
	 */
	// return score in [0, 1],
	// 1 means the context has a high chance to accept the completion
	private calcContextScore(request: CompletionRequest): number {
		let score = 0
		const weights = this.options.contextScoreWeights
		const triggerCharacter = request.text[request.position - 1] ?? ""
		score += triggerCharacter.match(/^\W*$/) ? weights.triggerCharacter : 0

		const suffix = request.text.slice(request.position) ?? ""
		const currentLineInSuffix = splitLines(suffix)[0] ?? ""
		score += currentLineInSuffix.match(/^\W*$/) ? weights.noSuffixInCurrentLine : 0
		score += suffix.match(/^\W*$/) ? weights.noSuffix : 0

		score = clamp(0, 1, score)
		return score
	}

	/**
	 * 该函数接收一个interval参数，用于更新基础间隔。
	 * @param interval 新的基础时间间隔
	 * @returns
	 */
	private updateBaseInterval(interval: number) {
		// 首先检查interval是否超过预设最大值，是则直接返回
		if (interval > this.options.baseIntervalSlideWindowAvg.max) {
			return
		}

		// 将interval加入历史记录数组，若数组过长则删除最早一项
		this.calledIntervalHistory.push(interval)
		if (this.calledIntervalHistory.length > this.options.baseIntervalSlideWindowAvg.maxSize) {
			this.calledIntervalHistory.shift()
		}
		// 当数组长度满足条件时，计算历史时间间隔的平均值并以此更新baseInteral，同时确保其在预设最小值与最大值范围内。
		if (this.calledIntervalHistory.length > this.options.baseIntervalSlideWindowAvg.minSize) {
			const avg = this.calledIntervalHistory.reduce((a, b) => a + b, 0) / this.calledIntervalHistory.length
			this.baseInteral = clamp(
				this.options.baseIntervalSlideWindowAvg.min,
				this.options.baseIntervalSlideWindowAvg.max,
				avg,
			)
		}
	}

	/**
	 * 该函数实现了一个异步延时功能，接收延迟时间（毫秒）及可选的AbortSignal选项。
	 * 如果参数AbortSignal结束也关闭当前延时器。
	 * @param delay
	 * @param options
	 * @returns
	 */
	private async sleep(delay: number, options?: AbortSignalOption): Promise<void> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(resolve, Math.min(delay, 0x7fffffff))
			if (options?.signal) {
				if (options.signal.aborted) {
					clearTimeout(timer)
					reject(options.signal.reason)
				} else {
					options.signal.addEventListener("abort", () => {
						clearTimeout(timer)
						reject(options.signal.reason)
					})
				}
			}
		})
	}
}

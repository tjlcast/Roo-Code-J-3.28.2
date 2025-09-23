import { Univariate } from "stats-logscale"

export type CompletionProviderStatsEntry = {
	triggerMode: "auto" | "manual"
	cacheHit: boolean
	aborted: boolean
	requestSent: boolean
	requestLatency: number // ms, NaN if timeout
	requestCanceled: boolean
	requestTimeout: boolean
}

class Average {
	private sum = 0
	private quantity = 0

	add(value: number): void {
		this.sum += value
		this.quantity += 1
	}

	mean(): number | undefined {
		if (this.quantity === 0) {
			return undefined
		}
		return this.sum / this.quantity
	}

	count(): number {
		return this.quantity
	}
}

type WindowedStats = {
	values: number[]
	stats: { total: number; timeouts: number; responses: number; averageResponseTime: number }
}

class Windowed {
	private readonly maxSize: number
	private readonly values: number[] = []

	constructor(maxSize: number) {
		this.maxSize = maxSize
	}

	add(value: number): void {
		this.values.push(value)
		if (this.values.length > this.maxSize) {
			this.values.shift()
		}
	}

	getValues(): number[] {
		return this.values
	}
}

export class CompletionProviderStats {
	private config = {
		windowSize: 10,
		checks: {
			disable: false,
			// Mark status as healthy if the latency is less than the threshold for each latest windowSize requests.
			healthy: { windowSize: 1, latency: 3000 },
			// If there is at least {count} requests, and the average response time is higher than the {latency}, show warning
			slowResponseTime: { latency: 5000, count: 1 },
			// If there is at least {count} timeouts, and the timeout rate is higher than the {rate}, show warning
			highTimeoutRate: { rate: 0.5, count: 1 },
		},
	}

	private autoCompletionCount = 0
	private manualCompletionCount = 0
	private cacheHitCount = 0
	private cacheMissCount = 0

	private eventMap = new Map<string, number>()

	private completionRequestLatencyStats = new Univariate()
	private completionRequestCanceledStats = new Average()
	private completionRequestTimeoutCount = 0

	private recentCompletionRequestLatencies: Windowed = new Windowed(this.config.windowSize)

	add(value: CompletionProviderStatsEntry): void {
		const { triggerMode, cacheHit, aborted, requestSent, requestLatency, requestCanceled, requestTimeout } = value
		if (!aborted) {
			if (triggerMode === "auto") {
				this.autoCompletionCount += 1
			} else {
				this.manualCompletionCount += 1
			}
			if (cacheHit) {
				this.cacheHitCount += 1
			} else {
				this.cacheMissCount += 1
			}
		}
		if (requestSent) {
			if (requestCanceled) {
				this.completionRequestCanceledStats.add(requestLatency)
			} else if (requestTimeout) {
				this.completionRequestTimeoutCount += 1
			} else {
				this.completionRequestLatencyStats.add(requestLatency)
			}
			if (!requestCanceled) {
				this.recentCompletionRequestLatencies.add(requestLatency)
			}
		}
	}

	// stats for "highTimeoutRate" | "slowResponseTime" warning
	windowed(): WindowedStats {
		const latencies = this.recentCompletionRequestLatencies.getValues()
		const timeouts = latencies.filter((latency) => Number.isNaN(latency))
		const responses = latencies.filter((latency) => !Number.isNaN(latency))
		const averageResponseTime = responses.reduce((acc, latency) => acc + latency, 0) / responses.length
		return {
			values: latencies,
			stats: {
				total: latencies.length,
				timeouts: timeouts.length,
				responses: responses.length,
				averageResponseTime,
			},
		}
	}

	check(windowed: WindowedStats): "healthy" | "highTimeoutRate" | "slowResponseTime" | null {
		if (this.config.checks.disable) {
			return null
		}
		const config = this.config.checks

		const {
			values: latencies,
			stats: { total, timeouts, responses, averageResponseTime },
		} = windowed

		if (
			latencies
				.slice(-Math.min(this.config.windowSize, config.healthy.windowSize))
				.every((latency) => latency < config.healthy.latency)
		) {
			return "healthy"
		}
		if (timeouts / total > config.highTimeoutRate.rate && timeouts >= config.highTimeoutRate.count) {
			return "highTimeoutRate"
		}
		if (averageResponseTime > config.slowResponseTime.latency && responses >= config.slowResponseTime.count) {
			return "slowResponseTime"
		}
		return null
	}
}

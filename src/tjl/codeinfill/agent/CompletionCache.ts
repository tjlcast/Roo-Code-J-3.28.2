import { LRUCache } from "lru-cache"
import { logger } from "../logger"
import { CompletionResponse } from "../TabbyCompletionContext"
import { CompletionContext } from "./CompletionContext"
import { autoClosingPairs, findUnpairedAutoClosingChars, splitLines } from "./utils"

type CompletionCacheKey = CompletionContext
type CompletionCacheValue = CompletionResponse

export class CompletionCache {
	private readonly logger = logger()
	private options = {
		maxCount: 10000,
		prebuildCache: {
			enabled: true,
			perCharacter: {
				lines: 1,
				max: 50,
			},
			perLine: {
				max: 10,
			},
			autoClosingPairCheck: {
				max: 3,
			},
		},
	}
	private cache = new LRUCache<string, { value: CompletionCacheValue; rebuildFlag: boolean }>({
		max: this.options.maxCount,
	})

	has(key: CompletionCacheKey): boolean {
		return this.cache.has(key.hash)
	}

	get(key: CompletionCacheKey): CompletionCacheValue | undefined {
		const entry = this.cache.get(key.hash)
		if (entry?.rebuildFlag) {
			this.buildCache(key, entry?.value)
		}
		return entry?.value
	}

	buildCache(key: CompletionCacheKey, value: CompletionCacheValue): void {
		this.logger.debug("Starting to build cache key: ", JSON.stringify(key), " value: ", JSON.stringify(value))
		const entries = this.createCacheEntries(key, value)
		entries.forEach((entry) => {
			this.cache.set(entry.key.hash, {
				value: entry.value,
				rebuildFlag: entry.rebuildFlag,
			})
			this.logger.debug("Cache updated :", entries.length, " ", this.cache.size)
		})
	}

	/**
	 * 该函数用于创建缓存条目。
	 * 它接收一个CompletionCacheKey类型的键和一个CompletionCacheValue类型的值作为参数，
	 * 并返回一个对象数组，每个对象包含键、值和重建标志。
	 * @param key
	 * @param value
	 * @returns
	 */
	private createCacheEntries(
		key: CompletionCacheKey,
		value: CompletionCacheValue,
	): { key: CompletionCacheKey; value: CompletionCacheValue; rebuildFlag: boolean }[] {
		// 首先，将输入的键和值封装成一个对象，并设置重建标志为false，将其添加到一个列表中。
		const list = [{ key, value, rebuildFlag: false }]
		// 如果预构建缓存功能开启，则遍历值的选项，并根据选项的文本和位置进行一些处理。
		if (this.options.prebuildCache.enabled) {
			for (const choice of value.choices) {
				const completionText = choice.text.slice(key.position - choice.replaceRange.start)
				const perLinePositions = this.getPerLinePositions(completionText)
				this.logger.trace("Calculate per-line cache positions: ", completionText, " ", perLinePositions)
				for (const position of perLinePositions) {
					const completionTextPrefix = completionText.slice(0, position)
					const completionTextPrefixWithAutoClosedChars =
						this.generateAutoClosedPrefixes(completionTextPrefix)
					for (const prefix of [completionTextPrefix, ...completionTextPrefixWithAutoClosedChars]) {
						const entry = {
							key: new CompletionContext({
								...key,
								text: key.text.slice(0, key.position) + prefix + key.text.slice(key.position),
								position: key.position + position,
							}),
							value: {
								...value,
								choices: [
									{
										index: choice.index,
										text: completionText.slice(position),
										replaceRange: {
											start: key.position + position,
											end: key.position + position,
										},
									},
								],
							},
							rebuildFlag: true,
						}
						this.logger.trace(`Build pre-line cache entry prefix: ${prefix} entry: ${entry}`)
						list.push(entry)
					}
				}

				const perCharacterPositions = this.getPerCharacterPositions(completionText)
				this.logger.trace(
					`Calculate per-character cache positions: ${JSON.stringify({
						completionText,
						perCharacterPositions,
					})}`,
				)
				for (const position of perCharacterPositions) {
					let lineStart = position
					while (lineStart > 0 && completionText[lineStart - 1] !== "\n") {
						lineStart--
					}
					const completionTextPrefix = completionText.slice(0, position)
					const completionTextPrefixWithAutoClosedChars =
						this.generateAutoClosedPrefixes(completionTextPrefix)
					for (const prefix of [completionTextPrefix, ...completionTextPrefixWithAutoClosedChars]) {
						const entry = {
							key: new CompletionContext({
								...key,
								text: key.text.slice(0, key.position) + prefix + key.text.slice(key.position),
								position: key.position + position,
							}),
							value: {
								...value,
								choices: [
									{
										index: choice.index,
										text: completionText.slice(lineStart),
										replaceRange: {
											start: key.position + lineStart,
											end: key.position + position,
										},
									},
								],
							},
							rebuildFlag: false,
						}
						this.logger.trace(`Build per-character cache entry: ${JSON.stringify({ prefix, entry })}`)
						list.push(entry)
					}
				}
			}
		}
		// 使用reduce方法对列表进行迭代，将具有相同哈希值的键合并，将它们的选项合并，并设置重建标志为两个条目中较大的值。
		const result = list.reduce<typeof list>((prev, curr) => {
			const found = prev.find((entry) => entry.key.hash === curr.key.hash)
			if (found) {
				found.value.choices.push(...curr.value.choices)
				found.rebuildFlag = found.rebuildFlag || curr.rebuildFlag
			} else {
				prev.push(curr)
			}
			return prev
		}, [])
		// 使用reduce方法对列表进行迭代，将具有相同哈希值的键合并，将它们的选项合并，并设置重建标志为两个条目中较大的值。
		return result
	}

	/**
	 * 该函数用于获取每一行的结束位置、
	 * 下一行的开始位置和下一行经过缩进后的开始位置，返回一个数字数组
	 * @param completion
	 * @returns
	 */
	// positions for every line end (before newline character) and line begin (after indent)
	private getPerLinePositions(completion: string): number[] {
		const result: number[] = []
		const option = this.options.prebuildCache
		const lines = splitLines(completion)
		let index = 0
		let offset = 0

		// `index < lines.length - 1` to exclude the last line
		while (index < lines.length - 1 && index < option.perLine.max) {
			offset += lines[index]?.length ?? 0
			result.push(offset - 1) // cache at the end of the line (before newline character)
			result.push(offset) // cache at the beginning of the next line
			let offsetNextLineBegin = offset
			while (offsetNextLineBegin < completion.length && completion[offsetNextLineBegin]!.match(/\s/)) {
				offsetNextLineBegin++
			}
			result.push(offsetNextLineBegin) // cache at the beginning of the next line (after indent)
			index++
		}
		return result
	}

	// FIXME: add unit tests
	// "function(" => ["function()"]
	// "call([" => ["call([]", "call([])" ]
	// "function(arg" => ["function(arg)" ]
	private generateAutoClosedPrefixes(prefix: string): string[] {
		const result: string[] = []
		const unpaired = findUnpairedAutoClosingChars(prefix)
		let checkIndex = 0
		let autoClosing = ""

		while (checkIndex < unpaired.length && checkIndex < this.options.prebuildCache.autoClosingPairCheck.max) {
			autoClosingPairs
				.filter((pair) => {
					let pattern
					if ("open" in pair) {
						pattern = pair.open
					} else {
						pattern = pair.openOrClose
					}
					return pattern.chars === unpaired[unpaired.length - 1 - checkIndex]
				})
				.forEach((pair) => {
					let pattern
					if ("close" in pair) {
						pattern = pair.close
					} else {
						pattern = pair.openOrClose
					}
					autoClosing += pattern.chars
					result.push(prefix + autoClosing)
				})
			checkIndex++
		}
		return result
	}

	// positions for every character in the leading lines
	private getPerCharacterPositions(completion: string): number[] {
		const result: number[] = []
		const option = this.options.prebuildCache
		const text = splitLines(completion).slice(0, option.perCharacter.lines).join("")
		let offset = 0
		while (offset < text.length && offset < option.perCharacter.max) {
			result.push(offset)
			offset++
		}
		return result
	}
}

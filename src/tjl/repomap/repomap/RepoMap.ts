import fs from "fs"
import path from "path"
import { Parser } from "web-tree-sitter"
import { MultiDiGraph } from "../pagerank/pagerankMulti"
import { TreeCtx } from "../grep_ast/treeCtx"
import { loadLanguage } from "../grep_ast/lang"
// 由于模块导出问题，我们稍后将通过其他方式访问TreeCtx

let IS_DEBUG = false
export function setDebug(debug: boolean) {
	IS_DEBUG = debug
}

interface Tag {
	rel_fname: string
	fname: string
	line: number
	name: string
	kind: "def" | "ref"
}

interface CacheEntry {
	mtime: number
	data: Tag[]
}

export class RepoMap {
	private TAGS_CACHE_DIR = ".aider.tags.cache.v4"
	private warned_files = new Set<string>()
	private TAGS_CACHE: Map<string, CacheEntry> = new Map()
	private tree_cache: Map<string, string> = new Map()
	private tree_context_cache: Map<string, { context: any; mtime: number }> = new Map()
	private map_cache: Map<string, string> = new Map()
	private map_processing_time = 0
	private last_map: string | null = null
	private max_map_tokens: number
	private root: string
	private verbose: boolean
	max_context_window: number | null = null

	constructor(
		options: {
			map_tokens?: number
			root?: string
			verbose?: boolean
		} = {},
	) {
		this.max_map_tokens = options.map_tokens || 1024
		this.root = options.root || process.cwd()
		this.verbose = options.verbose || false

		this.load_tags_cache()
	}

	private load_tags_cache(): void {
		// In TypeScript implementation, we'll use a simple Map for caching
		// For persistent caching, we could implement file-based caching later
		this.TAGS_CACHE = new Map()
	}

	private get_mtime(fname: string): number | null {
		try {
			const stat = fs.statSync(fname)
			return stat.mtimeMs
		} catch (error) {
			if (this.verbose) {
				console.warn(`File not found error: ${fname}`)
			}
			return null
		}
	}

	private get_rel_fname(fname: string): string {
		try {
			return path.relative(this.root, fname)
		} catch (error) {
			// Issue #1288: ValueError: path is on mount 'C:', start on mount 'D:'
			// Just return the full fname.
			return fname
		}
	}

	public async get_repo_map(
		chat_files: string[],
		other_files: string[],
		mentioned_fnames: Set<string> = new Set(),
		mentioned_idents: Set<string> = new Set(),
	): Promise<string | undefined> {
		if (this.max_map_tokens <= 0) {
			return undefined
		}

		if (!other_files.length) {
			return undefined
		}

		let max_map_tokens = this.max_map_tokens

		// With no files in the chat, give a bigger view of the entire repo
		const padding = 4096
		let target = 0
		if (max_map_tokens && this.max_context_window) {
			target = Math.min(
				Math.floor(max_map_tokens * 8), // map_mul_no_files defaults to 8 in Python
				this.max_context_window - padding,
			)
		}

		if (!chat_files.length && this.max_context_window && target > 0) {
			max_map_tokens = target
		}

		try {
			const files_listing = await this.get_ranked_tags_map(
				chat_files,
				other_files,
				max_map_tokens,
				mentioned_fnames,
				mentioned_idents,
			)

			return files_listing
		} catch (error) {
			if (error instanceof RangeError && error.message.includes("Maximum call stack size exceeded")) {
				console.error("Disabling repo map, git repo too large?")
				this.max_map_tokens = 0
				return undefined
			}
			throw error
		}
	}

	private async get_ranked_tags_map(
		chat_fnames: string[],
		other_fnames: string[],
		max_map_tokens: number,
		mentioned_fnames: Set<string>,
		mentioned_idents: Set<string>,
	): Promise<string> {
		// Create a cache key
		const cache_key_parts = [
			JSON.stringify(chat_fnames.sort()),
			JSON.stringify(other_fnames.sort()),
			max_map_tokens,
			JSON.stringify(Array.from(mentioned_fnames).sort()),
			JSON.stringify(Array.from(mentioned_idents).sort()),
		]

		const cache_key = cache_key_parts.join("|")

		// Check if the result is in the cache
		if (this.map_cache.has(cache_key)) {
			return this.map_cache.get(cache_key)!
		}

		// If not in cache, generate the map
		const start_time = Date.now()
		const result = await this.get_ranked_tags_map_uncached(
			chat_fnames,
			other_fnames,
			max_map_tokens,
			mentioned_fnames,
			mentioned_idents,
		)
		const end_time = Date.now()
		this.map_processing_time = (end_time - start_time) / 1000 // Convert to seconds

		// Store the result in the cache
		this.map_cache.set(cache_key, result)
		this.last_map = result

		return result
	}

	private async get_ranked_tags_map_uncached(
		chat_fnames: string[],
		other_fnames: string[],
		max_map_tokens: number,
		mentioned_fnames: Set<string>,
		mentioned_idents: Set<string>,
	): Promise<string> {
		let ranked_tags = await this.get_ranked_tags(chat_fnames, other_fnames, mentioned_fnames, mentioned_idents)

		// 获取其他文件的相对路径并去重排序
		const other_rel_fnames = Array.from(new Set(other_fnames.map((fname) => this.get_rel_fname(fname)))).sort()

		// 导入filterImportantFiles函数
		const { filterImportantFiles } = await import("../repomap/special")

		// 筛选重要文件
		const special_fnames = filterImportantFiles(other_rel_fnames)

		// 获取ranked_tags中已有的文件名集合
		const ranked_tags_fnames = new Set(
			ranked_tags
				.filter((tag) => "rel_fname" in tag)
				.map((tag) => (tag as Tag).rel_fname || (tag as { rel_fname: string }).rel_fname),
		)

		// 过滤出不在ranked_tags中的重要文件，并转换为与ranked_tags相同的格式
		const special_tags = special_fnames.filter((fn) => !ranked_tags_fnames.has(fn)).map((fn) => ({ rel_fname: fn }))

		// 合并到结果中（重要文件在前）
		ranked_tags = [...special_tags, ...ranked_tags]

		let num_tags = ranked_tags.length
		let lower_bound = 0
		let upper_bound = num_tags
		let best_tree = ""
		let best_tree_tokens = 0

		const chat_rel_fnames = new Set(chat_fnames.map((fname) => this.get_rel_fname(fname)))

		this.tree_cache.clear()

		let middle = Math.min(Math.floor(max_map_tokens / 25), num_tags)

		while (lower_bound <= upper_bound) {
			const tree = await this.to_tree(ranked_tags.slice(0, middle), chat_rel_fnames)
			const num_tokens = this.token_count(tree) // Simplified token count

			const pct_err = Math.abs(num_tokens - max_map_tokens) / max_map_tokens
			const ok_err = 0.15

			if ((num_tokens <= max_map_tokens && num_tokens > best_tree_tokens) || pct_err < ok_err) {
				best_tree = tree
				best_tree_tokens = num_tokens

				if (pct_err < ok_err) {
					break
				}
			}

			if (num_tokens < max_map_tokens) {
				lower_bound = middle + 1
			} else {
				upper_bound = middle - 1
			}

			middle = Math.floor((lower_bound + upper_bound) / 2)
		}

		return best_tree
	}

	private async get_ranked_tags(
		chat_fnames: string[],
		other_fnames: string[],
		mentioned_fnames: Set<string>,
		mentioned_idents: Set<string>,
	): Promise<(Tag | { rel_fname: string })[]> {
		// 仿照Python版本的get_ranked_tags实现

		// 定义存储结构
		const defines = new Map<string, Set<string>>() // {符号名: {定义该符号的文件集合}}
		const references = new Map<string, string[]>() // {符号名: [引用该符号的文件列表]}
		const definitions = new Map<string, Set<Tag>>() // {(文件名, 符号名): {对应的Tag对象}}

		const personalization = new Map<string, number>() // {文件名: 个性化权重}

		const fnames = Array.from(new Set([...chat_fnames, ...other_fnames])) // 所有待分析文件
		const chat_rel_fnames = new Set<string>()

		// Default personalization for unspecified files is 1/num_nodes
		const personalize = 100 / fnames.length

		// 处理所有文件
		for (const fname of fnames) {
			const rel_fname = this.get_rel_fname(fname)
			let current_pers = 0.0 // Start with 0 personalization score

			// 计算文件的个性化权重
			if (chat_fnames.includes(fname)) {
				current_pers += personalize
				chat_rel_fnames.add(rel_fname)
			}

			if (mentioned_fnames.has(rel_fname)) {
				// Use max to avoid double counting if in chat_fnames and mentioned_fnames
				current_pers = Math.max(current_pers, personalize)
			}

			// Check path components against mentioned_idents
			const pathObj = path.parse(rel_fname)
			const basenameWithoutExt = pathObj.name
			const pathComponents = new Set(rel_fname.split(path.sep))
			pathComponents.add(pathObj.base) // basename with ext
			pathComponents.add(basenameWithoutExt) // basename without ext

			const matchedIdents = new Set([...pathComponents].filter((ident) => mentioned_idents.has(ident)))
			if (matchedIdents.size > 0) {
				// Add personalization *once* if any path component matches a mentioned ident
				current_pers += personalize
			}

			if (current_pers > 0) {
				personalization.set(rel_fname, current_pers) // Assign the final calculated value
			}

			// 提取文件的符号定义和引用
			const tags = await this.get_tags(fname, rel_fname)

			for (const tag of tags) {
				if (tag.kind === "def") {
					// 记录定义位置
					if (!defines.has(tag.name)) {
						defines.set(tag.name, new Set())
					}
					defines.get(tag.name)!.add(rel_fname)

					// 存储Tag对象
					const key = `${rel_fname}|${tag.name}`
					if (!definitions.has(key)) {
						definitions.set(key, new Set())
					}
					const tagSet = definitions.get(key)!
					if (!this.isTagInSet(tag, tagSet)) {
						tagSet.add(tag)
					}
				} else if (tag.kind === "ref") {
					// 记录引用位置
					if (!references.has(tag.name)) {
						references.set(tag.name, [])
					}
					references.get(tag.name)!.push(rel_fname)
				}
			}
		}

		// 如果没有引用，则使用定义作为引用
		if (references.size === 0) {
			for (const [name, definers] of defines.entries()) {
				references.set(name, Array.from(definers))
			}
		}

		// 获取同时有定义和引用的标识符
		const defKeys = new Set(defines.keys())
		const refKeys = new Set(references.keys())
		const idents = new Set([...defKeys].filter((key) => refKeys.has(key)))

		// 构建图结构
		const G = new MultiDiGraph<string>()

		// Add a small self-edge for every definition that has no references
		for (const [ident, definers] of defines.entries()) {
			if (references.has(ident)) {
				continue
			}
			for (const definer of definers) {
				const edgeAttrs = new Map<string, string>()
				edgeAttrs.set("ident", ident)
				G.addEdgeWithAttributes(definer, definer, 0.1, edgeAttrs)
			}
		}

		// 添加定义-引用边（带动态权重）
		for (const ident of idents) {
			const definers = defines.get(ident) || new Set()
			let mul = 1.0 // 初始乘数

			// 检查命名风格
			const isSnake = ident.includes("_") && /[a-zA-Z]/.test(ident) // 蛇形命名法，如 my_function
			const isCamel = /[A-Z]/.test(ident) && /[a-z]/.test(ident) // 驼峰命名法，如 myFunction

			// 根据不同因素调整乘数
			if (mentioned_idents.has(ident)) {
				mul *= 10 // 如果标识符被用户提及，权重增加10倍
			}
			if ((isSnake || isCamel) && ident.length >= 8) {
				mul *= 10 // 如果是蛇形或驼峰命名且长度>=8，权重增加10倍
			}
			if (ident.startsWith("_")) {
				mul *= 0.1 // 如果以下划线开头，权重减少到0.1倍
			}
			if ((defines.get(ident)?.size || 0) > 5) {
				mul *= 0.1 // 如果定义超过5个，权重减少到0.1倍
			}

			const identReferences = references.get(ident) || []
			// 计算每个引用文件的引用次数
			const refCounts = new Map<string, number>()
			for (const referencer of identReferences) {
				refCounts.set(referencer, (refCounts.get(referencer) || 0) + 1)
			}

			for (const [referencer, numRefs] of refCounts.entries()) {
				for (const definer of definers) {
					let useMul = mul // 使用基础乘数

					// 如果引用文件在聊天文件中，进一步增加权重
					if (chat_rel_fnames.has(referencer)) {
						useMul *= 50
					}

					// 对引用次数进行平方根缩放，避免高频引用主导
					// scale down so high freq (low value) mentions don't dominate
					const scaledRefs = Math.sqrt(numRefs)

					// 添加边，权重为调整后的乘数乘以缩放后的引用次数
					const edgeAttrs = new Map<string, string>()
					edgeAttrs.set("ident", ident)
					G.addEdgeWithAttributes(referencer, definer, useMul * scaledRefs, edgeAttrs)
				}
			}
		}

		// 计算PageRank
		const ranked = G.personalizedPageRank(personalization, 0.85)

		// debug
		// console.log("=== Ranked items (sorted by key desc) ===");
		// const sortedEntries = Array.from(ranked.entries()).sort((a, b) =>
		//   b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0
		// );
		// for (const [key, value] of sortedEntries) {
		//   console.log(`  ${key}: ${value.toFixed(6)}`);
		// }

		// distribute the rank from each source node, across all of its out edges
		const rankedDefinitions = new Map<string, number>() // {(目标文件名, 符号名): 累计的排名分数}

		// 完整实现PageRank结果的分配逻辑
		for (const src of G.getNodes()) {
			const srcRank = ranked.get(src) || 0
			const edges = G.getOutEdges(src)

			if (edges) {
				const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0)

				if (totalWeight > 0) {
					for (const edge of edges) {
						const dst = edge.to
						const ident = edge.attributes.get("ident") || ""
						if (ident) {
							const key = `${dst}|${ident}`
							const rank = (srcRank * edge.weight) / totalWeight
							const currentRank = rankedDefinitions.get(key) || 0
							rankedDefinitions.set(key, currentRank + rank)
						}
					}
				}
			}
		}

		// 生成最终排序结果
		const rankedTags: (Tag | { rel_fname: string })[] = []

		// 将rankedDefinitions转换为数组并按排名分数降序排序
		const rankedDefinitionsArray: [string, number][] = []
		for (const [key, rank] of rankedDefinitions.entries()) {
			rankedDefinitionsArray.push([key, rank])
		}
		// 首先按 rank 分数排序，如果分数相同则按 key 字典序排序
		rankedDefinitionsArray.sort((a, b) => {
			if (b[1] !== a[1]) {
				return b[1] - a[1] // 按分数降序排序
			}
			// return b[0].localeCompare(a[0]); // 分数相同时按 key 字典序排序
			return b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0
		})

		// 添加符号定义到结果列表，跳过聊天相关文件
		for (const [key, rank] of rankedDefinitionsArray) {
			const [fname, ident] = key.split("|", 2) // 分割出文件名和标识符

			if (chat_rel_fnames.has(fname)) {
				continue
			}

			const defs = definitions.get(`${fname}|${ident}`)
			if (defs) {
				for (const def of defs) {
					rankedTags.push(def)
				}
			}
		}

		// 处理无符号定义的文件
		const relOtherFnamesWithoutTags = new Set(other_fnames.map((fname) => this.get_rel_fname(fname)))
		const fnamesAlreadyIncluded = new Set(
			rankedTags
				.filter((tag) => "rel_fname" in tag)
				.map((tag) => (tag as Tag).rel_fname || (tag as { rel_fname: string }).rel_fname),
		)

		// 按PageRank值排序所有文件
		const topRank: [number, string][] = []
		for (const [node, rank] of ranked.entries()) {
			topRank.push([rank, node])
		}
		topRank.sort((a, b) => b[0] - a[0]) // 降序排序

		for (const [rank, fname] of topRank) {
			if (relOtherFnamesWithoutTags.has(fname)) {
				relOtherFnamesWithoutTags.delete(fname)
			}
			if (!fnamesAlreadyIncluded.has(fname)) {
				rankedTags.push({ rel_fname: fname })
			}
		}

		for (const fname of relOtherFnamesWithoutTags) {
			rankedTags.push({ rel_fname: fname })
		}

		// debug
		// console.log("rankedTags===================");
		// rankedTags.forEach((tag, index) => {
		//   if ("line" in tag) {
		//     // Tag 对象
		//     console.log(
		//       `Index ${index}: rel_fname=${tag.rel_fname}, name=${tag.name}, line=${tag.line}, kind=${tag.kind}`
		//     );
		//   } else {
		//     // 只有 rel_fname 的对象
		//     console.log(`Index ${index}: rel_fname=${tag.rel_fname}`);
		//   }
		// });

		return rankedTags
	}

	private token_count(text: string): number {
		// 更精确的实现，处理边界情况
		if (!text || text.trim().length === 0) {
			return 0
		}

		const lenText = text.length
		if (lenText < 200) {
			return text.trim().split(/\s+/).length
		}

		const lines = text.split(/\r\n|\r|\n/)
		const numLines = lines.length
		const step = Math.floor(numLines / 100) || 1
		const sampledLines = lines.filter((_, i) => i % step === 0)
		const sampleText = sampledLines.join("\n")
		const sampleTokens = sampleText.trim().split(/\s+/).length
		const estTokens = (sampleTokens / sampleText.length) * lenText
		return estTokens
	}

	// 添加一个辅助函数来检查Tag是否已存在
	private isTagInSet(tag: Tag, tagSet: Set<Tag>): boolean {
		for (const existingTag of tagSet) {
			if (
				existingTag.rel_fname === tag.rel_fname &&
				existingTag.name === tag.name &&
				existingTag.line === tag.line &&
				existingTag.kind === tag.kind
			) {
				return true
			}
		}
		return false
	}

	private async get_tags(fname: string, rel_fname: string): Promise<Tag[]> {
		// Check if the file is in the cache and if the modification time has not changed
		const file_mtime = this.get_mtime(fname)
		if (file_mtime === null) {
			return []
		}

		const cache_key = fname
		const val = this.TAGS_CACHE.get(cache_key)

		if (val && val.mtime === file_mtime) {
			return val.data
		}

		// miss!
		let data: Tag[] = []
		try {
			data = await this.get_tags_raw(fname, rel_fname)
		} catch (error) {
			// Handle any error during tag extraction
			console.error(`Error processing file ${fname}:`, error)
			return []
		}

		// Update the cache
		this.TAGS_CACHE.set(cache_key, { mtime: file_mtime, data })
		return data
	}

	private async get_tags_raw(fname: string, rel_fname: string): Promise<Tag[]> {
		// Determine language from file extension
		const lang = this.filename_to_lang(fname)
		if (!lang) {
			return []
		}

		try {
			// Read file content
			const code = fs.readFileSync(fname, "utf8")
			if (!code) {
				return []
			}

			// Import required modules
			const languageModule = await this.get_language_module(lang)
			if (!languageModule) {
				return []
			}

			// Setup parser
			await Parser.init()
			const parser = new Parser()
			parser.setLanguage(languageModule)
			const tree = parser.parse(code)

			// Get the SCM query file for this language
			const query_scm_path = path.join(
				__dirname,
				// './queries/tree-sitter-language-pack',
				"./queries/tree-sitter-languages",
				`${lang}-tags.scm`,
			)

			if (!fs.existsSync(query_scm_path)) {
				return []
			}

			const query_scm = fs.readFileSync(query_scm_path, "utf8")

			// Create query using parser instead of language module directly
			// const language = parser.getLanguage()
			// const query = new Parser.Query(language, query_scm)
			// const query = parser.getLanguage().query(query_scm);
			// const captures = query.captures(tree!.rootNode)

			const language = languageModule
			const query = language.query(query_scm)
			const captures = query.captures(tree!.rootNode)

			const tags: Tag[] = []
			const seenKinds = new Set<string>()

			// Process captures
			for (const capture of captures) {
				const node = capture.node
				const tag = capture.name

				let kind: "def" | "ref" | null = null

				if (tag.startsWith("name.definition.")) {
					kind = "def"
				} else if (tag.startsWith("name.reference.")) {
					kind = "ref"
				} else {
					continue
				}

				// else if (tag.startsWith("definition.")) {
				//   kind = "def";
				// } else if (tag.startsWith("reference.")) {
				//   kind = "ref";
				// }

				if (!kind) {
					continue
				}

				seenKinds.add(kind)

				const tagName = node.text
				const line = node.startPosition.row

				tags.push({
					rel_fname,
					fname,
					name: tagName,
					kind,
					line,
				})
			}

			// If we only have definitions and no references, add references using a simple approach
			if (seenKinds.has("def") && !seenKinds.has("ref")) {
				// This would be where we'd implement a fallback like the Python version does with pygments
				// For now, we'll just return what we have
			}

			return tags
		} catch (error) {
			console.error(`Error processing file ${fname}:`, error)
			return []
		}
	}

	private filename_to_lang(fname: string): string | null {
		const ext = path.extname(fname).toLowerCase()
		const extensionMap: { [key: string]: string } = {
			".js": "javascript",
			".jsx": "javascript",
			".ts": "typescript",
			".tsx": "typescript",
			".py": "python",
			".rs": "rust",
			".go": "go",
			".java": "java",
			".cpp": "cpp",
			".c": "c",
			".cs": "c_sharp",
			".dart": "dart",
			".elm": "elm",
			".php": "php",
			".rb": "ruby",
			".scala": "scala",
			".swift": "swift",
		}

		return extensionMap[ext] || null
	}

	private async get_language_module(lang: string): Promise<any | null> {
		try {
			if (IS_DEBUG) {
				const WASM_DIR = path.join(__dirname, "../../../node_modules/tree-sitter-wasms/out")
				return await loadLanguage(lang, WASM_DIR)
			} else {
				return await loadLanguage(lang)
			}
		} catch (error) {
			console.error(`Failed to load language module for ${lang}:`, error)
			return null
		}
	}

	private async to_tree(tags: (Tag | { rel_fname: string })[], chat_rel_fnames: Set<string>): Promise<string> {
		if (!tags.length) {
			return ""
		}

		let cur_fname: string | null = null
		let cur_abs_fname: string | null = null
		let lois: number[] | null = null
		let output = ""

		// add a bogus tag at the end so we trip the this_fname != cur_fname...
		const dummy_tag: any = { rel_fname: null }
		const sortedTags = [...tags].sort((a, b) => {
			// 检查是否为Tag对象
			const isATag = "rel_fname" in a && "fname" in a && "line" in a && "name" in a && "kind" in a
			const isBTag = "rel_fname" in b && "fname" in b && "line" in b && "name" in b && "kind" in b

			// 如果其中一个不是Tag对象，则按rel_fname排序
			if (!isATag || !isBTag) {
				const a_fname = "rel_fname" in a ? a.rel_fname : ""
				const b_fname = "rel_fname" in b ? b.rel_fname : ""
				return a_fname < b_fname ? -1 : a_fname > b_fname ? 1 : 0
			}

			// 按rel_fname排序
			if (a.rel_fname < b.rel_fname) return -1
			if (a.rel_fname > b.rel_fname) return 1

			// 按fname排序
			if (a.fname < b.fname) return -1
			if (a.fname > b.fname) return 1

			// 按line排序
			if (a.line < b.line) return -1
			if (a.line > b.line) return 1

			// 按name排序
			if (a.name < b.name) return -1
			if (a.name > b.name) return 1

			// 按kind排序 ("def" < "ref")
			if (a.kind < b.kind) return -1
			if (a.kind > b.kind) return 1

			return 0
		})

		for (const tag of [...sortedTags, dummy_tag]) {
			const this_rel_fname = "rel_fname" in tag ? tag.rel_fname : null

			if (this_rel_fname && chat_rel_fnames.has(this_rel_fname)) {
				continue
			}

			// ... here ... to output the final real entry in the list
			if (this_rel_fname !== cur_fname) {
				if (lois !== null && cur_fname && cur_abs_fname) {
					output += "\n"
					output += cur_fname + ":\n"
					output += await this.render_tree(cur_abs_fname, cur_fname, lois)
					lois = null
				} else if (cur_fname) {
					output += "\n" + cur_fname + "\n"
				}

				if (tag && "rel_fname" in tag && "fname" in tag) {
					lois = []
					cur_abs_fname = (tag as Tag).fname
				}
				cur_fname = this_rel_fname
			}

			if (lois !== null && tag && "line" in tag) {
				lois.push((tag as Tag).line)
			}
		}

		// truncate long lines, in case we get minified js or something else crazy
		output =
			output
				.split("\n")
				.map((line) => (line.length > 100 ? line.substring(0, 100) : line))
				.join("\n") + "\n"

		return output
	}

	public async render_tree(abs_fname: string, rel_fname: string, lois: number[]): Promise<string> {
		const mtime = this.get_mtime(abs_fname)
		// 在Python版本中，key是一个元组(rel_fname, tuple(sorted(lois)), mtime)
		// 在TypeScript中，我们将其转换为字符串
		const key = `${rel_fname}|${JSON.stringify(lois.sort((a, b) => a - b))}|${mtime}`

		if (this.tree_cache.has(key)) {
			return this.tree_cache.get(key)!
		}

		// 检查是否需要重新创建TreeContext（如果文件不存在于缓存中，或者修改时间不匹配）
		if (
			!this.tree_context_cache.has(rel_fname) ||
			(mtime !== null && this.tree_context_cache.get(rel_fname)?.mtime !== mtime)
		) {
			// 读取文件内容
			let code = ""
			try {
				code = fs.readFileSync(abs_fname, "utf-8")
			} catch (error) {
				// 文件读取错误处理
				console.warn(`Error reading file ${abs_fname}: ${error}`)
			}

			// 确保代码以换行符结尾
			if (!code.endsWith("\n")) {
				code += "\n"
			}

			// 使用 grep-ast-ts 创建 TreeContext 实例
			const context = await TreeCtx.create(
				rel_fname,
				code,
				false, // color
				false, // verbose
				false, // line_number
				true, // parent_context
				false, // child_context
				false, // last_line
				0, // margin
				false, // mark_lois
				10, // header_max
				false, // show_top_of_file_parent_scope
				0, // loiPad
			)

			// 将context和mtime存储到缓存中
			if (mtime !== null) {
				this.tree_context_cache.set(rel_fname, { context, mtime })
			}
		}

		// 从缓存中获取context
		const context_entry = this.tree_context_cache.get(rel_fname)
		if (!context_entry) {
			return ""
		}

		const context = context_entry.context

		// 设置lines_of_interest并添加上下文
		// 在Python版本中：context.lines_of_interest = set() 然后 context.add_lines_of_interest(lois)
		context.linesOfInterest = new Set() // 先清空
		context.addLinesOfInterest(new Set(lois))
		context.addContext()

		// 格式化输出
		const res = context.format()

		// 将结果存储到tree_cache中
		this.tree_cache.set(key, res)

		return res
	}
}

// Helper function to find source files (equivalent to find_src_files in Rust)
export function findSrcFiles(directory: string): string[] {
	if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
		return [directory]
	}

	const srcFiles: string[] = []
	const walk = (dir: string) => {
		const files = fs.readdirSync(dir)
		for (const file of files) {
			const filepath = path.join(dir, file)
			const stat = fs.statSync(filepath, { throwIfNoEntry: false })
			if (stat?.isFile()) {
				srcFiles.push(filepath)
			} else if (stat?.isDirectory()) {
				walk(filepath)
			}
		}
	}

	walk(directory)
	return srcFiles
}

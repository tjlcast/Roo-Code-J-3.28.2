import { Parser, Language, Tree, Node } from "web-tree-sitter"
import { getLanguageByExtension } from "./lang"
import chalk from "chalk"

export class TreeCtx {
	filename: string
	code: string
	lines: string[]
	numLines: number
	showLines: Set<number>
	linesOfInterest: Set<number>
	outputLines: Map<number, string>
	scopes: Set<number>[]
	header: [number, number, number][][]
	nodes: Node[][]
	color: boolean
	verbose: boolean
	lineNumber: boolean
	parentContext: boolean
	childContext: boolean
	lastLine: boolean
	margin: number
	markLois: boolean
	headerMax: number
	showTopOfFileParentScope: boolean
	loiPad: number
	doneParentScopes: Set<number>
	headerBounds: [number, number][]
	tree: Tree | null

	constructor(
		filename: string,
		code: string,
		color: boolean,
		verbose: boolean,
		lineNumber: boolean,
		parentContext: boolean,
		childContext: boolean,
		lastLine: boolean,
		margin: number,
		markLois: boolean,
		headerMax: number,
		showTopOfFileParentScope: boolean,
		loiPad: number,
	) {
		this.filename = filename
		this.code = code
		this.lines = code.split("\n")
		this.numLines = this.lines.length
		this.showLines = new Set<number>()
		this.linesOfInterest = new Set<number>()
		this.outputLines = new Map<number, string>()
		this.scopes = Array.from({ length: this.numLines }, () => new Set<number>())
		this.header = Array.from({ length: this.numLines }, () => [])
		this.nodes = Array.from({ length: this.numLines }, () => [])
		this.color = color
		this.verbose = verbose
		this.lineNumber = lineNumber
		this.parentContext = parentContext
		this.childContext = childContext
		this.lastLine = lastLine
		this.margin = margin
		this.markLois = markLois
		this.headerMax = headerMax
		this.showTopOfFileParentScope = showTopOfFileParentScope
		this.loiPad = loiPad
		this.doneParentScopes = new Set<number>()
		this.headerBounds = Array.from({ length: this.numLines }, () => [0, 0])
		this.tree = null
	}

	static async create(
		filename: string,
		code: string,
		color: boolean,
		verbose: boolean,
		lineNumber: boolean,
		parentContext: boolean,
		childContext: boolean,
		lastLine: boolean,
		margin: number,
		markLois: boolean,
		headerMax: number,
		showTopOfFileParentScope: boolean,
		loiPad: number,
	): Promise<TreeCtx> {
		const instance = new TreeCtx(
			filename,
			code,
			color,
			verbose,
			lineNumber,
			parentContext,
			childContext,
			lastLine,
			margin,
			markLois,
			headerMax,
			showTopOfFileParentScope,
			loiPad,
		)

		const ext = filename.split(".").pop() || ""
		const language = await getLanguageByExtension(ext)
		if (!language) {
			console.warn(`Unsupported extension: ${ext}, parsing will be skipped`)
			return instance
		}

		const parser = new Parser()
		parser.setLanguage(language)
		instance.tree = parser.parse(instance.code)!

		instance.walkTree(instance.tree.rootNode, 0)

		if (verbose) {
			const scopeWidth = Math.max(...instance.scopes.map((s) => JSON.stringify(Array.from(s)).length))
			for (let i = 0; i < instance.lines.length; i++) {
				const scopes = JSON.stringify(Array.from(instance.scopes[i]))
				console.log(`${scopes.padEnd(scopeWidth)} ${i} ${instance.lines[i]}`)
			}
		}

		for (let i = 0; i < instance.numLines; i++) {
			const header = [...instance.header[i]].sort((a, b) => {
				// 按照Python元组排序规则，从左到右比较每个元素
				for (let j = 0; j < Math.min(a.length, b.length); j++) {
					if (a[j] !== b[j]) {
						return a[j] - b[j]
					}
				}
				return a.length - b.length
			})
			const [headStart, headEnd] =
				header.length > 1
					? (() => {
							const [size, hs, he] = header[0]
							return size > instance.headerMax ? [hs, hs + instance.headerMax] : [hs, he]
						})()
					: [i, i + 1]

			instance.headerBounds[i] = [headStart, headEnd]
		}

		return instance
	}

	private walkTree(node: Node, depth: number): void {
		const startLine = node.startPosition.row
		const endLine = node.endPosition.row
		const size = endLine - startLine

		if (startLine >= this.numLines) {
			return
		}

		this.nodes[startLine].push(node)

		if (this.verbose && node.isNamed) {
			const nodeText = node.text.split("\n")[0] || ""
			console.log(
				`${"   ".repeat(depth)}${node.type} ${startLine}-${endLine}=${
					size + 1
				} ${nodeText} ${this.lines[startLine] || ""}`,
			)
		}

		if (size > 0) {
			this.header[startLine].push([size, startLine, endLine])
		}

		for (let i = startLine; i <= Math.min(endLine, this.numLines - 1); i++) {
			this.scopes[i].add(startLine)
		}

		node.children.forEach((child) => {
			this.walkTree(child!, depth + 1)
		})
	}

	grep(pat: string, ignoreCase: boolean): Set<number> {
		const flags = ignoreCase ? "i" : ""
		const re = new RegExp(pat, flags)

		const found = new Set<number>()
		this.lines.forEach((line, i) => {
			if (re.test(line)) {
				if (this.color) {
					const highlighted = line.replace(re, (match) => chalk.red.bold(match))
					this.outputLines.set(i, highlighted)
				}
				found.add(i)
			}
		})
		return found
	}

	addLinesOfInterest(lineNums: Set<number>): void {
		this.linesOfInterest = new Set(lineNums)
	}

	addContext(): void {
		if (this.linesOfInterest.size === 0) {
			return
		}

		this.doneParentScopes.clear()
		this.showLines = new Set(this.linesOfInterest)

		// Add loi_pad lines around each LOI
		if (this.loiPad > 0) {
			const loiCopy = Array.from(this.linesOfInterest)
			for (const line of loiCopy) {
				for (
					let newLine = Math.max(0, line - this.loiPad);
					newLine <= Math.min(line + this.loiPad, this.numLines - 1);
					newLine++
				) {
					this.showLines.add(newLine)
				}
			}
		}

		if (this.lastLine && this.numLines >= 2) {
			const bottomLine = this.numLines - 2
			this.showLines.add(bottomLine)
			this.addParentScopes(bottomLine)
		}

		// Add parent scopes for each LOI
		if (this.parentContext) {
			const loiCopy = Array.from(this.linesOfInterest)
			for (const i of loiCopy) {
				this.addParentScopes(i)
			}
		}

		// Add child context for each LOI
		if (this.childContext) {
			const loiCopy = Array.from(this.linesOfInterest)
			for (const i of loiCopy) {
				this.addChildContext(i)
			}
		}

		// Add top margin
		if (this.margin > 0) {
			for (let i = 0; i < Math.min(this.margin, this.numLines); i++) {
				this.showLines.add(i)
			}
		}

		// Close small gaps
		this.closeSmallGaps()
	}

	private addParentScopes(i: number): void {
		if (this.doneParentScopes.has(i) || i >= this.scopes.length) {
			return
		}
		this.doneParentScopes.add(i)

		const scopeLines = Array.from(this.scopes[i])
		for (const lineNum of scopeLines) {
			const [headStart, headEnd] = this.headerBounds[lineNum]
			if (headStart > 0 || this.showTopOfFileParentScope) {
				for (let j = headStart; j < Math.min(headEnd, this.numLines); j++) {
					this.showLines.add(j)
				}
			}

			if (this.lastLine) {
				const lastLine = this.getLastLineOfScope(lineNum)
				this.addParentScopes(lastLine)
			}
		}
	}

	private getLastLineOfScope(i: number): number {
		if (this.nodes[i].length === 0) {
			return i
		}
		return Math.max(...this.nodes[i].map((node) => node.endPosition.row))
	}

	private addChildContext(i: number): void {
		if (i >= this.numLines || this.nodes[i].length === 0) {
			return
		}

		const lastLine = this.getLastLineOfScope(i)
		const size = lastLine - i
		if (size < 5) {
			for (let j = i; j <= Math.min(lastLine, this.numLines - 1); j++) {
				this.showLines.add(j)
			}
			return
		}

		let children: Node[] = []
		for (const node of this.nodes[i]) {
			this.findAllChildren(node, children)
		}

		children.sort((a, b) => {
			const aSize = a.endPosition.row - a.startPosition.row
			const bSize = b.endPosition.row - b.startPosition.row
			return bSize - aSize
		})

		const currentlyShowing = this.showLines.size
		const maxToShow = 25
		const minToShow = 5
		const percentToShow = 0.1
		const maxToShowCount = Math.min(Math.max(minToShow, Math.floor(size * percentToShow)), maxToShow)

		for (const child of children) {
			if (this.showLines.size > currentlyShowing + maxToShowCount) {
				break
			}
			const childStartLine = child.startPosition.row
			this.addParentScopes(childStartLine)
		}
	}

	private findAllChildren(node: Node, result: Node[]): void {
		result.push(node)
		node.children.forEach((child) => {
			this.findAllChildren(child!, result)
		})
	}

	private closeSmallGaps(): void {
		const closedShow = new Set(this.showLines)
		const sortedShow = Array.from(this.showLines).sort((a, b) => a - b)

		for (let i = 0; i < sortedShow.length - 1; i++) {
			if (sortedShow[i + 1] - sortedShow[i] === 2) {
				closedShow.add(sortedShow[i] + 1)
			}
		}

		for (let i = 0; i < this.lines.length; i++) {
			if (!closedShow.has(i)) {
				continue
			}
			if (this.lines[i].trim() !== "" && i + 1 < this.numLines && this.lines[i + 1].trim() === "") {
				closedShow.add(i + 1)
			}
		}

		this.showLines = closedShow
	}

	format(): string {
		if (this.showLines.size === 0) {
			return ""
		}

		let output = ""
		if (this.color) {
			output += "\x1b[0m\n"
		}

		let dots = !this.showLines.has(0)
		for (let i = 0; i < this.lines.length; i++) {
			if (!this.showLines.has(i)) {
				if (dots) {
					output += this.lineNumber ? "...⋮...\n" : "⋮\n"
					dots = false
				}
				continue
			}

			const spacer = this.linesOfInterest.has(i) && this.markLois ? (this.color ? chalk.red("█") : "█") : "│"

			const lineContent = this.outputLines.get(i) || this.lines[i]
			let lineOutput = `${spacer}${lineContent}`

			if (this.lineNumber) {
				lineOutput = `${(i + 1).toString().padStart(3)}${lineOutput}`
			}

			output += `${lineOutput}\n`
			dots = true
		}

		return output
	}
}

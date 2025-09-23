import hashObject from "object-hash"
import { CompletionRequest } from "../TabbyCompletionContext"
import { regOnlyAutoClosingCloseChars, splitLines } from "./utils"

export class CompletionContext {
	filepath: string
	language: string
	indentation?: string
	text: string
	position: number

	prefix: string
	suffix: string
	prefixLines: string[]
	suffixLines: string[]
	currentLinePrefix: string
	currentLineSuffix: string

	clipboard: string

	// "default": the cursor is at the end of the line
	// "fill-in-line": the cursor is not at the end of the line, except auto closed characters
	//   In this case, we assume the completion should be a single line, so multiple lines completion will be dropped.
	mode: "default" | "fill-in-line"
	hash: string

	constructor(request: CompletionRequest) {
		this.filepath = request.filepath
		this.language = request.language
		this.text = request.text
		this.position = request.position
		this.indentation = request.indentation

		this.prefix = request.text.slice(0, request.position)
		this.suffix = request.text.slice(request.position)
		this.prefixLines = splitLines(this.prefix)
		this.suffixLines = splitLines(this.suffix)
		this.currentLinePrefix = this.prefixLines[this.prefixLines.length - 1] ?? ""
		this.currentLineSuffix = this.suffixLines[0] ?? ""

		this.clipboard = request.clipboard?.trim() ?? ""

		const lineEnd = isAtLineEndExcludingAutoClosedChar(this.suffixLines[0] ?? "")
		this.mode = lineEnd ? "default" : "fill-in-line"
		this.hash = hashObject({
			filepath: this.filepath,
			language: this.language,
			text: this.text,
			position: this.position,
			clipboard: this.clipboard,
		})
	}
}

function isAtLineEndExcludingAutoClosedChar(suffix: string) {
	return suffix.trimEnd().match(regOnlyAutoClosingCloseChars)
}

import { CompletionResponse } from "../../TabbyCompletionContext"
import { AgentConfig } from "../AgentConfig"
import { CompletionContext } from "../CompletionContext"
import { applyChoiceFilter, applyFilter } from "./base"
import { calculateReplaceRange } from "./calculateReplaceRange"
import { dropBlank } from "./dropBlank"
import { dropDuplicated } from "./dropDuplicated"
import { formatIndentation } from "./formatIndentation"
import { limitScope } from "./limitScope"
import { removeDuplicatedBlockClosingLine } from "./removeDuplicatedBlockClosingLine"
import { removeLineEndsWithRepetition } from "./removeLineEndsWithRepetition"
import { removeRepetitiveBlocks } from "./removeRepetitiveBlocks"
import { removeRepetitiveLines } from "./removeRepetitiveLines"
import { trimMultiLineInSingleLineMode } from "./trimMultiLineInSingleLineMode"
import { trimSpace } from "./trimSpace"

export async function preCacheProcess(
	context: CompletionContext,
	_: AgentConfig["postprocess"],
	response: CompletionResponse,
): Promise<CompletionResponse> {
	return Promise.resolve(response)
		.then(applyFilter(trimMultiLineInSingleLineMode(), context))
		.then(applyFilter(removeLineEndsWithRepetition(), context))
		.then(applyFilter(dropDuplicated(), context))
		.then(applyFilter(trimSpace(), context))
		.then(applyFilter(dropBlank(), context))
}

export async function postCacheProcess(
	context: CompletionContext,
	config: AgentConfig["postprocess"],
	response: CompletionResponse,
): Promise<CompletionResponse> {
	return Promise.resolve(response)
		.then(applyFilter(removeRepetitiveBlocks(), context))
		.then(applyFilter(removeRepetitiveLines(), context))
		.then(applyFilter(limitScope(config["limitScope"]), context))
		.then(applyFilter(removeDuplicatedBlockClosingLine(), context))
		.then(applyFilter(formatIndentation(), context))
		.then(applyFilter(dropDuplicated(), context))
		.then(applyFilter(trimSpace(), context))
		.then(applyFilter(dropBlank(), context))
		.then(applyChoiceFilter(calculateReplaceRange(config["calculateReplaceRange"]), context))
}

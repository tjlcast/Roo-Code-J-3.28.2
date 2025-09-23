import { CompletionResponseChoice } from "../../TabbyCompletionContext"
import { logger } from "../../logger"
import { CompletionContext } from "../CompletionContext"
import { findUnpairedAutoClosingChars, isBlank } from "../utils"

export function calculateReplaceRangeByBracketStack(
	choice: CompletionResponseChoice,
	context: CompletionContext,
): CompletionResponseChoice {
	const { currentLineSuffix } = context
	const suffixText = currentLineSuffix.trimEnd()
	if (isBlank(suffixText)) {
		return choice
	}
	const completionText = choice.text.slice(context.position - choice.replaceRange.start)
	const unpaired = findUnpairedAutoClosingChars(completionText).join("")
	if (isBlank(unpaired)) {
		return choice
	}
	if (suffixText.startsWith(unpaired)) {
		choice.replaceRange.end = context.position + unpaired.length
		logger().trace("Adjust replace range by bracket stack", {
			context,
			completion: choice.text,
			range: choice.replaceRange,
			unpaired,
		})
	} else if (unpaired.startsWith(suffixText)) {
		choice.replaceRange.end = context.position + suffixText.length
		logger().trace("Adjust replace range by bracket stack", {
			context,
			completion: choice.text,
			range: choice.replaceRange,
			unpaired,
		})
	}
	return choice
}

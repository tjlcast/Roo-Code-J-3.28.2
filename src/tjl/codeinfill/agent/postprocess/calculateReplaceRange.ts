import { logger } from "../../logger"
import { AgentConfig } from "../AgentConfig"
import { isBrowser } from "../env"
import { PostprocessChoiceFilter } from "./base"
import { calculateReplaceRangeByBracketStack } from "./calculateReplaceRangeByBracketStack"
import { calculateReplaceRangeBySyntax } from "./calculateReplaceRangeBySyntax"

export function calculateReplaceRange(
	config: AgentConfig["postprocess"]["calculateReplaceRange"],
): PostprocessChoiceFilter {
	return async (choice, context) => {
		const preferSyntaxParser =
			!isBrowser && // syntax parser is not supported in browser yet
			config.experimentalSyntax

		if (preferSyntaxParser) {
			try {
				return await calculateReplaceRangeBySyntax(choice, context)
			} catch (error) {
				logger().debug("Failed to calculate replace range by syntax parser", { error })
			}
		}
		return calculateReplaceRangeByBracketStack(choice, context)
	}
}

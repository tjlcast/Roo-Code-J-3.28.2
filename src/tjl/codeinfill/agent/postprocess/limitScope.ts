import { AgentConfig } from "../AgentConfig"
import { CompletionContext } from "../CompletionContext"
import { isBrowser } from "../env"
import { PostprocessFilter } from "./base"
import { limitScopeByIndentation } from "./limitScopeByIndentation"
import { limitScopeBySyntax } from "./limitScopeBySyntax"

export function limitScope(config: AgentConfig["postprocess"]["limitScope"]): PostprocessFilter {
	return async (input: string, context: CompletionContext) => {
		const preferSyntaxParser =
			!isBrowser && // syntax parser is not supported in browser yet
			config.experimentalSyntax

		if (preferSyntaxParser) {
			try {
				return await limitScopeBySyntax()(input, context)
			} catch (error) {
				// logger.debug({ error }, "Failed to limit scope by syntax parser");
			}
		}
		return limitScopeByIndentation(config["indentation"])(input, context)
	}
}

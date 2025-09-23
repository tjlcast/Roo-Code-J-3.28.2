import { isBlank } from "../utils"
import { PostprocessFilter } from "./base"

export function dropBlank(): PostprocessFilter {
	return (input: string) => {
		return isBlank(input) ? null : input
	}
}

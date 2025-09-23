export type CompletionRequest = {
	filepath: string
	language: string
	text: string
	position: number
	indentation?: string
	clipboard?: string
	manually?: boolean
}

export type CompletionResponse = {
	id: string
	choices: CompletionResponseChoice[]
}

export type CompletionResponseChoice = {
	index: number
	text: string
	replaceRange: {
		start: number
		end: number
	}
}

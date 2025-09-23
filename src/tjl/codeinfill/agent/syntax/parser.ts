import { Parser as TreeSitterParser, Language } from "web-tree-sitter"
import path from "path"

export const languagesConfigs: Record<string, string> = {
	javascript: "tsx",
	typescript: "tsx",
	javascriptreact: "tsx",
	typescriptreact: "tsx",
	python: "python",
	go: "go",
	rust: "rust",
	ruby: "ruby",
}

let treeSitterInitialized = false

async function createParser(languageConfig: string): Promise<TreeSitterParser> {
	if (!treeSitterInitialized) {
		await TreeSitterParser.init({
			locateFile(scriptName: string, scriptDirectory: string) {
				const paths = [scriptDirectory, "wasm", scriptName]
				return path.join(...paths)
			},
		})
		treeSitterInitialized = true
	}
	const parser = new TreeSitterParser()
	const langWasmPaths = [__dirname, "wasm", `tree-sitter-${languageConfig}.wasm`]
	parser.setLanguage(await Language.load(path.join(...langWasmPaths)))
	return parser
}

const parsers = new Map<string, TreeSitterParser>()

export async function getParser(languageConfig: string): Promise<TreeSitterParser> {
	let parser = parsers.get(languageConfig)
	if (!parser) {
		parser = await createParser(languageConfig)
		parsers.set(languageConfig, parser)
	}
	return parser
}

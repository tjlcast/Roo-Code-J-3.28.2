import path from "path"
import { initializeTreeSitter } from "../../../services/tree-sitter/__tests__/helpers"

let IS_DEBUG = false

export function setDebug(debug: boolean) {
	IS_DEBUG = debug
}

export interface LanguageConfig {
	[key: string]: any
}

export const languageByExt: { [key: string]: any } = {
	py: "python",
	rs: "rust",
	go: "go",
	java: "java",
	ts: "typescript",
	tsx: "tsx",
}

export async function getLanguageByExtension(ext: string) {
	const lang = languageByExt[ext]
	if (lang) {
		if (IS_DEBUG) {
			return await loadLanguage(
				lang,
				"C:/Users/phx10/code/Roo-Code-J-3.28.2/src/node_modules/tree-sitter-wasms/out",
			)
			// 使用 require.resolve 来动态获取 tree-sitter-wasms 模块路径
			// const WASM_DIR = path.join(__dirname, "../../../node_modules/tree-sitter-wasms/out")
			// return await loadLanguage(lang, WASM_DIR)
		} else {
			return await loadLanguage(lang)
		}
	}
	return null
}

export async function loadLanguage(langName: string, sourceDirectory?: string) {
	const baseDir = sourceDirectory || __dirname
	const wasmPath = path.join(baseDir, `tree-sitter-${langName}.wasm`)

	try {
		const { Parser, Language } = await initializeTreeSitter()
		const parser = new Parser()

		// Load language and configure parser
		const wasmPath = path.join(process.cwd(), `dist/tree-sitter-${langName}.wasm`)
		return await Language.load(wasmPath)
	} catch (error) {
		console.error(`Error loading language: ${wasmPath}: ${error instanceof Error ? error.message : error}`)
		return null
	}
}

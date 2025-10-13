import path from "path"

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
		} else {
			return await loadLanguage(lang)
		}
	}
	return null
}

async function loadLanguage(langName: string, sourceDirectory?: string) {
	const baseDir = sourceDirectory || __dirname
	const wasmPath = path.join(baseDir, `tree-sitter-${langName}.wasm`)

	try {
		const { Language } = await import("web-tree-sitter")
		return await Language.load(wasmPath)
	} catch (error) {
		console.error(`Error loading language: ${wasmPath}: ${error instanceof Error ? error.message : error}`)
		return null
	}
}

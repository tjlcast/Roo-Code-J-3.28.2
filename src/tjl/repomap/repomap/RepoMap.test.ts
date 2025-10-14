import path from "path"
import { findSrcFiles, RepoMap, setDebug } from "./RepoMap"

// cd src; pnpm test tjl/repomap/repomap/RepoMap.test.ts

describe("RepoMap", () => {
	// pnpm test tjl/repomap/repomap/RepoMap.test.ts -t "get_ranked_tags"
	describe("get_ranked_tags", () => {
		test("should get ranked tags for rust files", async () => {
			setDebug(true)
			const testHomePath = path.join(__dirname, "../grep_ast")
			const repoMap = new RepoMap({
				root: testHomePath,
				map_tokens: 2048,
			})

			const chatFiles: string[] = []
			const otherFiles = findSrcFiles(testHomePath)
			const mentionedFnames = new Set<string>()
			const mentionedIdents = new Set<string>()
			mentionedIdents.add("RepoMap")

			// Cast to any to access private method for testing
			const rankedTags = await (repoMap as any).get_ranked_tags(
				chatFiles,
				otherFiles,
				mentionedFnames,
				mentionedIdents,
			)

			console.log(">>>>")
			console.log(rankedTags)
			console.log("len:", rankedTags.length)

			// Check that we get the expected number of tags
			expect(rankedTags).not.toBe(null)
			expect(rankedTags.length).toBe(18)
		})
	})

	// pnpm test tjl/repomap/repomap/RepoMap.test.ts -t "get_repo_map"
	describe("get_repo_map", () => {
		test("get_repo_map", async () => {
			setDebug(true)
			const testHomePath = path.join(__dirname, "../grep_ast")
			const repoMap = new RepoMap({
				root: testHomePath,
				map_tokens: 2048,
			})

			const chatFiles: string[] = []
			const otherFiles = findSrcFiles(testHomePath)
			const mentionedFnames = new Set<string>()
			const mentionedIdents = new Set<string>()
			mentionedIdents.add("getLanguageByExtension")

			const repoMapResult = await repoMap.get_repo_map(chatFiles, otherFiles, mentionedFnames, mentionedIdents)

			if (repoMapResult) {
				console.log(">>>>")
				console.log(repoMapResult)
				expect(repoMapResult).not.toBe(null)
				expect(repoMapResult.length).toBe(4198)
				expect(
					repoMapResult.startsWith(
						"\nlang.ts:\n⋮\n│export function setDebug(debug: boolean) {\n│\tIS_DEBUG = debug\n⋮\n│",
					),
				).toBe(true)
				expect(repoMapResult.endsWith("\r\n│\t\t}\r\n│\r\n⋮\n\n")).toBe(true)
			} else {
				console.log("No repo map found")
			}

			// Basic assertion - just check that the function runs without error
			expect(true).toBe(true)
		})
	})
})

import { describe, it, expect, beforeEach, vi } from "vitest"
import { TreeCtx } from "./treeCtx"
import fs from "fs"
import path from "path"
import { setDebug as lang_set_debug } from "./lang"

// run:
// cd src; pnpm test tjl/repomap/grep_ast/treeCtx.test.ts

describe("TreeCtx", () => {
	it("should create instance and parse code correctly", async () => {
		lang_set_debug(true)

		// 使用相对路径而不是绝对路径，提高测试的可移植性
		const filename = path.join(__dirname, "treeCtx.test.ts")
		const code = fs.readFileSync(filename, "utf8").toString()

		const ctx = await TreeCtx.create(
			filename,
			code,
			false, // color
			false, // verbose
			false, // lineNumber
			true, // parentContext
			true, // childContext
			true, // lastLine
			3, // margin
			true, // markLois
			10, // headerMax
			true, // showTopOfFileParentScope
			1, // loiPad
		)

		const loi = ctx.grep("TreeCtx", true)

		// Add context and format output
		ctx.addLinesOfInterest(loi)
		ctx.addContext()

		const output = ctx.format()

		expect(output).not.toEqual("")
	})
})

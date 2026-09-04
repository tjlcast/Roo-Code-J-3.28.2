// npx vitest run src/services/ripgrep/__tests__/index.spec.ts

import * as path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fileExistsAtPath } from "../../../utils/fs"
import { getBinPath, truncateLine } from "../index"

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(),
}))

function getExpectedRipgrepUniversalPlatformDir(): string {
	if (process.platform === "win32") {
		if (process.arch === "arm64") {
			return "win32-arm64"
		}

		if (process.arch === "ia32") {
			return "win32-ia32"
		}

		return "win32-x64"
	}

	if (process.platform === "darwin") {
		if (process.arch === "arm64") {
			return "darwin-arm64"
		}

		return "darwin-x64"
	}

	if (process.platform === "linux") {
		if (process.arch === "arm64") {
			return "linux-arm64"
		}

		if (process.arch === "arm") {
			return "linux-arm"
		}

		if (process.arch === "ia32") {
			return "linux-ia32"
		}

		if (process.arch === "ppc64") {
			return "linux-ppc64"
		}

		if (process.arch === "riscv64") {
			return "linux-riscv64"
		}

		if (process.arch === "s390x") {
			return "linux-s390x"
		}

		return "linux-x64"
	}

	return ""
}

const binName = process.platform === "win32" ? "rg.exe" : "rg"

describe("getBinPath", () => {
	const vscodeAppRoot = path.join(path.sep, "mock", "vscode", "app")
	const mockFileExistsAtPath = vi.mocked(fileExistsAtPath)

	beforeEach(() => {
		mockFileExistsAtPath.mockReset()
	})

	it("should find ripgrep in VS Code's ripgrep-universal package", async () => {
		const platformDir = getExpectedRipgrepUniversalPlatformDir()
		const expectedPath = path.join(
			vscodeAppRoot,
			"node_modules.asar.unpacked",
			"@vscode",
			"ripgrep-universal",
			"bin",
			platformDir,
			binName,
		)

		mockFileExistsAtPath.mockImplementation(async (filePath) => filePath === expectedPath)

		await expect(getBinPath(vscodeAppRoot)).resolves.toBe(expectedPath)
	})

	it("should still find ripgrep in the legacy VS Code package path", async () => {
		const expectedPath = path.join(vscodeAppRoot, "node_modules", "@vscode", "ripgrep", "bin", binName)

		mockFileExistsAtPath.mockImplementation(async (filePath) => filePath === expectedPath)

		await expect(getBinPath(vscodeAppRoot)).resolves.toBe(expectedPath)
	})

	it("should return undefined when ripgrep is not found", async () => {
		mockFileExistsAtPath.mockResolvedValue(false)

		await expect(getBinPath(vscodeAppRoot)).resolves.toBeUndefined()
	})
})

describe("Ripgrep line truncation", () => {
	// The default MAX_LINE_LENGTH is 500 in the implementation
	const MAX_LINE_LENGTH = 500

	it("should truncate lines longer than MAX_LINE_LENGTH", () => {
		const longLine = "a".repeat(600) // Line longer than MAX_LINE_LENGTH
		const truncated = truncateLine(longLine)

		expect(truncated).toContain("[truncated...]")
		expect(truncated.length).toBeLessThan(longLine.length)
		expect(truncated.length).toEqual(MAX_LINE_LENGTH + " [truncated...]".length)
	})

	it("should not truncate lines shorter than MAX_LINE_LENGTH", () => {
		const shortLine = "Short line of text"
		const truncated = truncateLine(shortLine)

		expect(truncated).toEqual(shortLine)
		expect(truncated).not.toContain("[truncated...]")
	})

	it("should correctly truncate a line at exactly MAX_LINE_LENGTH characters", () => {
		const exactLine = "a".repeat(MAX_LINE_LENGTH)
		const exactPlusOne = exactLine + "x"

		// Should not truncate when exactly MAX_LINE_LENGTH
		expect(truncateLine(exactLine)).toEqual(exactLine)

		// Should truncate when exceeding MAX_LINE_LENGTH by even 1 character
		expect(truncateLine(exactPlusOne)).toContain("[truncated...]")
	})

	it("should handle empty lines without errors", () => {
		expect(truncateLine("")).toEqual("")
	})

	it("should allow custom maximum length", () => {
		const customLength = 100
		const line = "a".repeat(customLength + 50)

		const truncated = truncateLine(line, customLength)

		expect(truncated.length).toEqual(customLength + " [truncated...]".length)
		expect(truncated).toContain("[truncated...]")
	})
})

#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

function parseArgs(argv) {
	const args = {
		repoPath: process.cwd(),
		pluginDir: "mypilot",
		baseUrl: "https://tjlcast.github.io/static-web/mypilot",
		commit: false,
		push: false,
		dryRun: false,
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		const next = () => {
			i++
			if (i >= argv.length) {
				throw new Error(`Missing value for ${arg}`)
			}
			return argv[i]
		}

		switch (arg) {
			case "--repo-path":
				args.repoPath = next()
				break
			case "--static-web-path":
				args.staticWebPath = next()
				break
			case "--vsix-path":
				args.vsixPath = next()
				break
			case "--plugin-dir":
				args.pluginDir = next()
				break
			case "--base-url":
				args.baseUrl = next()
				break
			case "--plugin-id":
				args.pluginId = next()
				break
			case "--commit":
				args.commit = true
				break
			case "--push":
				args.push = true
				args.commit = true
				break
			case "--dry-run":
				args.dryRun = true
				break
			case "--help":
			case "-h":
				printHelp()
				process.exit(0)
			default:
				throw new Error(`Unknown argument: ${arg}`)
		}
	}

	return args
}

function printHelp() {
	console.log(`Usage: node scripts/publish-vsix.mjs [options]

Options:
  --repo-path <path>        Roo Code repository root. Defaults to cwd.
  --static-web-path <path>  static-web repository. Defaults to ../static-web.
  --vsix-path <path>       Specific VSIX to publish.
  --plugin-dir <dir>       Directory inside static-web. Defaults to mypilot.
  --base-url <url>         Public URL prefix. Defaults to GitHub Pages mypilot URL.
  --plugin-id <id>         Plugin id in release.xml. Defaults to publisher.name.
  --commit                 Commit release.xml and the VSIX in static-web.
  --push                   Push static-web after committing. Implies --commit.
  --dry-run                Validate and print the planned change without writing files.`)
}

function resolveExisting(inputPath, description) {
	const resolved = path.resolve(inputPath)
	if (!existsSync(resolved)) {
		throw new Error(`${description} not found: ${resolved}`)
	}
	return resolved
}

function runGit(cwd, args, options = {}) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
	})
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeXmlAttribute(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

function setTagAttribute(tag, name, value) {
	const escapedName = escapeRegExp(name)
	const attrPattern = new RegExp(`\\b${escapedName}="[^"]*"`)
	const replacement = `${name}="${escapeXmlAttribute(value)}"`
	if (attrPattern.test(tag)) {
		return tag.replace(attrPattern, replacement)
	}
	return tag.replace(/\s*>$/, ` ${replacement}>`)
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	const repoRoot = resolveExisting(args.repoPath, "Roo Code repository")
	const staticRoot = resolveExisting(
		args.staticWebPath ?? path.join(path.dirname(repoRoot), "static-web"),
		"static-web repository",
	)

	const packagePath = resolveExisting(path.join(repoRoot, "src", "package.json"), "extension package.json")
	const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
	const { name, publisher, version } = packageJson
	if (!name || !publisher || !version) {
		throw new Error("src/package.json must define name, publisher, and version")
	}

	const pluginId = args.pluginId ?? `${publisher}.${name}`
	const vsixPath = resolveExisting(args.vsixPath ?? path.join(repoRoot, "bin", `${name}-${version}.vsix`), "built VSIX")
	const targetFileName = path.basename(vsixPath)
	const targetDir = path.join(staticRoot, args.pluginDir)
	const targetPath = path.join(targetDir, targetFileName)
	const releaseXmlPath = resolveExisting(path.join(staticRoot, "release.xml"), "release.xml")
	const publicUrl = `${args.baseUrl.replace(/\/+$/, "")}/${targetFileName}`

	console.log(`Repo:       ${repoRoot}`)
	console.log(`Static web: ${staticRoot}`)
	console.log(`Plugin:     ${pluginId}`)
	console.log(`Version:    ${version}`)
	console.log(`VSIX:       ${vsixPath}`)
	console.log(`Target:     ${targetPath}`)
	console.log(`URL:        ${publicUrl}`)

	const releaseText = readFileSync(releaseXmlPath, "utf8")
	const pluginTagPattern = new RegExp(`<plugin\\b(?=[^>]*\\bid="${escapeRegExp(pluginId)}")[^>]*>`)
	const pluginTagMatch = releaseText.match(pluginTagPattern)
	if (!pluginTagMatch || pluginTagMatch.index === undefined) {
		throw new Error(`Plugin start tag for '${pluginId}' not found in ${releaseXmlPath}`)
	}

	if (args.dryRun) {
		console.log("Dry run complete; no files changed.")
		return
	}

	mkdirSync(targetDir, { recursive: true })
	copyFileSync(vsixPath, targetPath)

	let updatedTag = setTagAttribute(pluginTagMatch[0], "url", publicUrl)
	updatedTag = setTagAttribute(updatedTag, "version", version)
	const updatedReleaseText =
		releaseText.slice(0, pluginTagMatch.index) +
		updatedTag +
		releaseText.slice(pluginTagMatch.index + pluginTagMatch[0].length)
	writeFileSync(releaseXmlPath, updatedReleaseText, "utf8")

	console.log("Updated static-web release files.")
	process.stdout.write(runGit(staticRoot, ["status", "--short"]))
	process.stdout.write(runGit(staticRoot, ["diff", "--", "release.xml"]))

	if (args.commit) {
		runGit(staticRoot, ["add", "--", "release.xml", path.posix.join(args.pluginDir, targetFileName)], { inherit: true })
		runGit(staticRoot, ["commit", "-m", `add ${name}-${version}`], { inherit: true })
	}

	if (args.push) {
		runGit(staticRoot, ["push"], { inherit: true })
	}
}

try {
	main()
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}

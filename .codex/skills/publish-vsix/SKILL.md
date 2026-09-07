---
name: publish-vsix
description: Publish an already-built Roo Code VSIX extension package to the sibling static-web update site. Use when Codex needs to release or publish a compiled .vsix file by copying the versioned roo-cline VSIX from bin into static-web/mypilot, updating static-web/release.xml for RooVeterinaryInc.roo-cline, and optionally committing or pushing the static-web release changes.
---

# Publish VSIX

## Overview

Publish the VSIX that already exists in `bin/` from this Roo Code repository to the sibling `static-web` repository used as the update site. This skill mirrors the release pattern from `static-web` commits `ef7f9d61770c910e5ce855bff56a32d36bbb69db` and `2f82640f213e130ece9f45baf643220c75e09e95`: add `mypilot/roo-cline-<version>.vsix` and update the matching `<plugin>` entry in `release.xml`.

## Workflow

1. Verify the current repository is the Roo Code extension repository.
2. Read `src/package.json` and derive:
    - `name`, usually `roo-cline`
    - `publisher`, usually `RooVeterinaryInc`
    - `version`, for example `3.25.118`
    - plugin id as `<publisher>.<name>`, for example `RooVeterinaryInc.roo-cline`
3. Verify the built VSIX exists at `bin/<name>-<version>.vsix`. Do not run `pnpm vsix` unless the user explicitly asks to build; this publishing skill is for already compiled files.
4. Update the sibling static site repository, defaulting to `../static-web` from the Roo Code repo root:
    - copy the VSIX to `mypilot/<name>-<version>.vsix`
    - update `release.xml` so the `<plugin id="<publisher>.<name>">` has `version="<version>"`
    - update the same plugin `url` to `https://tjlcast.github.io/static-web/mypilot/<name>-<version>.vsix`
    - preserve existing child elements such as `chat_endpoint`, `model`, and `marketplace_mcp` unless the user explicitly requests changes
5. Inspect the `static-web` diff. The expected diff is one added VSIX binary plus a `release.xml` version/url change.
6. Commit and push only when requested. Use a concise commit message such as `add roo-cline-<version>`.

## Script

Use `scripts/publish-vsix.mjs` for the deterministic file copy and XML update. This script is cross-platform and only needs Node.js, which this repository already requires.

```bash
node .codex/skills/publish-vsix/scripts/publish-vsix.mjs
```

Useful options:

- `--repo-path <path>`: Roo Code repository root. Defaults to the current working directory.
- `--static-web-path <path>`: static-web repository. Defaults to `../static-web`.
- `--vsix-path <path>`: publish a specific VSIX instead of deriving `bin/<name>-<version>.vsix`.
- `--base-url <url>`: public URL prefix. Defaults to `https://tjlcast.github.io/static-web/mypilot`.
- `--commit`: commit the static-web changes after updating files.
- `--push`: push the static-web branch after committing; implies `--commit`.
- `--dry-run`: validate inputs and report the planned change without writing files.

## Validation

After running the script:

```bash
git -C ../static-web diff -- release.xml
git -C ../static-web status --short
```

Check that `release.xml` references the same version as `src/package.json`, the VSIX filename exists under `static-web/mypilot`, and the URL matches the copied filename. If committing, include both `release.xml` and the new VSIX in the same commit.

Do not change `chat_endpoint`, `model`, or other plugin metadata unless the user explicitly asks; commit `2f82640f213e130ece9f45baf643220c75e09e95` changed those because that release required it, not because every VSIX publish should.

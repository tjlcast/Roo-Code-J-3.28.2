import * as fs from "fs"
import * as path from "path"
import { workspace } from "vscode"

export class PromptManager {
	private groups: Group[] = []
	private prompts: Prompt[] = []
	private promptManagerPath: string

	constructor() {
		// 获取工作区根路径
		const workspaceRoot = workspace.rootPath || "."
		this.promptManagerPath = path.join(workspaceRoot, ".roo", "promptmanager")
		console.log(`PromptManager 路径: ${this.promptManagerPath}`)

		// 确保目录存在
		if (!fs.existsSync(this.promptManagerPath)) {
			try {
				fs.mkdirSync(this.promptManagerPath, { recursive: true })
				console.log(`创建根目录: ${this.promptManagerPath}`)
			} catch (error) {
				console.error("Failed to create prompt manager directory:", error)
				throw new Error(`无法创建目录: ${this.promptManagerPath}`)
			}
		}

		this.loadGroups()
		this.loadPrompts()
		console.log(`加载了 ${this.groups.length} 个分组和 ${this.prompts.length} 个提示词`)
	}

	// 添加分组 (创建目录)
	addGroup(groupName: string): void {
		if (!groupName.trim()) {
			throw new Error("分组名称不能为空")
		}

		// 检查是否已存在同名分组
		const existingGroup = this.groups.find((g) => g.name === groupName)
		if (existingGroup) {
			throw new Error(`分组 "${groupName}" 已存在`)
		}

		const newGroup: Group = {
			id: this.generateId(),
			name: groupName,
			createdAt: new Date(),
		}

		this.groups.push(newGroup)

		// 创建对应的目录
		const groupPath = path.join(this.promptManagerPath, groupName)
		try {
			if (!fs.existsSync(groupPath)) {
				fs.mkdirSync(groupPath, { recursive: true })
				console.log(`分组目录创建成功: ${groupPath}`)
			}
		} catch (error) {
			console.error("Failed to create group directory:", error)
			throw new Error(`无法创建分组目录: ${groupPath}`)
		}

		this.saveGroups()
	}

	// 删除分组 (删除目录)
	deleteGroup(groupId: string): void {
		const group = this.groups.find((g) => g.id === groupId)
		if (!group) {
			throw new Error("分组不存在")
		}

		this.groups = this.groups.filter((g) => g.id !== groupId)

		// 删除对应目录下的所有提示词
		this.prompts = this.prompts.filter((prompt) => prompt.groupId !== groupId)

		// 删除目录
		const groupPath = path.join(this.promptManagerPath, group.name)
		if (fs.existsSync(groupPath)) {
			try {
				fs.rmSync(groupPath, { recursive: true, force: true })
				console.log(`分组目录删除成功: ${groupPath}`)
			} catch (error) {
				console.error("Failed to delete group directory:", error)
				throw new Error(`无法删除分组目录: ${groupPath}`)
			}
		}

		this.saveGroups()
		this.savePrompts()
	}

	// 添加提示词 (创建文件)
	addPrompt(promptData: Partial<Prompt>): void {
		if (!promptData.name || !promptData.name.trim()) {
			throw new Error("提示词名称不能为空")
		}

		if (!promptData.groupId) {
			throw new Error("请选择分组")
		}

		const group = this.groups.find((g) => g.id === promptData.groupId)
		if (!group) {
			throw new Error("分组不存在")
		}

		// 检查是否已存在同名提示词
		const existingPrompt = this.prompts.find((p) => p.groupId === promptData.groupId && p.name === promptData.name)
		if (existingPrompt) {
			throw new Error(`提示词 "${promptData.name}" 已存在`)
		}

		const newPrompt: Prompt = {
			id: this.generateId(),
			name: promptData.name.trim(),
			groupId: promptData.groupId,
			template: promptData.template || "",
			parameters: promptData.parameters || "",
			placeholder: promptData.placeholder || "",
			isPublic: promptData.isPublic || false,
			outputMarkdown: promptData.outputMarkdown || false,
			createdAt: new Date(),
		}

		this.prompts.push(newPrompt)

		// 创建提示词文件
		const promptFilePath = path.join(this.promptManagerPath, group.name, `${newPrompt.name}.prompt`)
		try {
			fs.writeFileSync(promptFilePath, newPrompt.template, "utf8")
			console.log(`提示词文件创建成功: ${promptFilePath}`)
		} catch (error) {
			console.error("Failed to create prompt file:", error)
			throw new Error(`无法创建提示词文件: ${promptFilePath}`)
		}

		this.savePrompts()
	}

	// 删除提示词 (删除文件)
	deletePrompt(promptId: string): void {
		const prompt = this.prompts.find((p) => p.id === promptId)
		if (!prompt) {
			throw new Error("提示词不存在")
		}

		const group = this.groups.find((g) => g.id === prompt.groupId)
		if (!group) {
			throw new Error("分组不存在")
		}

		this.prompts = this.prompts.filter((p) => p.id !== promptId)

		// 删除提示词文件
		const promptFilePath = path.join(this.promptManagerPath, group.name, `${prompt.name}.prompt`)
		if (fs.existsSync(promptFilePath)) {
			try {
				fs.unlinkSync(promptFilePath)
				console.log(`提示词文件删除成功: ${promptFilePath}`)
			} catch (error) {
				console.error("Failed to delete prompt file:", error)
				throw new Error(`无法删除提示词文件: ${promptFilePath}`)
			}
		}

		this.savePrompts()
	}

	// 获取所有分组
	getGroups(): Group[] {
		return [...this.groups]
	}

	// 获取指定分组下的所有提示词
	getPromptsByGroupId(groupId: string): Prompt[] {
		return this.prompts.filter((prompt) => prompt.groupId === groupId)
	}

	// 获取提示词详情
	getPromptById(promptId: string): Prompt | undefined {
		return this.prompts.find((prompt) => prompt.id === promptId)
	}

	// 根据名称查找提示词
	getPromptByName(groupId: string, promptName: string): Prompt | undefined {
		return this.prompts.find((prompt) => prompt.groupId === groupId && prompt.name === promptName)
	}

	// 保存分组到文件系统
	private saveGroups(): void {
		// 可以在这里添加将分组信息保存到配置文件的逻辑
		// 目前主要依赖目录结构
	}

	// 保存提示词到文件系统
	private savePrompts(): void {
		// 可以在这里添加将提示词元数据保存到配置文件的逻辑
		// 目前主要依赖文件系统
	}

	// 加载分组 (从目录结构读取)
	private loadGroups(): void {
		try {
			const items = fs.readdirSync(this.promptManagerPath, { withFileTypes: true })
			const dirItems = items.filter((item) => item.isDirectory())

			// 从目录结构加载所有分组
			for (const item of dirItems) {
				const existingGroup = this.groups.find((g) => g.name === item.name)
				if (!existingGroup) {
					this.groups.push({
						id: this.generateId(),
						name: item.name,
						createdAt: new Date(),
					})
				}
			}

			console.log(`从文件系统加载了 ${this.groups.length} 个分组`)
		} catch (error) {
			console.error("Error loading groups from filesystem:", error)
		}
	}

	// 加载提示词 (从文件读取)
	private loadPrompts(): void {
		try {
			for (const group of this.groups) {
				const groupPath = path.join(this.promptManagerPath, group.name)
				if (!fs.existsSync(groupPath)) continue

				const files = fs.readdirSync(groupPath, { withFileTypes: true })
				const promptFiles = files.filter((file) => file.isFile() && file.name.endsWith(".prompt"))

				for (const file of promptFiles) {
					const promptName = file.name.replace(".prompt", "")
					const promptFilePath = path.join(groupPath, file.name)

					try {
						const template = fs.readFileSync(promptFilePath, "utf8")

						// 检查是否已存在该提示词
						const existingPrompt = this.prompts.find((p) => p.groupId === group.id && p.name === promptName)

						if (!existingPrompt) {
							this.prompts.push({
								id: this.generateId(),
								name: promptName,
								groupId: group.id,
								template: template,
								parameters: "",
								placeholder: "",
								isPublic: false,
								outputMarkdown: false,
								createdAt: new Date(),
							})
						}
					} catch (error) {
						console.error(`Error reading prompt file ${promptFilePath}:`, error)
					}
				}
			}

			console.log(`从文件系统加载了 ${this.prompts.length} 个提示词`)
		} catch (error) {
			console.error("Error loading prompts from filesystem:", error)
		}
	}

	// 生成唯一ID
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2)
	}
}

export interface Group {
	id: string
	name: string
	createdAt: Date
}

export interface Prompt {
	id: string
	name: string
	groupId: string
	template: string
	parameters: string
	placeholder: string
	isPublic: boolean
	outputMarkdown: boolean
	createdAt: Date
}

import * as vscode from "vscode"
import { PromptManager } from "./promptManager"

export function registerPromptManager(context: vscode.ExtensionContext) {
	let promptManager: PromptManager | null = null

	context.subscriptions.push(
		vscode.commands.registerCommand("roo-cline.openPromptManager", () => {
			// 创建并显示新的面板
			const panel = vscode.window.createWebviewPanel("promptManager", "提示词管理工具", vscode.ViewColumn.One, {
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "src", "tjl", "promptmanager")],
			})

			// 初始化PromptManager
			try {
				promptManager = new PromptManager()
			} catch (error) {
				vscode.window.showErrorMessage(`初始化提示词管理器失败: ${error}`)
				return
			}

			// 设置 HTML 内容
			panel.webview.html = getPromptManagerWebviewContent(context, panel)

			// 处理来自 webview 的消息
			panel.webview.onDidReceiveMessage(
				async (message) => {
					try {
						switch (message.command) {
							case "getInitialData":
								if (promptManager) {
									const groups = promptManager.getGroups()
									panel.webview.postMessage({
										command: "updateGroups",
										groups: groups,
									})
								}
								break

							case "addNewGroup":
								if (promptManager && message.groupName) {
									promptManager.addGroup(message.groupName)
									const groups = promptManager.getGroups()
									panel.webview.postMessage({
										command: "updateGroups",
										groups: groups,
									})
									panel.webview.postMessage({
										command: "alert",
										text: `分组 "${message.groupName}" 添加成功`,
									})
								}
								break

							case "deleteGroup":
								if (promptManager && message.groupId) {
									promptManager.deleteGroup(message.groupId)
									const groups = promptManager.getGroups()
									panel.webview.postMessage({
										command: "updateGroups",
										groups: groups,
									})
									panel.webview.postMessage({
										command: "alert",
										text: `分组删除成功`,
									})
								}
								break

							case "addPrompt":
								if (promptManager && message.promptData) {
									promptManager.addPrompt(message.promptData)
									panel.webview.postMessage({
										command: "alert",
										text: `提示词 "${message.promptData.name}" 添加成功`,
									})
									// 清空表单
									panel.webview.postMessage({
										command: "clearForm",
									})
								}
								break

							case "deletePrompt":
								if (promptManager && message.promptId) {
									promptManager.deletePrompt(message.promptId)
									panel.webview.postMessage({
										command: "alert",
										text: "提示词删除成功",
									})
								}
								break

							case "getPromptsByGroup":
								if (promptManager && message.groupId) {
									const prompts = promptManager.getPromptsByGroupId(message.groupId)
									panel.webview.postMessage({
										command: "updatePrompts",
										prompts: prompts,
									})
								}
								break

							case "alert":
								vscode.window.showInformationMessage(message.text)
								break

							case "error":
								vscode.window.showErrorMessage(message.text)
								break
						}
					} catch (error) {
						console.error("处理消息时出错:", error)
						panel.webview.postMessage({
							command: "error",
							text: `操作失败: ${error}`,
						})
					}
				},
				undefined,
				context.subscriptions,
			)
		}),
	)
}

function getPromptManagerWebviewContent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): string {
	return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>提示词管理工具</title>
    <style>
        ${getWebviewStyles()}
    </style>
</head>
<body>
    <div class="prompt-manager-container">
        <div class="sidebar">
            <h3>提示词分组</h3>
            <div class="groups-list" id="groups-list">
                <div class="loading">加载中...</div>
            </div>
            <div class="group-actions">
                <input type="text" id="new-group-name" placeholder="请输入分组名称">
                <button id="add-group-btn">添加分组</button>
            </div>
        </div>
        
        <div class="main-content">
            <div class="prompt-form" id="prompt-form">
                <h3>提示词管理</h3>
                
                <div class="form-group">
                    <label for="prompt-group">选择分组：</label>
                    <select id="prompt-group">
                        <option value="">请选择分组</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="prompt-name">提示词名称：</label>
                    <input type="text" id="prompt-name" placeholder="请输入提示词名称">
                </div>
                
                <div class="form-group">
                    <label for="prompt-template">提示词模板：</label>
                    <textarea id="prompt-template" placeholder="请输入提示词模板"></textarea>
                </div>
                
                <div class="form-group">
                    <label for="prompt-parameters">提示词参数：</label>
                    <textarea id="prompt-parameters" placeholder="请输入提示词参数，每行一个参数"></textarea>
                </div>
                
                <div class="form-group">
                    <label for="prompt-placeholder">占位符：</label>
                    <input type="text" id="prompt-placeholder" placeholder="请输入占位符">
                </div>
                
                <div class="form-group checkbox">
                    <input type="checkbox" id="is-public">
                    <label for="is-public">是否公开</label>
                </div>
                
                <div class="form-group checkbox">
                    <input type="checkbox" id="output-markdown">
                    <label for="output-markdown">是否输出markdown格式</label>
                </div>
                
                <div class="form-actions">
                    <button id="save-prompt-btn">保存提示词</button>
                    <button id="delete-prompt-btn" style="display: none;">删除提示词</button>
                </div>
            </div>
            
            <div class="prompt-history" id="prompt-history">
                <h4>分组提示词列表</h4>
                <div id="prompts-list" class="loading">请选择分组查看提示词</div>
            </div>
        </div>
    </div>

    <script>
        ${getWebviewScript()}
    </script>
</body>
</html>`
}

function getWebviewStyles(): string {
	return `
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
        }
        
        .prompt-manager-container {
            display: flex;
            height: 100vh;
            width: 100%;
            gap: 20px;
            padding: 20px;
        }
        
        .sidebar {
            width: 300px;
            background-color: var(--vscode-sideBar-background);
            padding: 20px;
            border-right: 1px solid var(--vscode-sideBar-border);
            border-radius: 4px;
            display: flex;
            flex-direction: column;
        }
        
        .main-content {
            flex: 1;
            background-color: var(--vscode-sideBar-background);
            padding: 20px;
            border-radius: 4px;
            border: 1px solid var(--vscode-sideBar-border);
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        h3, h4 {
            margin: 0 0 15px 0;
            color: var(--vscode-foreground);
        }
        
        .groups-list {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 20px;
        }
        
        .group-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .group-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .group-item span {
            font-size: 14px;
            color: var(--vscode-foreground);
        }
        
        .group-item button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .group-item button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .group-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .group-actions input[type="text"] {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
        }
        
        .group-actions button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
        }
        
        .group-actions button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        
        .form-group input[type="text"],
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
        }
        
        .form-group textarea {
            min-height: 100px;
            resize: vertical;
        }
        
        .form-group.checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .form-group.checkbox label {
            margin-bottom: 0;
            font-weight: normal;
            cursor: pointer;
        }
        
        .form-group.checkbox input[type="checkbox"] {
            width: auto;
        }
        
        .form-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        
        .form-actions button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }
        
        .form-actions button:first-child {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .form-actions button:first-child:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .form-actions button:last-child {
            background-color: var(--vscode-errorForeground);
            color: white;
        }
        
        .form-actions button:last-child:hover {
            background-color: var(--vscode-inputValidation-errorBackground);
        }
        
        .prompt-history {
            margin-top: 30px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .prompt-history h4 {
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }
        
        #prompts-list {
            flex: 1;
            overflow-y: auto;
            border: 1px solid var(--vscode-sideBar-border);
            padding: 10px;
            border-radius: 4px;
            background-color: var(--vscode-editor-background);
        }
        
        .prompt-item {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
            cursor: pointer;
        }
        
        .prompt-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .prompt-item:last-child {
            border-bottom: none;
        }
        
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100px;
            color: var(--vscode-descriptionForeground);
        }
        
        .error {
            color: var(--vscode-errorForeground);
            padding: 10px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border-radius: 4px;
            margin: 10px 0;
        }
    `
}

function getWebviewScript(): string {
	return `
        const vscode = acquireVsCodeApi();
        let currentGroupId = '';
        let currentPromptId = '';
        
        // 初始化事件监听
        document.addEventListener('DOMContentLoaded', function() {
            // 绑定添加分组按钮事件
            const addGroupBtn = document.getElementById('add-group-btn');
            if (addGroupBtn) {
                addGroupBtn.addEventListener('click', addNewGroup);
            }
            
            // 绑定回车键添加分组
            const groupNameInput = document.getElementById('new-group-name');
            if (groupNameInput) {
                groupNameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        addNewGroup();
                    }
                });
            }
            
            // 绑定保存提示词按钮
            const savePromptBtn = document.getElementById('save-prompt-btn');
            if (savePromptBtn) {
                savePromptBtn.addEventListener('click', savePrompt);
            }
            
            // 绑定删除提示词按钮
            const deletePromptBtn = document.getElementById('delete-prompt-btn');
            if (deletePromptBtn) {
                deletePromptBtn.addEventListener('click', deletePrompt);
            }
            
            // 绑定分组选择变化事件
            const promptGroupSelect = document.getElementById('prompt-group');
            if (promptGroupSelect) {
                promptGroupSelect.addEventListener('change', function() {
                    currentGroupId = this.value;
                    if (currentGroupId) {
                        vscode.postMessage({
                            command: 'getPromptsByGroup',
                            groupId: currentGroupId
                        });
                    } else {
                        updatePromptsList([]);
                    }
                });
            }
            
            // 请求初始数据
            vscode.postMessage({ command: 'getInitialData' });
        });
        
        // 添加分组
        function addNewGroup() {
            const groupNameInput = document.getElementById('new-group-name');
            const groupName = groupNameInput.value.trim();
            
            if (groupName) {
                vscode.postMessage({
                    command: 'addNewGroup',
                    groupName: groupName
                });
                groupNameInput.value = '';
            } else {
                vscode.postMessage({
                    command: 'error',
                    text: '请输入分组名称'
                });
            }
        }
        
        // 删除分组
        function deleteGroup(groupId, groupName) {
            if (confirm('确定要删除分组 "' + groupName + '" 吗？此操作将删除该分组下的所有提示词！')) {
                vscode.postMessage({
                    command: 'deleteGroup',
                    groupId: groupId,
                    groupName: groupName
                });
            }
        }
        
        // 保存提示词
        function savePrompt() {
            const promptName = document.getElementById('prompt-name').value.trim();
            const groupId = document.getElementById('prompt-group').value;
            const template = document.getElementById('prompt-template').value;
            const parameters = document.getElementById('prompt-parameters').value;
            const placeholder = document.getElementById('prompt-placeholder').value;
            const isPublic = document.getElementById('is-public').checked;
            const outputMarkdown = document.getElementById('output-markdown').checked;
            
            if (!promptName || !groupId) {
                vscode.postMessage({
                    command: 'error',
                    text: '请输入提示词名称并选择分组'
                });
                return;
            }
            
            vscode.postMessage({
                command: 'addPrompt',
                promptData: {
                    name: promptName,
                    groupId: groupId,
                    template: template,
                    parameters: parameters,
                    placeholder: placeholder,
                    isPublic: isPublic,
                    outputMarkdown: outputMarkdown
                }
            });
        }
        
        // 删除提示词
        function deletePrompt() {
            if (currentPromptId) {
                if (confirm('确定要删除这个提示词吗？')) {
                    vscode.postMessage({
                        command: 'deletePrompt',
                        promptId: currentPromptId
                    });
                    clearForm();
                }
            } else {
                vscode.postMessage({
                    command: 'error',
                    text: '请先选择要删除的提示词'
                });
            }
        }
        
        // 选择提示词
        function selectPrompt(promptId, promptName, template, parameters, placeholder, isPublic, outputMarkdown) {
            currentPromptId = promptId;
            document.getElementById('prompt-name').value = promptName;
            document.getElementById('prompt-template').value = template;
            document.getElementById('prompt-parameters').value = parameters;
            document.getElementById('prompt-placeholder').value = placeholder;
            document.getElementById('is-public').checked = isPublic;
            document.getElementById('output-markdown').checked = outputMarkdown;
            
            // 显示删除按钮
            document.getElementById('delete-prompt-btn').style.display = 'block';
        }
        
        // 清空表单
        function clearForm() {
            document.getElementById('prompt-name').value = '';
            document.getElementById('prompt-template').value = '';
            document.getElementById('prompt-parameters').value = '';
            document.getElementById('prompt-placeholder').value = '';
            document.getElementById('is-public').checked = false;
            document.getElementById('output-markdown').checked = false;
            document.getElementById('delete-prompt-btn').style.display = 'none';
            currentPromptId = '';
        }
        
        // 更新分组列表
        function updateGroupsList(groups) {
            const groupsList = document.getElementById('groups-list');
            const promptGroupSelect = document.getElementById('prompt-group');
            
            if (groupsList) {
                if (groups.length === 0) {
                    groupsList.innerHTML = '<div class="loading">暂无分组，请添加分组</div>';
                } else {
                    groupsList.innerHTML = '';
                    groups.forEach(group => {
                        const groupItem = document.createElement('div');
                        groupItem.className = 'group-item';
                        groupItem.innerHTML = \`
                            <span>\${group.name}</span>
                            <button onclick="deleteGroup('\${group.id}', '\${group.name}')">删除</button>
                        \`;
                        groupsList.appendChild(groupItem);
                    });
                }
            }
            
            if (promptGroupSelect) {
                promptGroupSelect.innerHTML = '<option value="">请选择分组</option>';
                groups.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.id;
                    option.textContent = group.name;
                    promptGroupSelect.appendChild(option);
                });
            }
        }
        
        // 更新提示词列表
        function updatePromptsList(prompts) {
            const promptsList = document.getElementById('prompts-list');
            
            if (prompts.length === 0) {
                promptsList.innerHTML = '<div class="loading">该分组下暂无提示词</div>';
            } else {
                promptsList.innerHTML = '';
                prompts.forEach(prompt => {
                    const promptItem = document.createElement('div');
                    promptItem.className = 'prompt-item';
                    promptItem.innerHTML = \`
                        <strong>\${prompt.name}</strong>
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                            \${prompt.template.substring(0, 100)}\${prompt.template.length > 100 ? '...' : ''}
                        </div>
                    \`;
                    promptItem.addEventListener('click', () => {
                        selectPrompt(
                            prompt.id,
                            prompt.name,
                            prompt.template,
                            prompt.parameters,
                            prompt.placeholder,
                            prompt.isPublic,
                            prompt.outputMarkdown
                        );
                    });
                    promptsList.appendChild(promptItem);
                });
            }
        }
        
        // 处理来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateGroups':
                    updateGroupsList(message.groups);
                    break;
                case 'updatePrompts':
                    updatePromptsList(message.prompts);
                    break;
                case 'clearForm':
                    clearForm();
                    break;
                case 'alert':
                    alert(message.text);
                    break;
                case 'error':
                    alert('错误: ' + message.text);
                    break;
            }
        });
    `
}

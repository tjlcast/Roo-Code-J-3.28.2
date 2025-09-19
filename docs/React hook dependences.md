你提出了一个非常常见的 React 开发问题！让我来帮你梳理一下依赖数组的使用最佳实践。

## 依赖数组的作用

依赖数组告诉 React 何时需要重新执行函数（如 [useEffect](https://reactjs.org/docs/hooks-reference.html#useeffect)、[useCallback](https://reactjs.org/docs/hooks-reference.html#usecallback)、[useMemo](https://reactjs.org/docs/hooks-reference.html#usememo) 等）。

## 通用原则

### 1. 包含函数中使用的所有外部变量

```jsx
function MyComponent({ userId, theme }) {
	const [data, setData] = useState(null)
	const [count, setCount] = useState(0)

	// ❌ 错误 - 缺少依赖
	useEffect(() => {
		fetchData(userId) // 使用了 userId 但没有在依赖数组中
	}, [])

	// ✅ 正确 - 包含所有使用的变量
	useEffect(() => {
		fetchData(userId)
	}, [userId]) // userId 是外部变量，需要包含在依赖中

	// ❌ 错误 - 缺少依赖
	const handleClick = useCallback(() => {
		console.log(`用户 ${userId} 点击了按钮，当前计数: ${count}`)
	}, [])

	// ✅ 正确 - 包含所有使用的变量
	const handleClick = useCallback(() => {
		console.log(`用户 ${userId} 点击了按钮，当前计数: ${count}`)
	}, [userId, count])
}
```

### 2. 不要包含在函数内部定义的变量

```jsx
function MyComponent({ userId }) {
	const [count, setCount] = useState(0)

	// ❌ 错误 - 包含了内部定义的变量
	useEffect(() => {
		const localValue = count * 2 // localValue 是内部定义的
		console.log(localValue)
	}, [count, localValue]) // localValue 不应该在依赖数组中

	// ✅ 正确
	useEffect(() => {
		const localValue = count * 2
		console.log(localValue)
	}, [count]) // 只包含外部依赖
}
```

## 不同 Hook 的依赖数组最佳实践

### useEffect

```jsx
function UserProfile({ userId }) {
	const [user, setUser] = useState(null)
	const [loading, setLoading] = useState(false)

	// 1. 数据获取 - 依赖触发条件
	useEffect(() => {
		const fetchUser = async () => {
			setLoading(true)
			try {
				const userData = await api.getUser(userId)
				setUser(userData)
			} catch (error) {
				console.error(error)
			} finally {
				setLoading(false)
			}
		}

		if (userId) {
			fetchUser()
		}
	}, [userId]) // 只有当 userId 改变时才重新获取

	// 2. 事件监听 - 成对出现
	useEffect(() => {
		const handleResize = () => {
			// 处理窗口大小变化
		}

		window.addEventListener("resize", handleResize)
		return () => {
			window.removeEventListener("resize", handleResize)
		}
	}, []) // 只在挂载和卸载时执行

	// 3. 定时器 - 注意清理
	useEffect(() => {
		const timer = setInterval(() => {
			// 定时任务
		}, 1000)

		return () => {
			clearInterval(timer)
		}
	}, []) // 只在挂载和卸载时执行
}
```

### useCallback

```jsx
function TodoList({ todos, onToggle, onDelete }) {
	const [filter, setFilter] = useState("all")

	// 1. 传递给子组件的回调函数 - 避免子组件不必要重渲染
	const handleToggle = useCallback(
		(id) => {
			onToggle(id)
		},
		[onToggle],
	) // 只有 onToggle 改变时才重新创建

	const handleDelete = useCallback(
		(id) => {
			onDelete(id)
		},
		[onDelete],
	)

	// 2. 使用内部状态的回调函数
	const handleFilterChange = useCallback((newFilter) => {
		setFilter(newFilter)
	}, []) // setFilter 是稳定的，不需要依赖

	// 3. 复杂计算的回调函数
	const getFilteredTodos = useCallback(() => {
		switch (filter) {
			case "active":
				return todos.filter((todo) => !todo.completed)
			case "completed":
				return todos.filter((todo) => todo.completed)
			default:
				return todos
		}
	}, [todos, filter]) // 依赖 todos 和 filter

	return (
		<div>
			<Filter onFilterChange={handleFilterChange} />
			{getFilteredTodos().map((todo) => (
				<TodoItem key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} />
			))}
		</div>
	)
}
```

### useMemo

```jsx
function ExpensiveComponent({ items, searchTerm, sortBy }) {
	// 1. 昂贵的计算 - 只在相关依赖改变时重新计算
	const filteredItems = useMemo(() => {
		console.log("重新过滤项目...")
		return items.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
	}, [items, searchTerm]) // 只有 items 或 searchTerm 改变时才重新计算

	// 2. 复杂排序 - 避免每次渲染都排序
	const sortedItems = useMemo(() => {
		console.log("重新排序项目...")
		return [...filteredItems].sort((a, b) => {
			if (sortBy === "name") {
				return a.name.localeCompare(b.name)
			}
			return a.date - b.date
		})
	}, [filteredItems, sortBy]) // 依赖过滤后的项目和排序方式

	return (
		<ul>
			{sortedItems.map((item) => (
				<li key={item.id}>{item.name}</li>
			))}
		</ul>
	)
}
```

## 常见陷阱和解决方案

### 1. 对象和数组依赖

```jsx
// ❌ 问题：对象每次渲染都是新引用
function BadExample() {
	const [count, setCount] = useState(0)

	const config = { theme: "dark", size: "large" } // 每次都是新对象

	useEffect(() => {
		// 这会每次渲染都执行
	}, [config]) // config 每次都是新引用

	return <div>{count}</div>
}

// ✅ 解决方案1：使用 useMemo
function GoodExample1() {
	const [count, setCount] = useState(0)

	const config = useMemo(
		() => ({
			theme: "dark",
			size: "large",
		}),
		[],
	) // 空依赖数组，只创建一次

	useEffect(() => {
		// 只在挂载时执行一次
	}, [config])

	return <div>{count}</div>
}

// ✅ 解决方案2：使用 useRef
function GoodExample2() {
	const [count, setCount] = useState(0)

	const configRef = useRef({ theme: "dark", size: "large" })

	useEffect(() => {
		// 只在挂载时执行一次
	}, [configRef.current])

	return <div>{count}</div>
}

// ✅ 解决方案3：拆分依赖
function GoodExample3({ theme, size }) {
	const [count, setCount] = useState(0)

	useEffect(() => {
		// 明确依赖具体的值
	}, [theme, size])

	return <div>{count}</div>
}
```

### 2. 函数依赖

```jsx
// ❌ 问题：函数每次都是新引用
function ParentComponent() {
	const [count, setCount] = useState(0)

	const handleClick = () => {
		// 每次渲染都是新函数
		setCount(count + 1)
	}

	return <ChildComponent onClick={handleClick} />
}

const ChildComponent = React.memo(({ onClick }) => {
	console.log("ChildComponent 渲染了")
	return <button onClick={onClick}>点击我</button>
})

// ✅ 解决方案：使用 useCallback
function ParentComponent() {
	const [count, setCount] = useState(0)

	const handleClick = useCallback(() => {
		setCount(count + 1)
	}, [count]) // 明确依赖 count

	return <ChildComponent onClick={handleClick} />
}
```

## 最佳实践总结

### 1. 依赖数组检查清单

当你写完一个 Hook 时，问自己：

1. **我的函数中使用了哪些外部变量？**

    - props
    - state
    - 其他 Hook 返回的值

2. **这些变量是否都应该在依赖数组中？**

    - 是的，除了 setState 函数和 useRef 返回的引用

3. **我是否包含了不应该包含的变量？**
    - 函数内部定义的变量
    - setState 函数
    - useRef 返回的引用

### 2. 特殊情况处理

```jsx
function Component({ onExternalChange }) {
	const [localState, setLocalState] = useState(0)

	// setState 函数是稳定的，不需要依赖
	const handleLocalChange = useCallback(() => {
		setLocalState((prev) => prev + 1) // 使用函数式更新避免依赖
	}, [])

	// useRef 返回的引用是稳定的
	const ref = useRef(null)
	useEffect(() => {
		ref.current?.focus()
	}, []) // 不需要依赖 ref.current

	// 复杂对象使用 useMemo
	const complexObject = useMemo(
		() => ({
			data: processData(localState),
			metadata: { timestamp: Date.now() },
		}),
		[localState],
	)

	return <div ref={ref}>内容</div>
}
```

### 3. 工具辅助

使用 ESLint 插件 [eslint-plugin-react-hooks](https://www.npmjs.com/package/eslint-plugin-react-hooks) 可以帮助你检查依赖数组是否正确：

```json
{
	"plugins": ["react-hooks"],
	"rules": {
		"react-hooks/rules-of-hooks": "error",
		"react-hooks/exhaustive-deps": "warn"
	}
}
```

遵循这些原则，你就能够正确地使用依赖数组，避免不必要的重新渲染和潜在的 bug。

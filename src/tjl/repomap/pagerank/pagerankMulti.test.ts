import { MultiDiGraph } from "./pagerankMulti"

// run:
// cd src; pnpm test tjl/repomap/pagerank/pagerankMulti.test.ts

describe("MultiDiGraph", () => {
	test("should perform basic graph operations", () => {
		const graph = new MultiDiGraph<string>()

		// Add nodes
		expect(graph.addNode("A")).toBe(true)
		expect(graph.addNode("B")).toBe(true)
		expect(graph.addNode("C")).toBe(true)
		expect(graph.addNode("A")).toBe(false) // Duplicate add should return false

		// Add edges
		const edge1 = graph.addEdge("A", "B", 1.0)
		const edge2 = graph.addEdge("A", "B", 2.0) // Multiple edges
		const edge3 = graph.addEdge("B", "C", 1.5)

		expect(graph.nodeCount()).toBe(3)
		expect(graph.edgeCount()).toBe(3)
		expect(graph.outDegree("A")).toBe(2)
		expect(graph.inDegree("B")).toBe(2)
		expect(graph.outDegreeWeight("A")).toBe(3.0)

		// Check multiple edges
		const edgesAB = graph.getEdgesBetween("A", "B")
		expect(edgesAB.length).toBe(2)

		// Remove edge
		expect(graph.removeEdge(edge1)).toBe(true)
		expect(graph.edgeCount()).toBe(2)
		expect(graph.outDegree("A")).toBe(1)
	})

	test("should calculate personalized PageRank", () => {
		const graph = new MultiDiGraph<string>()

		// Create a simple graph: A -> B -> C -> A
		graph.addEdge("A", "B", 1.0)
		graph.addEdge("B", "C", 1.0)
		graph.addEdge("C", "A", 1.0)

		// Test default PageRank
		const pr1 = graph.personalizedPageRank(null, 0.85, 100, 1e-6, null)

		// Test personalized PageRank, bias towards node A
		const personalization = new Map<string, number>([
			["A", 1.0],
			["B", 0.0],
			["C", 0.0],
		])

		const pr2 = graph.personalizedPageRank(personalization, 0.85, 100, 1e-6, null)

		// A should have the highest PageRank value
		expect(pr2.get("A")!).toBeGreaterThan(pr2.get("B")!)
		expect(pr2.get("A")!).toBeGreaterThan(pr2.get("C")!)
	})

	test("should handle edge attributes", () => {
		const graph = new MultiDiGraph<string>()

		const attrs = new Map<string, string>([
			["type", "important"],
			["custom_weight", "5.0"],
		])

		const edgeId = graph.addEdgeWithAttributes("A", "B", 1.0, attrs)

		// Use custom weight attribute for PageRank calculation
		const pr = graph.personalizedPageRank(null, 0.85, 100, 1e-6, "custom_weight")
		expect(pr.size).toBe(2)
	})

	test("should handle uniform PageRank in symmetric graph", () => {
		const graph = new MultiDiGraph<string>()
		graph.addEdge("A", "B", 1.0)
		graph.addEdge("B", "C", 1.0)
		graph.addEdge("C", "A", 1.0)

		const pr = graph.personalizedPageRank(null, 0.85, 100, 1e-6, null)

		// Due to symmetric ring graph, expect each node value to be roughly equal
		const avg = 1.0 / 3.0
		for (const value of pr.values()) {
			expect(Math.abs(value - avg)).toBeLessThan(1e-4)
		}
	})

	test("should handle personalized bias", () => {
		const graph = new MultiDiGraph<string>()
		graph.addEdge("A", "B", 1.0)
		graph.addEdge("B", "C", 1.0)
		graph.addEdge("C", "A", 1.0)

		const personalization = new Map<string, number>([
			["A", 1.0],
			["B", 0.0],
			["C", 0.0],
		])

		const pr = graph.personalizedPageRank(personalization, 0.85, 100, 1e-6, null)

		// A should have higher weight
		expect(pr.get("A")!).toBeGreaterThan(pr.get("B")!)
		expect(pr.get("A")!).toBeGreaterThan(pr.get("C")!)
	})
})

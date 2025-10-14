/**
 * Multi Directed Graph implementation for PageRank calculations
 */

export interface Edge<T> {
	to: T
	weight: number
	id: number
	attributes: Map<string, string>
}

export class MultiDiGraph<T> {
	private adjacency: Map<T, Edge<T>[]> = new Map()
	private reverseAdjacency: Map<T, Edge<T>[]> = new Map()
	private nodes: T[] = []
	private nextEdgeId: number = 0
	private nodeAttributes: Map<T, Map<string, string>> = new Map()

	constructor() {}

	/**
	 * Add a node to the graph
	 */
	public addNode(node: T): boolean {
		if (!this.adjacency.has(node)) {
			this.adjacency.set(node, [])
			this.reverseAdjacency.set(node, [])
			this.nodes.push(node)
			this.nodeAttributes.set(node, new Map())
			return true
		}
		return false
	}

	/**
	 * Add a node with attributes
	 */
	public addNodeWithAttributes(node: T, attributes: Map<string, string>): boolean {
		const isNew = this.addNode(node)
		const nodeAttrs = this.nodeAttributes.get(node)
		if (nodeAttrs) {
			for (const [key, value] of attributes.entries()) {
				nodeAttrs.set(key, value)
			}
		}
		return isNew
	}

	/**
	 * Add a weighted edge, supporting multiple edges
	 */
	public addEdge(from: T, to: T, weight: number): number {
		// Ensure nodes exist
		this.addNode(from)
		this.addNode(to)

		const edgeId = this.nextEdgeId++

		// Add to forward adjacency list
		const edge: Edge<T> = {
			to,
			weight,
			id: edgeId,
			attributes: new Map(),
		}

		const outEdges = this.adjacency.get(from)
		if (outEdges) {
			outEdges.push(edge)
		}

		// Add to reverse adjacency list
		const reverseEdge: Edge<T> = {
			to: from,
			weight,
			id: edgeId,
			attributes: new Map(),
		}

		const inEdges = this.reverseAdjacency.get(to)
		if (inEdges) {
			inEdges.push(reverseEdge)
		}

		return edgeId
	}

	/**
	 * Add an edge with attributes
	 */
	public addEdgeWithAttributes(from: T, to: T, weight: number, attributes: Map<string, string>): number {
		const edgeId = this.addEdge(from, to, weight)

		// Update edge attributes
		const outEdges = this.adjacency.get(from)
		if (outEdges) {
			const edge = outEdges.find((e) => e.id === edgeId)
			if (edge) {
				for (const [key, value] of attributes.entries()) {
					edge.attributes.set(key, value)
				}
			}
		}

		const inEdges = this.reverseAdjacency.get(to)
		if (inEdges) {
			const edge = inEdges.find((e) => e.id === edgeId)
			if (edge) {
				for (const [key, value] of attributes.entries()) {
					edge.attributes.set(key, value)
				}
			}
		}

		return edgeId
	}

	/**
	 * Remove an edge by ID
	 */
	public removeEdge(edgeId: number): boolean {
		let removed = false

		// Remove from forward adjacency list
		for (const edges of this.adjacency.values()) {
			const pos = edges.findIndex((e) => e.id === edgeId)
			if (pos !== -1) {
				edges.splice(pos, 1)
				removed = true
				break
			}
		}

		// Remove from reverse adjacency list
		for (const edges of this.reverseAdjacency.values()) {
			const pos = edges.findIndex((e) => e.id === edgeId)
			if (pos !== -1) {
				edges.splice(pos, 1)
				break
			}
		}

		return removed
	}

	/**
	 * Remove a node and all related edges
	 */
	public removeNode(node: T): boolean {
		if (!this.adjacency.has(node)) {
			return false
		}

		// Collect edge IDs to remove
		const edgeIdsToRemove: number[] = []

		// Collect outgoing edge IDs
		const outEdges = this.adjacency.get(node)
		if (outEdges) {
			edgeIdsToRemove.push(...outEdges.map((e) => e.id))
		}

		// Collect incoming edge IDs
		const inEdges = this.reverseAdjacency.get(node)
		if (inEdges) {
			edgeIdsToRemove.push(...inEdges.map((e) => e.id))
		}

		// Remove all related edges
		for (const edgeId of edgeIdsToRemove) {
			this.removeEdge(edgeId)
		}

		// Remove node
		this.adjacency.delete(node)
		this.reverseAdjacency.delete(node)
		this.nodeAttributes.delete(node)
		this.nodes = this.nodes.filter((n) => n !== node)

		return true
	}

	/**
	 * Get outgoing edges for a node
	 */
	public getOutEdges(node: T): Edge<T>[] | undefined {
		return this.adjacency.get(node)
	}

	/**
	 * Get incoming edges for a node
	 */
	public getInEdges(node: T): Edge<T>[] | undefined {
		return this.reverseAdjacency.get(node)
	}

	/**
	 * Get all edges between two nodes
	 */
	public getEdgesBetween(from: T, to: T): Edge<T>[] {
		const edges = this.adjacency.get(from)
		if (edges) {
			return edges.filter((edge) => edge.to === to)
		}
		return []
	}

	/**
	 * Check if an edge exists between nodes
	 */
	public hasEdge(from: T, to: T): boolean {
		return this.getEdgesBetween(from, to).length > 0
	}

	/**
	 * Get all nodes
	 */
	public getNodes(): T[] {
		return this.nodes
	}

	/**
	 * Get node count
	 */
	public nodeCount(): number {
		return this.nodes.length
	}

	/**
	 * Get edge count
	 */
	public edgeCount(): number {
		let count = 0
		for (const edges of this.adjacency.values()) {
			count += edges.length
		}
		return count
	}

	/**
	 * Get out-degree (edge count) for a node
	 */
	public outDegree(node: T): number {
		const edges = this.adjacency.get(node)
		return edges ? edges.length : 0
	}

	/**
	 * Get in-degree (edge count) for a node
	 */
	public inDegree(node: T): number {
		const edges = this.reverseAdjacency.get(node)
		return edges ? edges.length : 0
	}

	/**
	 * Get out-degree weight sum for a node
	 */
	public outDegreeWeight(node: T): number {
		const edges = this.adjacency.get(node)
		if (edges) {
			return edges.reduce((sum, edge) => sum + edge.weight, 0)
		}
		return 0
	}

	/**
	 * Get in-degree weight sum for a node
	 */
	public inDegreeWeight(node: T): number {
		const edges = this.reverseAdjacency.get(node)
		if (edges) {
			return edges.reduce((sum, edge) => sum + edge.weight, 0)
		}
		return 0
	}

	/**
	 * Get out-degree weights for all nodes
	 */
	private outDegreeWeights(): Map<T, number> {
		const outWeights = new Map<T, number>()

		for (const [node, edges] of this.adjacency.entries()) {
			const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0)
			outWeights.set(node, totalWeight)
		}

		return outWeights
	}

	/**
	 * Get node attribute
	 */
	public getNodeAttribute(node: T, key: string): string | undefined {
		const attrs = this.nodeAttributes.get(node)
		return attrs ? attrs.get(key) : undefined
	}

	/**
	 * Set node attribute
	 */
	public setNodeAttribute(node: T, key: string, value: string): boolean {
		const attrs = this.nodeAttributes.get(node)
		if (attrs) {
			attrs.set(key, value)
			return true
		}
		return false
	}

	/**
	 * Calculate personalized PageRank
	 *
	 * @param personalization - Personalization vector specifying "starting points" and their weights
	 * @param alpha - Damping factor, typically 0.85
	 * @param maxIter - Maximum iterations
	 * @param tolerance - Convergence tolerance
	 * @param weightKey - If specified, use the specified edge attribute as weight instead of default weight
	 */
	public personalizedPageRank(
		personalization: Map<T, number> | null,
		alpha: number = 0.85,
		maxIter: number = 100,
		tolerance: number = 1e-6,
		weightKey: string | null = null,
	): Map<T, number> {
		const n = this.nodes.length
		if (n === 0) {
			return new Map()
		}

		// Initialize personalization vector
		let personalizationMap: Map<T, number>
		if (personalization) {
			personalizationMap = personalization
		} else {
			// Default uniform distribution
			const uniformWeight = 1.0 / n
			personalizationMap = new Map()
			for (const node of this.nodes) {
				personalizationMap.set(node, uniformWeight)
			}
		}

		let totalPersonalization = 0
		for (const value of personalizationMap.values()) {
			totalPersonalization += value
		}

		// Normalize personalization vector
		const normalizedPersonalization = new Map<T, number>()
		if (totalPersonalization !== 0) {
			for (const [key, value] of personalizationMap.entries()) {
				normalizedPersonalization.set(key, value / totalPersonalization)
			}
		} else {
			const uniformWeight = 1.0 / n
			for (const node of this.nodes) {
				normalizedPersonalization.set(node, uniformWeight)
			}
		}

		// Calculate out-degree weights (support using edge attributes as weights)
		const outWeights = weightKey ? this.outDegreeWeightsByAttribute(weightKey) : this.outDegreeWeights()

		// Initialize PageRank values
		let pagerank = new Map<T, number>()
		for (const node of this.nodes) {
			pagerank.set(node, 1.0 / n)
		}

		// Iteratively calculate
		for (let iteration = 0; iteration < maxIter; iteration++) {
			const newPagerank = new Map<T, number>()

			// Initialize new PageRank values with personalization contribution
			for (const node of this.nodes) {
				const personalizationContrib = (1.0 - alpha) * (normalizedPersonalization.get(node) || 0)
				newPagerank.set(node, personalizationContrib)
			}

			// Calculate contributions from other nodes
			for (const [fromNode, edges] of this.adjacency.entries()) {
				const fromPagerank = pagerank.get(fromNode) || 0
				const outWeight = outWeights.get(fromNode) || 0

				if (outWeight > 0) {
					for (const edge of edges) {
						const edgeWeight = weightKey
							? parseFloat(edge.attributes.get(weightKey) || "") || edge.weight
							: edge.weight

						const contribution = alpha * fromPagerank * (edgeWeight / outWeight)
						const currentValue = newPagerank.get(edge.to) || 0
						newPagerank.set(edge.to, currentValue + contribution)
					}
				}
			}

			// Handle dangling nodes (nodes with no outgoing edges)
			let hangingMass = 0
			for (const node of this.nodes) {
				if ((outWeights.get(node) || 0) === 0) {
					hangingMass += pagerank.get(node) || 0
				}
			}

			// Redistribute hanging mass according to personalization vector
			for (const node of this.nodes) {
				const hangingContrib = alpha * hangingMass * (normalizedPersonalization.get(node) || 0)
				const currentValue = newPagerank.get(node) || 0
				newPagerank.set(node, currentValue + hangingContrib)
			}

			// Check convergence
			let diff = 0
			for (const node of this.nodes) {
				const oldVal = pagerank.get(node) || 0
				const newVal = newPagerank.get(node) || 0
				diff += Math.abs(oldVal - newVal)
			}

			pagerank = newPagerank

			if (diff < tolerance) {
				break
			}
		}

		return pagerank
	}

	/**
	 * Calculate out-degree weights by edge attribute
	 */
	private outDegreeWeightsByAttribute(weightKey: string): Map<T, number> {
		const outWeights = new Map<T, number>()

		for (const [node, edges] of this.adjacency.entries()) {
			let totalWeight = 0
			for (const edge of edges) {
				const weightValue = edge.attributes.get(weightKey)
				if (weightValue) {
					const parsedWeight = parseFloat(weightValue)
					if (!isNaN(parsedWeight)) {
						totalWeight += parsedWeight
					} else {
						totalWeight += edge.weight
					}
				} else {
					totalWeight += edge.weight
				}
			}
			outWeights.set(node, totalWeight)
		}

		return outWeights
	}

	/**
	 * Print graph information
	 */
	public printInfo(): void {
		console.log("MultiDiGraph Info:")
		console.log(`  Node Count: ${this.nodeCount()}`)
		console.log(`  Edge Count: ${this.edgeCount()}`)

		for (const node of this.nodes) {
			console.log(
				`  Node ${String(node)}: Out Degree=${this.outDegree(node)}, In Degree=${this.inDegree(node)}, ` +
					`Out Weight=${this.outDegreeWeight(node).toFixed(2)}, In Weight=${this.inDegreeWeight(node).toFixed(2)}`,
			)
		}
	}
}

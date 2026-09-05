/**
 * Breadth-first search over a puzzle's state graph.
 *
 * Every puzzle here is a small graph of states joined by moves, so one search
 * serves them all: it proves a level is solvable and gives the shortest
 * solution, which is what `par` on a level has to match.
 */
export interface SearchSpec<S, A> {
  start: S
  /** Every action worth trying from this state. */
  moves: (state: S) => A[]
  apply: (state: S, action: A) => S
  /** Two states with the same key are the same position. */
  key: (state: S) => string
  solved: (state: S) => boolean
  /** States the rules forbid — never expanded. */
  invalid?: (state: S) => boolean
  /** Safety net so a bad `key` cannot hang the test run. */
  maxStates?: number
}

export function shortestSolution<S, A>(spec: SearchSpec<S, A>): A[] | null {
  const { start, moves, apply, key, solved, invalid, maxStates = 200_000 } = spec
  if (invalid?.(start)) return null
  if (solved(start)) return []
  const seen = new Map<string, { prev: string | null; action: A | null; state: S }>()
  seen.set(key(start), { prev: null, action: null, state: start })
  let frontier: S[] = [start]

  while (frontier.length > 0) {
    const next: S[] = []
    for (const state of frontier) {
      for (const action of moves(state)) {
        const child = apply(state, action)
        if (child === state) continue
        if (invalid?.(child)) continue
        const k = key(child)
        if (seen.has(k)) continue
        seen.set(k, { prev: key(state), action, state: child })
        if (solved(child)) {
          const path: A[] = []
          let cursor: string | null = k
          while (cursor) {
            const node = seen.get(cursor)
            if (!node || node.action === null) break
            path.push(node.action)
            cursor = node.prev
          }
          return path.reverse()
        }
        next.push(child)
        if (seen.size > maxStates) throw new Error('state space too large — check the key function')
      }
    }
    frontier = next
  }
  return null
}

/** How many distinct states are reachable. Handy for sanity-checking a level. */
export function reachableCount<S, A>(spec: Omit<SearchSpec<S, A>, 'solved'>): number {
  const { start, moves, apply, key, invalid, maxStates = 200_000 } = spec
  const seen = new Set([key(start)])
  const stack = [start]
  while (stack.length) {
    const state = stack.pop() as S
    for (const action of moves(state)) {
      const child = apply(state, action)
      if (child === state || invalid?.(child)) continue
      const k = key(child)
      if (seen.has(k)) continue
      seen.add(k)
      if (seen.size > maxStates) throw new Error('state space too large')
      stack.push(child)
    }
  }
  return seen.size
}

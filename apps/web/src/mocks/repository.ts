import { createMockDatabaseState } from "./data"
import type { MockDatabaseState } from "./types"

const MOCK_CLOCK_ORIGIN = Date.parse("2026-08-26T02:30:00.000Z")
const STORAGE_KEY = "classroom-mock-database-v2"

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class MockClassroomRepository {
  private state: MockDatabaseState

  constructor(initialState: MockDatabaseState = createMockDatabaseState()) {
    this.state = clone(this.load(initialState))
  }

  read<TResult>(reader: (state: Readonly<MockDatabaseState>) => TResult): TResult {
    return clone(reader(this.state))
  }

  transact<TResult>(operation: (state: MockDatabaseState) => TResult): TResult {
    const previous = clone(this.state)
    try {
      const result = clone(operation(this.state))
      this.persist()
      return result
    } catch (error) {
      this.state = previous
      throw error
    }
  }

  issueIdentity(prefix: string): { id: string; occurredAt: string } {
    return this.transact((state) => {
      state.counters.entity += 1
      state.counters.clockTick += 1
      return {
        id: `${prefix}-${state.counters.entity}`,
        occurredAt: new Date(MOCK_CLOCK_ORIGIN + state.counters.clockTick * 60_000).toISOString(),
      }
    })
  }

  reset(): void {
    this.state = createMockDatabaseState()
    this.persist()
  }

  private load(initialState: MockDatabaseState): MockDatabaseState {
    if (typeof window === "undefined") return initialState
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<MockDatabaseState> | null
      if (!parsed) return initialState
      return {
        ...initialState,
        ...parsed,
        classrooms: initialState.classrooms.map((classroom) => ({
          ...classroom,
          ...parsed.classrooms?.find((item) => item.id === classroom.id),
        })),
        scheduleTemplates: parsed.scheduleTemplates ?? initialState.scheduleTemplates,
        scheduleEntries: parsed.scheduleEntries ?? initialState.scheduleEntries,
      }
    } catch {
      return initialState
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // Mock persistence is best effort.
    }
  }
}

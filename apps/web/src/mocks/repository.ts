import { createMockDatabaseState } from "./data"
import type { MockDatabaseState } from "./types"

const MOCK_CLOCK_ORIGIN = Date.parse("2026-08-26T02:30:00.000Z")

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class MockClassroomRepository {
  private state: MockDatabaseState

  constructor(initialState: MockDatabaseState = createMockDatabaseState()) {
    this.state = clone(initialState)
  }

  read<TResult>(reader: (state: Readonly<MockDatabaseState>) => TResult): TResult {
    return clone(reader(this.state))
  }

  transact<TResult>(operation: (state: MockDatabaseState) => TResult): TResult {
    const previous = clone(this.state)
    try {
      return clone(operation(this.state))
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
  }
}

"use client"

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react"

import {
  classroomQueryKeys,
  apiClassroomService,
  type ClassroomService,
  type ClassRealtimeClient,
  SocketIoRealtimeClient,
} from "@/lib"
import { getMockClassroomRuntime, initializeMockServiceWorker } from "@/mocks"

const ClassroomServiceContext = createContext<ClassroomService | null>(null)
const RealtimeClientContext = createContext<ClassRealtimeClient | null>(null)

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

function MswInitializer({ service }: { service: ClassroomService }) {
  useEffect(() => {
    void initializeMockServiceWorker(service)
  }, [service])
  return null
}

function RealtimeLifecycle({ client }: { client: ClassRealtimeClient }) {
  useEffect(() => {
    client.connect()
    const reconnect = () => client.connect()
    window.addEventListener("classroom-auth-changed", reconnect)
    return () => {
      window.removeEventListener("classroom-auth-changed", reconnect)
      client.disconnect()
    }
  }, [client])
  return null
}

function RealtimeQuerySync({ client }: { client: ClassRealtimeClient }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const refreshRanking = (classId: string) => {
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.ranking(classId) })
      void queryClient.invalidateQueries({ queryKey: ["display"] })
    }
    const unsubscribers = [
      client.subscribe("SCORE_CHANGED", undefined, (event) => {
        void queryClient.invalidateQueries({
          queryKey: ["classrooms", event.classId, "score-records"],
        })
        refreshRanking(event.classId)
      }),
      client.subscribe("SCORE_REVERTED", undefined, (event) => {
        void queryClient.invalidateQueries({
          queryKey: ["classrooms", event.classId, "score-records"],
        })
        refreshRanking(event.classId)
      }),
      client.subscribe("RANKING_CHANGED", undefined, (event) => refreshRanking(event.classId)),
      client.subscribe("SEAT_LAYOUT_CHANGED", undefined, (event) => {
        void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.seatLayout(event.classId) })
        void queryClient.invalidateQueries({
          queryKey: ["classrooms", event.classId, "seat-layout", "versions"],
        })
        void queryClient.invalidateQueries({ queryKey: ["display"] })
      }),
      client.subscribe("STUDENT_CHANGED", undefined, (event) => {
        void queryClient.invalidateQueries({
          queryKey: ["classrooms", event.classId, "students"],
        })
        void queryClient.invalidateQueries({ queryKey: ["display"] })
      }),
      client.subscribe("DISPLAY_CONFIG_CHANGED", undefined, (event) => {
        void queryClient.invalidateQueries({
          queryKey: classroomQueryKeys.displayDevices(event.classId),
        })
        void queryClient.invalidateQueries({ queryKey: ["display"] })
      }),
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [client, queryClient])

  return null
}

export interface ClassroomSystemProviderProps {
  children: ReactNode
}

export function ClassroomSystemProvider({ children }: ClassroomSystemProviderProps) {
  const [queryClient] = useState(createQueryClient)
  const [runtime] = useState(() => {
    if (process.env.NEXT_PUBLIC_DATA_MODE !== "mock") {
      return {
        service: apiClassroomService,
        realtime: new SocketIoRealtimeClient(),
        useMockWorker: false,
      }
    }
    const mock = getMockClassroomRuntime()
    return { ...mock, useMockWorker: true }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ClassroomServiceContext.Provider value={runtime.service}>
        <RealtimeClientContext.Provider value={runtime.realtime}>
          {runtime.useMockWorker ? <MswInitializer service={runtime.service} /> : null}
          <RealtimeLifecycle client={runtime.realtime} />
          <RealtimeQuerySync client={runtime.realtime} />
          {children}
        </RealtimeClientContext.Provider>
      </ClassroomServiceContext.Provider>
    </QueryClientProvider>
  )
}

export function useClassroomService(): ClassroomService {
  const service = useContext(ClassroomServiceContext)
  if (service === null) {
    throw new Error("useClassroomService 必须在 ClassroomSystemProvider 内使用")
  }
  return service
}

export function useRealtimeClient(): ClassRealtimeClient {
  const client = useContext(RealtimeClientContext)
  if (client === null) {
    throw new Error("useRealtimeClient 必须在 ClassroomSystemProvider 内使用")
  }
  return client
}

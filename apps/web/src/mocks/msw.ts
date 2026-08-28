import type { ClassroomService } from "@/lib"

let initialization: Promise<boolean> | undefined

export async function initializeMockServiceWorker(service: ClassroomService): Promise<boolean> {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return false
  initialization ??= import("./browser").then(({ startMockBrowserWorker }) =>
    startMockBrowserWorker(service),
  )
  return initialization
}

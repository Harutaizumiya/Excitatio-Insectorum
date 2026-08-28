import { setupWorker, type SetupWorker } from "msw/browser"

import type { ClassroomService } from "@/lib"

import { createMockHandlers } from "./handlers"

let worker: SetupWorker | undefined

export async function startMockBrowserWorker(service: ClassroomService): Promise<boolean> {
  worker ??= setupWorker(...createMockHandlers(service))
  try {
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: { url: "/mockServiceWorker.js" },
    })
    return true
  } catch {
    return false
  }
}

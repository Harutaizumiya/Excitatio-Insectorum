import { CircleAlert, Inbox, LoaderCircle } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface AsyncStateProps {
  state: "loading" | "empty" | "error"
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}

const DEFAULT_COPY = {
  loading: { title: "正在加载", description: "请稍候，数据马上就好。" },
  empty: { title: "暂无数据", description: "这里还没有可显示的内容。" },
  error: { title: "加载失败", description: "请稍后重试或检查网络连接。" },
} as const

export function AsyncState({ state, title, description, action, className }: AsyncStateProps) {
  const copy = DEFAULT_COPY[state]
  const Icon = state === "loading" ? LoaderCircle : state === "error" ? CircleAlert : Inbox
  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center",
        className,
      )}
    >
      <Icon className={cn("mb-3 size-6 text-muted-foreground", state === "loading" && "animate-spin")} />
      <h3 className="font-medium text-foreground">{title ?? copy.title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description ?? copy.description}</p>
      {action === undefined ? null : <div className="mt-4">{action}</div>}
    </div>
  )
}

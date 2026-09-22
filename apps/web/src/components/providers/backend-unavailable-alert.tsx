"use client"

import { Alert } from "antd"
import { useEffect, useState } from "react"
import { BACKEND_AVAILABLE_EVENT, BACKEND_UNAVAILABLE_EVENT } from "@/lib/api-error"

interface BackendUnavailableDetail {
  message?: string
}

export function BackendUnavailableAlert() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const handleBackendUnavailable = (event: Event) => {
      const detail = (event as CustomEvent<BackendUnavailableDetail>).detail
      setMessage(detail?.message ?? "无法连接到后端服务，请确认后端服务已启动。")
    }

    window.addEventListener(BACKEND_UNAVAILABLE_EVENT, handleBackendUnavailable)
    const handleBackendAvailable = () => setMessage(null)
    window.addEventListener(BACKEND_AVAILABLE_EVENT, handleBackendAvailable)
    return () => {
      window.removeEventListener(BACKEND_UNAVAILABLE_EVENT, handleBackendUnavailable)
      window.removeEventListener(BACKEND_AVAILABLE_EVENT, handleBackendAvailable)
    }
  }, [])

  if (!message) return null

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        zIndex: 2000,
        width: "min(560px, calc(100vw - 32px))",
        transform: "translateX(-50%)",
      }}
    >
      <Alert
        type="error"
        showIcon
        closable={{ onClose: () => setMessage(null) }}
        title="后端服务不可用"
        description={message}
      />
    </div>
  )
}

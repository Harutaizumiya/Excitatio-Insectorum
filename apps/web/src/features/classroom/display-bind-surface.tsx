"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CheckCircle2, Clock3, MonitorUp, RefreshCw, ShieldCheck, TimerReset, Wifi } from "lucide-react"
import { displayBindingMock, type DisplayBindingSession } from "./display-binding-adapter"

type BindingStatus = "PENDING" | "READY" | "EXPIRED"

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000))
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0")
  const remainder = (seconds % 60).toString().padStart(2, "0")
  return `${minutes}:${remainder}`
}

export function DisplayBindSurface(): React.ReactElement {
  const [session, setSession] = useState<DisplayBindingSession>(() => displayBindingMock.createSession())
  const [status, setStatus] = useState<BindingStatus>("PENDING")
  const [secondsLeft, setSecondsLeft] = useState(300)
  const [credentialReceived, setCredentialReceived] = useState(false)

  function startSession(): void {
    const next = displayBindingMock.createSession()
    setSession(next)
    setStatus("PENDING")
    setCredentialReceived(false)
    setSecondsLeft(remainingSeconds(next.expiresAt))
  }

  useEffect(() => {
    if (status !== "PENDING") return
    const timer = window.setInterval(() => {
      const remaining = remainingSeconds(session.expiresAt)
      setSecondsLeft(remaining)
      if (remaining === 0) setStatus("EXPIRED")
    }, 1000)
    const poller = window.setInterval(() => {
      const result = displayBindingMock.poll(session.bindingSessionId, session.nonce)
      if (result.status === "EXPIRED") {
        setStatus("EXPIRED")
      } else if (result.status === "READY") {
        setStatus("READY")
        setCredentialReceived(result.credential !== "")
      }
    }, 2000)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(poller)
    }
  }, [session, status])

  function simulateBind(): void {
    displayBindingMock.simulateHeadTeacherBind()
  }

  return <main className="min-h-screen bg-[#0c1b34] px-5 py-8 text-white sm:flex sm:items-center sm:justify-center"><section className="mx-auto w-full max-w-[760px] rounded-[34px] border border-[#294267] bg-[#10213d] p-[clamp(22px,4vw,54px)] text-center shadow-[0_24px_60px_rgba(3,12,28,0.35)]"><div className="flex items-center justify-center gap-3 text-[#9fc1ff]"><span className="flex size-12 items-center justify-center rounded-2xl bg-[#0a59f7] text-white shadow-lg shadow-[#0a59f7]/30"><MonitorUp className="size-6" aria-hidden="true" /></span><span className="text-[clamp(13px,1vw,18px)] font-medium tracking-[0.18em]">CLASSROOM DISPLAY</span></div><h1 className="mt-7 text-[clamp(30px,4vw,56px)] font-semibold tracking-tight">绑定班级大屏</h1><p className="mx-auto mt-3 max-w-[540px] text-[clamp(14px,1.2vw,20px)] leading-7 text-[#9eb3d2]">请在班主任管理端输入以下 6 位绑定码，绑定完成后此屏会自动领取设备凭证。</p>{status === "READY" && credentialReceived ? <div className="mx-auto mt-10 max-w-[500px] rounded-[28px] border border-[#315f62] bg-[#14353d] px-6 py-10"><div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#1f9d68] text-white"><CheckCircle2 className="size-9" aria-hidden="true" /></div><h2 className="mt-5 text-[clamp(24px,2.5vw,38px)] font-semibold">绑定成功</h2><p className="mt-2 text-[clamp(14px,1vw,18px)] text-[#a5e1c1]">设备凭证已一次性领取，可以进入班级大屏。</p><Link href="/display" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#102344] hover:bg-[#edf4ff]"><Wifi className="size-4" aria-hidden="true" />进入大屏</Link></div> : status === "EXPIRED" ? <div className="mx-auto mt-10 max-w-[500px] rounded-[28px] border border-[#65562b] bg-[#332c1a] px-6 py-10"><div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#665320] text-[#ffd87a]"><TimerReset className="size-9" aria-hidden="true" /></div><h2 className="mt-5 text-[clamp(24px,2.5vw,38px)] font-semibold">绑定码已过期</h2><p className="mt-2 text-[clamp(14px,1vw,18px)] text-[#d6be7e]">请重新生成绑定码，再让班主任完成绑定。</p><button type="button" onClick={startSession} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0a59f7] px-6 text-sm font-semibold text-white hover:bg-[#084bd4]"><RefreshCw className="size-4" aria-hidden="true" />重新生成</button></div> : <><div className="mx-auto mt-10 max-w-[560px] rounded-[28px] border border-[#345277] bg-[#162d50] px-5 py-8"><p className="text-[clamp(12px,0.9vw,16px)] font-medium tracking-[0.18em] text-[#8fa8ce]">BINDING CODE</p><p className="mt-4 font-mono text-[clamp(48px,9vw,104px)] font-semibold leading-none tracking-[0.2em] text-white">{session.code.slice(0, 3)} {session.code.slice(3)}</p><div className="mt-7 flex items-center justify-center gap-2 text-[clamp(15px,1.2vw,21px)] text-[#ffd87a]"><Clock3 className="size-5" aria-hidden="true" />有效期 {formatCountdown(secondsLeft)}</div></div><div className="mx-auto mt-7 flex max-w-[560px] items-center justify-center gap-3 rounded-2xl border border-[#294267] bg-[#122443] px-4 py-4 text-left"><ShieldCheck className="size-5 shrink-0 text-[#7fb3ff]" aria-hidden="true" /><p className="text-[clamp(13px,1vw,18px)] text-[#9eb3d2]">等待绑定……每 2 秒轮询一次状态</p></div><button type="button" onClick={simulateBind} className="mt-6 min-h-11 rounded-full border border-[#45638c] px-5 text-sm font-medium text-[#b6c7e2] hover:border-[#9fc1ff] hover:text-white">模拟班主任已绑定</button></>}<p className="mt-8 text-xs text-[#7189ae]">绑定码仅用于首次绑定，设备凭证不会在页面上展示</p></section></main>
}

"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Dice5,
  History,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from "lucide-react"
import {
  classroomMock,
  type ScoreRecord,
  type ScoreRule,
  type Student,
} from "./classroom-model"

type Feedback = { tone: "success" | "error"; message: string } | null

function formatTime(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

function formatDelta(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`
}

function initials(name: string): string {
  return name.slice(0, 1)
}

function FeedbackBanner({ feedback }: { feedback: Feedback }): React.ReactElement | null {
  if (!feedback) return null
  const success = feedback.tone === "success"
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm ${
        success
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
      role="status"
    >
      {success ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
      <span>{feedback.message}</span>
    </div>
  )
}

function TeacherHeader(): React.ReactElement {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-white/70 bg-[#eef5ff]/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-b-3xl sm:border sm:border-[#dbe9ff]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="课序 Logo"
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-xl shadow-sm"
            priority
          />
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-[#55709d]">CLASSROOM QUICK ACTIONS</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-[#102344]">{classroomMock.classroomName}</h1>
            <p className="text-xs text-[#667794]">{classroomMock.subject} · {classroomMock.teacher.name}</p>
          </div>
        </div>
        <Link
          href="/teacher/history"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#cdddf8] bg-white/80 px-3 text-sm font-medium text-[#315180] shadow-sm transition hover:border-[#0a59f7] hover:text-[#0a59f7]"
        >
          <History className="size-4" aria-hidden="true" />
          记录
        </Link>
      </div>
    </header>
  )
}

function RuleButton({ rule, onClick, disabled }: { rule: ScoreRule; onClick: () => void; disabled: boolean }): React.ReactElement {
  const positive = rule.delta > 0
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-[#dbe6f7] bg-white px-4 text-left shadow-[0_6px_18px_rgba(39,78,135,0.06)] transition hover:-translate-y-0.5 hover:border-[#0a59f7] hover:shadow-[0_8px_20px_rgba(10,89,247,0.12)] active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-[#eaf2ff] text-[#0a59f7]" : "bg-[#fff1f0] text-[#dd5148]"}`}>
          {positive ? <Plus className="size-5" aria-hidden="true" /> : <Minus className="size-5" aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#182b4e]">{rule.name}</span>
          <span className="mt-0.5 block truncate text-xs text-[#7c8ba5]">{rule.description}</span>
        </span>
      </span>
      <span className={`shrink-0 text-lg font-semibold tabular-nums ${positive ? "text-[#0a59f7]" : "text-[#dd5148]"}`}>{formatDelta(rule.delta)}</span>
    </button>
  )
}

function RandomPickPanel({
  open,
  selected,
  excluded,
  onPick,
  onReset,
  onClose,
  feedback,
}: {
  open: boolean
  selected: Student | null
  excluded: Student[]
  onPick: () => void
  onReset: () => void
  onClose: () => void
  feedback: Feedback
}): React.ReactElement | null {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#122342]/30 p-3 backdrop-blur-[2px] sm:items-center">
      <section className="w-full max-w-[430px] rounded-[28px] border border-white/80 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="random-pick-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-[#6d83a5]">ROUND PICK</p>
            <h2 id="random-pick-title" className="mt-1 text-xl font-semibold text-[#102344]">随机点名</h2>
          </div>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full text-[#6b7e9e] hover:bg-[#f0f5fc]" aria-label="关闭随机点名">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {selected ? (
          <div className="my-6 rounded-3xl bg-[#edf4ff] px-4 py-7 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#0a59f7] text-2xl font-semibold text-white shadow-lg shadow-[#0a59f7]/20">{initials(selected.name)}</div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-[#102344]">{selected.name}</p>
            <p className="mt-1 text-sm text-[#6680a7]">已从本轮未点名单中选出</p>
          </div>
        ) : (
          <div className="my-6 rounded-3xl border border-dashed border-[#bfd2f1] bg-[#f7faff] px-4 py-10 text-center">
            <Dice5 className="mx-auto size-9 text-[#0a59f7]" aria-hidden="true" />
            <p className="mt-3 font-medium text-[#253c62]">准备好后开始抽取</p>
            <p className="mt-1 text-sm text-[#7083a3]">本轮已点 {excluded.length} 人</p>
          </div>
        )}

        <FeedbackBanner feedback={feedback} />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onPick} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#0a59f7] px-4 font-semibold text-white shadow-lg shadow-[#0a59f7]/20 transition hover:bg-[#084bd4] active:translate-y-px">
            <Dice5 className="size-5" aria-hidden="true" />
            {selected ? "再次抽取" : "开始抽取"}
          </button>
          <button type="button" onClick={onReset} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#d4e1f5] bg-white px-4 font-medium text-[#486183] transition hover:border-[#0a59f7] hover:text-[#0a59f7]">
            <RotateCcw className="size-4" aria-hidden="true" />
            重置
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#7a8ba5]">本轮排除：{excluded.length ? excluded.map((student) => student.name).join("、") : "暂无"}</p>
      </section>
    </div>
  )
}

export function TeacherSurface(): React.ReactElement {
  const [students] = useState<Student[]>(() => classroomMock.getStudents())
  const [rules] = useState<ScoreRule[]>(() => classroomMock.getScoreRules())
  const [records, setRecords] = useState<ScoreRecord[]>(() => classroomMock.getScoreRecords())
  const [query, setQuery] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [customDelta, setCustomDelta] = useState("2")
  const [customReason, setCustomReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [randomFeedback, setRandomFeedback] = useState<Feedback>(null)
  const [randomOpen, setRandomOpen] = useState(false)
  const [randomStudent, setRandomStudent] = useState<Student | null>(null)
  const [excludedIds, setExcludedIds] = useState<string[]>([])

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null
  const filteredStudents = useMemo(
    () => students.filter((student) => `${student.name}${student.studentNo}`.includes(query.trim())),
    [query, students],
  )
  const selectedRecords = selectedStudent ? records.filter((record) => record.student.id === selectedStudent.id).slice(0, 3) : []
  const excludedStudents = students.filter((student) => excludedIds.includes(student.id))

  function refreshRecords(): void {
    setRecords(classroomMock.getScoreRecords())
  }

  function showFeedback(next: Feedback): void {
    setFeedback(next)
    window.setTimeout(() => setFeedback(null), 2800)
  }

  function handleRuleScore(rule: ScoreRule): void {
    if (!selectedStudent) return
    setIsSubmitting(true)
    try {
      classroomMock.addRuleScore(selectedStudent.id, rule.id)
      refreshRecords()
      showFeedback({ tone: "success", message: `${selectedStudent.name} · ${rule.name} 已记录` })
    } catch (error) {
      showFeedback({ tone: "error", message: error instanceof Error ? error.message : "记录失败，请稍后重试" })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCustomScore(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!selectedStudent) return
    setIsSubmitting(true)
    try {
      classroomMock.addCustomScore(selectedStudent.id, Number(customDelta), customReason)
      refreshRecords()
      setCustomReason("")
      showFeedback({ tone: "success", message: `${selectedStudent.name} · 自定义积分已记录` })
    } catch (error) {
      showFeedback({ tone: "error", message: error instanceof Error ? error.message : "请检查输入内容" })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleRandomPick(): void {
    try {
      const picked = classroomMock.pickRandomStudent(excludedIds)
      setRandomStudent(picked)
      setExcludedIds((current) => [...current, picked.id])
      setRandomFeedback({ tone: "success", message: `已点到 ${picked.name}` })
      window.setTimeout(() => setRandomFeedback(null), 2200)
    } catch (error) {
      setRandomFeedback({ tone: "error", message: error instanceof Error ? error.message : "暂时无法点名" })
    }
  }

  function resetRound(): void {
    setExcludedIds([])
    setRandomStudent(null)
    setRandomFeedback(null)
  }

  return (
    <main className="min-h-screen bg-[#eef5ff] px-4 pb-8 text-[#102344] sm:px-6">
      <div className="mx-auto w-full max-w-[430px]">
        <TeacherHeader />
        <div className="space-y-4">
          <button type="button" onClick={() => setRandomOpen(true)} className="flex min-h-[68px] w-full items-center justify-between rounded-3xl bg-[#0a59f7] px-5 text-left text-white shadow-[0_14px_28px_rgba(10,89,247,0.22)] transition hover:bg-[#084bd4] active:translate-y-px">
            <span className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15"><Dice5 className="size-6" aria-hidden="true" /></span>
              <span><span className="block text-base font-semibold">随机点名</span><span className="mt-0.5 block text-xs text-blue-100">本轮已点 {excludedIds.length} 人</span></span>
            </span>
            <ChevronRight className="size-5 text-blue-100" aria-hidden="true" />
          </button>

          <section className="rounded-3xl border border-[#dce8f7] bg-white p-4 shadow-[0_8px_24px_rgba(42,82,141,0.05)]">
            <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-[#f4f7fb] px-3 text-[#6a7b98] focus-within:ring-2 focus-within:ring-[#0a59f7]/20" htmlFor="student-search">
              <Search className="size-5 shrink-0" aria-hidden="true" />
              <input id="student-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或学号" className="min-w-0 flex-1 bg-transparent text-base text-[#1d3356] outline-none placeholder:text-[#96a5ba]" />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="清除搜索" className="flex size-8 items-center justify-center rounded-full hover:bg-white"><X className="size-4" aria-hidden="true" /></button> : null}
            </label>
            <div className="mt-4 flex items-center justify-between">
              <div><h2 className="text-base font-semibold">选择学生</h2><p className="mt-0.5 text-xs text-[#8494ac]">点击后打开快捷积分</p></div>
              <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-medium text-[#0a59f7]">{filteredStudents.length} 人</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {filteredStudents.map((student) => {
                const active = selectedStudentId === student.id
                return <button key={student.id} type="button" onClick={() => setSelectedStudentId(student.id)} className={`flex min-h-16 items-center gap-2.5 rounded-2xl border px-3 text-left transition ${active ? "border-[#0a59f7] bg-[#edf4ff] shadow-sm" : "border-[#e4ebf4] bg-white hover:border-[#adc7f3]"}`}>
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${active ? "bg-[#0a59f7] text-white" : "bg-[#f0f4fa] text-[#55709b]"}`}>{initials(student.name)}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#213758]">{student.name}</span><span className="block text-xs text-[#8b9ab0]">{student.studentNo}</span></span>
                </button>
              })}
            </div>
            {!filteredStudents.length ? <div className="py-8 text-center text-sm text-[#7b8da8]">没有找到匹配学生</div> : null}
          </section>

          {selectedStudent ? <section className="rounded-3xl border border-[#d6e4f8] bg-white p-4 shadow-[0_8px_24px_rgba(42,82,141,0.07)]" aria-labelledby="quick-score-title">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-2xl bg-[#0a59f7] text-lg font-semibold text-white">{initials(selectedStudent.name)}</span><div><h2 id="quick-score-title" className="text-lg font-semibold">{selectedStudent.name}</h2><p className="text-sm text-[#7b8da8]">快捷积分</p></div></div>
              <button type="button" onClick={() => setSelectedStudentId(null)} className="flex size-11 items-center justify-center rounded-full text-[#7587a2] hover:bg-[#f0f5fc]" aria-label="关闭积分面板"><X className="size-5" aria-hidden="true" /></button>
            </div>
            <div className="mt-4"><p className="mb-2 text-xs font-medium tracking-wide text-[#7285a4]">积分规则</p><div className="grid gap-2">{rules.map((rule) => <RuleButton key={rule.id} rule={rule} onClick={() => handleRuleScore(rule)} disabled={isSubmitting} />)}</div></div>
            <div className="my-5 h-px bg-[#edf1f6]" />
            <form onSubmit={handleCustomScore} className="space-y-3">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-[#0a59f7]" aria-hidden="true" /><h3 className="text-sm font-semibold">自定义积分</h3><span className="ml-auto text-xs text-[#8a9ab2]">需填写详细原因</span></div>
              <div className="flex gap-2"><label className="sr-only" htmlFor="custom-delta">积分变化</label><input id="custom-delta" type="number" step="1" value={customDelta} onChange={(event) => setCustomDelta(event.target.value)} className="min-h-12 w-28 rounded-2xl border border-[#dbe6f4] bg-[#f9fbfe] px-3 text-center text-lg font-semibold text-[#18345e] outline-none focus:border-[#0a59f7] focus:ring-2 focus:ring-[#0a59f7]/15" /><label className="sr-only" htmlFor="custom-reason">详细原因</label><textarea id="custom-reason" value={customReason} onChange={(event) => setCustomReason(event.target.value)} placeholder="详细原因（至少 10 个字符）" rows={2} className="min-h-12 flex-1 resize-none rounded-2xl border border-[#dbe6f4] bg-[#f9fbfe] px-3 py-3 text-sm text-[#18345e] outline-none placeholder:text-[#9aa8bc] focus:border-[#0a59f7] focus:ring-2 focus:ring-[#0a59f7]/15" /></div>
              <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#c6d9f6] bg-[#f2f7ff] px-4 text-sm font-semibold text-[#0a59f7] transition hover:bg-[#e7f0ff] disabled:cursor-wait disabled:opacity-60"><Sparkles className="size-4" aria-hidden="true" />确认记录</button>
            </form>
            <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium tracking-wide text-[#7285a4]">近期记录</p><Link href="/teacher/history" className="text-xs font-medium text-[#0a59f7]">查看全部</Link></div>{selectedRecords.length ? <div className="space-y-2">{selectedRecords.map((record) => <div key={record.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[#f7f9fc] px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-sm text-[#324767]">{record.rule?.name ?? "自定义积分"}</span><span className="flex items-center gap-1 text-xs text-[#91a0b4]"><Clock3 className="size-3" aria-hidden="true" />{formatTime(record.createdAt)}</span></span><span className={`text-sm font-semibold ${record.delta > 0 ? "text-[#0a59f7]" : "text-[#dd5148]"}`}>{formatDelta(record.delta)}</span></div>)}</div> : <p className="rounded-2xl bg-[#f7f9fc] px-3 py-4 text-center text-xs text-[#8b9ab0]">暂无记录</p>}</div>
            <div className="mt-4"><FeedbackBanner feedback={feedback} /></div>
          </section> : <div className="rounded-3xl border border-dashed border-[#c5d7f1] bg-white/60 px-4 py-7 text-center"><SlidersHorizontal className="mx-auto size-6 text-[#0a59f7]" aria-hidden="true" /><p className="mt-2 text-sm font-medium text-[#3e567d]">先选择一名学生</p><p className="mt-1 text-xs text-[#8798b1]">常用积分会在这里展开</p></div>}
        </div>
      </div>
      <RandomPickPanel open={randomOpen} selected={randomStudent} excluded={excludedStudents} onPick={handleRandomPick} onReset={resetRound} onClose={() => setRandomOpen(false)} feedback={randomFeedback} />
    </main>
  )
}

function HistoryRecordCard({ record, onDetail, onRevert }: { record: ScoreRecord; onDetail: () => void; onRevert: () => void }): React.ReactElement {
  const isReverted = record.reverted || record.recordType === "REVERT"
  return <article className="rounded-3xl border border-[#dce7f5] bg-white p-4 shadow-[0_6px_20px_rgba(42,82,141,0.05)]"><button type="button" onClick={onDetail} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${record.delta > 0 ? "bg-[#eaf2ff] text-[#0a59f7]" : "bg-[#fff1f0] text-[#dd5148]"}`}>{record.delta > 0 ? <Plus className="size-5" aria-hidden="true" /> : <Minus className="size-5" aria-hidden="true" />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#213758]">{record.student.name} · {record.rule?.name ?? "自定义积分"}</p><p className="mt-1 flex items-center gap-1 text-xs text-[#8b9ab0]"><Clock3 className="size-3" aria-hidden="true" />{formatTime(record.createdAt)} · {record.operator.name}</p></div></div><span className={`shrink-0 text-base font-semibold ${record.delta > 0 ? "text-[#0a59f7]" : "text-[#dd5148]"}`}>{formatDelta(record.delta)}</span></div></button><div className="mt-3 flex items-center justify-between border-t border-[#edf1f6] pt-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isReverted ? "bg-[#f1f3f6] text-[#7d8999]" : "bg-[#edf4ff] text-[#3c66a1]"}`}>{isReverted ? "已撤销" : record.recordType === "REVERT" ? "撤销流水" : "有效记录"}</span>{!isReverted && record.operator.id === classroomMock.teacher.id ? <button type="button" onClick={onRevert} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#667994] hover:bg-[#f2f5f9] hover:text-[#c44742]"><Undo2 className="size-4" aria-hidden="true" />撤销</button> : null}</div></article>
}

export function TeacherHistorySurface(): React.ReactElement {
  const [records, setRecords] = useState<ScoreRecord[]>(() => classroomMock.getScoreRecords())
  const [filter, setFilter] = useState<"all" | "mine" | "reverted">("all")
  const [selected, setSelected] = useState<ScoreRecord | null>(null)
  const [revertTarget, setRevertTarget] = useState<ScoreRecord | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const filtered = useMemo(() => records.filter((record) => {
    if (filter === "mine") return record.operator.id === classroomMock.teacher.id
    if (filter === "reverted") return record.reverted || record.recordType === "REVERT"
    return true
  }), [filter, records])

  function confirmRevert(): void {
    if (!revertTarget) return
    try {
      classroomMock.revertScore(revertTarget.id)
      setRecords(classroomMock.getScoreRecords())
      setRevertTarget(null)
      setFeedback({ tone: "success", message: "已生成撤销流水，原记录保留" })
      window.setTimeout(() => setFeedback(null), 2800)
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "撤销失败" })
    }
  }

  return <main className="min-h-screen bg-[#eef5ff] px-4 pb-8 text-[#102344] sm:px-6"><div className="mx-auto w-full max-w-[430px]"><header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 border-b border-white/70 bg-[#eef5ff]/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-b-3xl sm:border sm:border-[#dbe9ff]"><Link href="/teacher" className="flex size-11 items-center justify-center rounded-full border border-[#cdddf8] bg-white/80 text-[#49648a] hover:text-[#0a59f7]" aria-label="返回教师端"><ChevronRight className="size-5 rotate-180" aria-hidden="true" /></Link><div><p className="text-xs font-medium tracking-[0.16em] text-[#6d83a5]">ACTIVITY LOG</p><h1 className="text-lg font-semibold text-[#102344]">积分流水</h1></div></header><section className="space-y-4"><div className="rounded-3xl border border-[#dce8f7] bg-white p-4 shadow-[0_8px_24px_rgba(42,82,141,0.05)]"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">最近操作</h2><p className="mt-1 text-xs text-[#8798b1]">任课教师可撤销本人记录</p></div><History className="size-5 text-[#0a59f7]" aria-hidden="true" /></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setFilter("all")} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${filter === "all" ? "bg-[#0a59f7] text-white" : "bg-[#f1f5fb] text-[#637896]"}`}>全部</button><button type="button" onClick={() => setFilter("mine")} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${filter === "mine" ? "bg-[#0a59f7] text-white" : "bg-[#f1f5fb] text-[#637896]"}`}>本人记录</button><button type="button" onClick={() => setFilter("reverted")} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${filter === "reverted" ? "bg-[#0a59f7] text-white" : "bg-[#f1f5fb] text-[#637896]"}`}>已撤销</button></div></div><FeedbackBanner feedback={feedback} />{filtered.length ? <div className="space-y-3">{filtered.map((record) => <HistoryRecordCard key={record.id} record={record} onDetail={() => setSelected(record)} onRevert={() => setRevertTarget(record)} />)}</div> : <div className="rounded-3xl border border-dashed border-[#bfd2f1] bg-white/70 px-4 py-12 text-center"><History className="mx-auto size-7 text-[#0a59f7]" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-[#3d557c]">暂无匹配记录</p></div>}</section></div>{selected ? <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#122342]/30 p-3 backdrop-blur-[2px] sm:items-center"><section className="w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="record-detail-title"><div className="flex items-start justify-between"><div><p className="text-xs tracking-[0.16em] text-[#6d83a5]">RECORD DETAIL</p><h2 id="record-detail-title" className="mt-1 text-xl font-semibold">积分记录</h2></div><button type="button" onClick={() => setSelected(null)} className="flex size-11 items-center justify-center rounded-full text-[#7587a2] hover:bg-[#f0f5fc]" aria-label="关闭详情"><X className="size-5" aria-hidden="true" /></button></div><dl className="mt-5 divide-y divide-[#edf1f6] rounded-2xl bg-[#f7f9fc] px-4"><div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-[#8090a8]">学生</dt><dd className="font-medium">{selected.student.name}</dd></div><div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-[#8090a8]">操作教师</dt><dd className="font-medium">{selected.operator.name}</dd></div><div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-[#8090a8]">类型</dt><dd className="font-medium">{selected.rule?.name ?? "自定义积分"}</dd></div><div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-[#8090a8]">积分变化</dt><dd className={`font-semibold ${selected.delta > 0 ? "text-[#0a59f7]" : "text-[#dd5148]"}`}>{formatDelta(selected.delta)}</dd></div></dl>{selected.reason ? <p className="mt-4 rounded-2xl border border-[#e0e9f5] px-4 py-3 text-sm leading-6 text-[#526887]">{selected.reason}</p> : null}<p className="mt-4 flex items-center gap-2 text-xs text-[#8b9ab0]"><Clock3 className="size-3.5" aria-hidden="true" />{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.createdAt))}</p></section></div> : null}{revertTarget ? <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#122342]/35 p-3 backdrop-blur-[2px] sm:items-center"><section className="w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="revert-title"><div className="flex size-11 items-center justify-center rounded-2xl bg-[#fff1f0] text-[#c44742]"><Undo2 className="size-5" aria-hidden="true" /></div><h2 id="revert-title" className="mt-4 text-xl font-semibold">撤销这次积分操作？</h2><p className="mt-2 text-sm leading-6 text-[#71829d]">原积分流水不会删除，系统会生成一条反向流水以保留记录。</p><div className="mt-5 flex gap-2"><button type="button" onClick={() => setRevertTarget(null)} className="min-h-12 flex-1 rounded-full border border-[#d5e1f1] text-sm font-medium text-[#617493]">取消</button><button type="button" onClick={confirmRevert} className="min-h-12 flex-1 rounded-full bg-[#c44742] text-sm font-semibold text-white">确认撤销</button></div></section></div> : null}</main>
}

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
] as const

function nameHash(name: string): number {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return hash
}

export interface StudentAvatarProps {
  name: string
  size?: "sm" | "default" | "lg"
  className?: string
}

export function StudentAvatar({ name, size = "default", className }: StudentAvatarProps) {
  const label = name.trim().slice(-2) || "学生"
  const tone = AVATAR_TONES[nameHash(name) % AVATAR_TONES.length]
  return (
    <Avatar size={size} className={className} aria-label={`${name}的头像`}>
      <AvatarFallback className={cn("font-medium", tone)}>{label}</AvatarFallback>
    </Avatar>
  )
}

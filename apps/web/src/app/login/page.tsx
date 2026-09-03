"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClassroomService } from "@/components/providers/classroom-system-provider";
import { useLogin } from "@/components/providers/query-hooks";
import { ClassroomServiceError } from "@/lib/classroom-service";
import { setActiveClassId, setUserSession } from "@/lib/session";

const loginSchema = z.object({
  account: z.string().trim().min(1, "请输入账号"),
  password: z.string().min(6, "密码至少需要 6 位"),
});

type LoginValues = z.infer<typeof loginSchema>;
type LoginRole = "HEAD_TEACHER" | "SUBJECT_TEACHER";

const roleCopy: Record<
  LoginRole,
  { label: string; account: string; destination: string }
> = {
  HEAD_TEACHER: {
    label: "班主任",
    account: "zhangsha",
    destination: "/admin",
  },
  SUBJECT_TEACHER: {
    label: "任课教师",
    account: "math.teacher",
    destination: "/teacher",
  },
};

const demoPasswords: Record<LoginRole, string> = {
  HEAD_TEACHER: "admin123",
  SUBJECT_TEACHER: "classroom-demo",
};

export default function LoginPage() {
  const router = useRouter();
  const service = useClassroomService();
  const login = useLogin();
  const [role, setRole] = useState<LoginRole>("HEAD_TEACHER");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      account: roleCopy.HEAD_TEACHER.account,
      password: demoPasswords.HEAD_TEACHER,
    },
  });

  const chooseRole = (nextRole: LoginRole) => {
    setRole(nextRole);
    reset({
      account: roleCopy[nextRole].account,
      password: demoPasswords[nextRole],
    });
  };

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await login.mutateAsync(values);
      setUserSession(result);
      const classrooms = await service.listClassrooms();
      if (classrooms.length === 0) {
        throw new Error("当前账号尚未分配班级");
      }
      setActiveClassId(classrooms[0].id);
      router.push(roleCopy[role].destination);
    } catch (error) {
      setSubmitError(
        error instanceof ClassroomServiceError || error instanceof Error
          ? error.message
          : "登录失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f6fb] px-4 py-10 sm:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(10,89,247,0.18),transparent_52%),radial-gradient(circle_at_top_right,rgba(77,132,255,0.14),transparent_48%)]"
        aria-hidden="true"
      />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_80px_rgba(33,59,112,0.14)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden min-h-[620px] flex-col justify-between bg-[#0a59f7] p-12 text-white lg:flex">
          <div>
            <div className="flex items-center gap-3 text-lg font-semibold">
              <Image
                src="/logo.png"
                alt="课序"
                width={40}
                height={40}
                className="size-10 rounded-xl shadow-md"
                priority
              />
              课序
            </div>
            <Badge className="mt-16 rounded-full border-white/20 bg-white/12 px-3 py-1 text-white">
              MVP
            </Badge>
            <h1 className="mt-5 max-w-md text-4xl leading-[1.2] font-semibold tracking-tight">
              让每一次课堂互动
            </h1>
            <h1 className="mt-5 max-w-md text-4xl leading-[1.2] font-semibold tracking-tight">
              清晰可见
            </h1>
          </div>
        </div>

        <div className="flex min-h-[620px] items-center p-6 sm:p-10 lg:p-12">
          <div className="w-full">
            <div className="pb-7">
              <div className="mb-5 flex size-12 items-center justify-center lg:hidden">
                <Image
                  src="/logo.png"
                  alt="课序"
                  width={48}
                  height={48}
                  className="size-12 rounded-2xl shadow-md"
                  priority
                />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#102344]">欢迎回来</h2>
              <p className="mt-1.5 text-base text-muted-foreground">
                选择身份并使用预置演示账号进入系统。
              </p>
            </div>
            <div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                {(Object.keys(roleCopy) as LoginRole[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => chooseRole(item)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition ${
                      role === item
                        ? "bg-white text-[#0a59f7] shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    aria-pressed={role === item}
                  >
                    {item === "HEAD_TEACHER" ? (
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    ) : (
                      <KeyRound className="size-4" aria-hidden="true" />
                    )}
                    {roleCopy[item].label}
                  </button>
                ))}
              </div>

              <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)}>
                {submitError ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                    {submitError}
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="account">账号</Label>
                  <Input
                    id="account"
                    autoComplete="username"
                    className="h-11 rounded-xl"
                    aria-invalid={Boolean(errors.account)}
                    {...register("account")}
                  />
                  {errors.account ? (
                    <p className="text-sm text-destructive">{errors.account.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">密码</Label>
                    <span className="text-xs text-muted-foreground">演示环境无需修改</span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-11 rounded-xl"
                    aria-invalid={Boolean(errors.password)}
                    {...register("password")}
                  />
                  {errors.password ? (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="h-12 w-full rounded-full bg-[#0a59f7] text-base shadow-[0_10px_24px_rgba(10,89,247,0.24)] hover:bg-[#084bd0]"
                >
                  {submitting ? "正在进入…" : `进入${roleCopy[role].label}工作台`}
                  {!submitting ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                </Button>
              </form>

              <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
                当前版本连接本地服务，账号信息仅提交到本机后端。
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

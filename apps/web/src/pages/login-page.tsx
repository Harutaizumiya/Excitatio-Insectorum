import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export default function LoginPage() {
  const navigate = useNavigate();
  const service = useClassroomService();
  const login = useLogin();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      account: "zhangsha",
    },
  });

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
      navigate("/admin");
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
              <img
                src="/logo.png"
                alt="课序"
                width={40}
                height={40}
                className="size-10 rounded-xl shadow-md"
              />
              课序
            </div>
            <Badge className="mt-16 rounded-full border-white/20 bg-white/12 px-3 py-1 text-white">
              测试版
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
                <img
                  src="/logo.png"
                  alt="课序"
                  width={48}
                  height={48}
                  className="size-12 rounded-2xl shadow-md"
                />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#102344]">欢迎回来</h2>
              <p className="mt-1.5 text-base text-muted-foreground">
                使用班主任账号登录系统。
              </p>
            </div>
            <div>
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
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
                  {submitting ? "正在进入…" : "进入班主任工作台"}
                  {!submitting ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

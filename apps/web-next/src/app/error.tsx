"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-6">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm sm:p-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <CircleAlert className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">页面暂时没有加载成功</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          请检查后端服务是否正常运行，然后重试。
        </p>
        <Button type="button" onClick={reset} className="mt-7 rounded-full px-5">
          <RotateCcw className="size-4" aria-hidden="true" />
          重新加载
        </Button>
      </section>
    </main>
  );
}

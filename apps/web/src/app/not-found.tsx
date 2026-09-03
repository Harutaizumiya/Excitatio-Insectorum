import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-6">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm sm:p-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0a59f7]">
          <SearchX className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-semibold text-[#0a59f7]">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">没有找到这个页面</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          链接可能已经失效，请返回登录页继续操作。
        </p>
        <Link
          href="/login"
          className={buttonVariants({ className: "mt-7 rounded-full px-5" })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回登录页
        </Link>
      </section>
    </main>
  );
}

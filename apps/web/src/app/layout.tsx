import type { Metadata } from "next";
import { App as AntApp } from "antd";

import { ClassroomSystemProvider } from "@/components/providers/classroom-system-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "课序 · 班级管理",
    template: "%s | 课序",
  },
  description: "面向班级课堂的座位、积分、随机点名与大屏协作工具。",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <AntApp>
          <ClassroomSystemProvider>
            {children}
            <Toaster richColors position="top-center" />
          </ClassroomSystemProvider>
        </AntApp>
      </body>
    </html>
  );
}

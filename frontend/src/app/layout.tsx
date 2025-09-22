import type { Metadata } from "next";
import { AppProvider, ThemeProvider } from "@/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Web - 远程控制Claude CLI",
  description: "通过网页界面远程控制和管理Claude CLI，支持项目管理和任务调度",
  keywords: "Claude CLI, 远程控制, 项目管理, 任务调度, Web界面",
  authors: [{ name: "Claude Web Team" }],
  robots: "index, follow"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

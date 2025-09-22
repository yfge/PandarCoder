'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Terminal, Menu, User, Settings, LogOut, LogIn, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  onToggleSidebar?: () => void
  className?: string
}

export function Header({ onToggleSidebar, className }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, logout } = useAuthStore()

  // 导航菜单项
  const navigationItems = [
    { href: '/', label: '工作台', icon: Terminal },
    { href: '/projects', label: '项目', icon: Terminal },
    { href: '/tasks', label: '任务', icon: Terminal },
    { href: '/notifications', label: '通知', icon: Terminal },
  ]

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
      // 即使登出失败也跳转到登录页
      router.push('/login')
    }
  }

  return (
    <Card className={cn(
      "border-b rounded-none shadow-sm bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="flex h-16 items-center justify-between px-4">
        {/* 左侧 - Logo和导航 */}
        <div className="flex items-center space-x-4">
          {/* 移动端菜单按钮 */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Terminal className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl hidden sm:inline-block">
              Claude Web
            </span>
          </Link>

          {/* 桌面端导航 */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-9 px-3",
                      isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* 右侧 - 用户菜单 */}
        <div className="flex items-center space-x-2">
          {/* 快捷操作按钮 - 仅在已登录时显示 */}
          {isAuthenticated && (
            <Button variant="ghost" size="sm" className="hidden md:flex">
              <Terminal className="h-4 w-4 mr-2" />
              新建任务
            </Button>
          )}

          {/* 根据登录状态显示不同的菜单 */}
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:ml-2 sm:inline-block">
                    {user?.full_name || '用户'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{user?.full_name || '用户'}</p>
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </div>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    个人资料
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    设置
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="flex items-center text-red-600 focus:text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login" className="flex items-center">
                  <LogIn className="h-4 w-4 mr-2" />
                  登录
                </Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/register" className="flex items-center">
                  <UserPlus className="h-4 w-4 mr-2" />
                  注册
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default Header
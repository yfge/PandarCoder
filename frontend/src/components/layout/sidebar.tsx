'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Terminal, 
  FolderOpen, 
  ListChecks, 
  Bell, 
  Settings, 
  Plus,
  Activity,
  GitBranch,
  Clock,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  className?: string
}

export function Sidebar({ isOpen = true, onClose, className }: SidebarProps) {
  const pathname = usePathname()

  // 主导航菜单
  const navigationItems = [
    {
      title: '工作台',
      href: '/',
      icon: Terminal,
      description: '项目概览和快速操作'
    },
    {
      title: '项目',
      href: '/projects',
      icon: FolderOpen,
      description: '管理您的代码项目'
    },
    {
      title: '任务',
      href: '/tasks',
      icon: ListChecks,
      description: '查看运行中的任务',
      badge: 3
    },
    {
      title: '通知',
      href: '/notifications',
      icon: Bell,
      description: '系统通知和消息',
      badge: 5
    },
    {
      title: '设置',
      href: '/settings',
      icon: Settings,
      description: '系统配置和偏好设置'
    }
  ]

  // 快捷操作
  const quickActions = [
    {
      title: '新建项目',
      icon: Plus,
      action: () => console.log('Create new project')
    },
    {
      title: '导入项目',
      icon: GitBranch,
      action: () => console.log('Import project')
    },
    {
      title: '快速终端',
      icon: Zap,
      action: () => console.log('Quick terminal')
    }
  ]

  // 最近活动（示例数据）
  const recentActivities = [
    {
      id: 1,
      title: 'Claude CLI 执行完成',
      time: '2分钟前',
      type: 'success'
    },
    {
      id: 2,
      title: '项目构建开始',
      time: '5分钟前',
      type: 'info'
    },
    {
      id: 3,
      title: '新的Git提交',
      time: '10分钟前',
      type: 'info'
    }
  ]

  return (
    <div className={cn(
      "fixed inset-y-0 left-0 z-50 w-64 transform bg-background border-r transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full",
      className
    )}>
      {/* 遮罩层（移动端） */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 侧边栏内容 */}
      <div className="relative z-50 flex h-full flex-col bg-background">
        {/* 侧边栏头部 */}
        <div className="flex h-16 items-center border-b px-4">
          <Link href="/" className="flex items-center space-x-2">
            <Terminal className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Claude Web</span>
          </Link>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 space-y-2 p-4">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start h-10 px-3",
                      isActive && "bg-primary text-primary-foreground"
                    )}
                    onClick={onClose}
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    <span className="flex-1 text-left">{item.title}</span>
                    {item.badge && (
                      <span className="ml-auto bg-primary-foreground text-primary rounded-full px-2 py-1 text-xs font-medium">
                        {item.badge}
                      </span>
                    )}
                  </Button>
                </Link>
              )
            })}
          </div>

          {/* 快捷操作 */}
          <div className="pt-4">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              快捷操作
            </h3>
            <div className="space-y-1">
              {quickActions.map((action, index) => {
                const Icon = action.icon
                return (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-9 px-3"
                    onClick={action.action}
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    {action.title}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* 最近活动 */}
          <div className="pt-4">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center">
              <Activity className="h-3 w-3 mr-1" />
              最近活动
            </h3>
            <Card>
              <CardContent className="p-3 space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-2 shrink-0",
                      activity.type === 'success' && "bg-green-500",
                      activity.type === 'info' && "bg-blue-500",
                      activity.type === 'warning' && "bg-yellow-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {activity.title}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </nav>

        {/* 侧边栏底部 */}
        <div className="border-t p-4">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>系统运行正常</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
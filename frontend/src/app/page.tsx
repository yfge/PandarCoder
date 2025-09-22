'use client'

import React from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Terminal, Plus, Activity, Clock, GitBranch, Zap, TrendingUp, Users, Server, Loader2, AlertCircle } from 'lucide-react'
import { api } from '@/api'

export default function HomePage() {
  const [stats, setStats] = React.useState({
    total_projects: 0,
    active_projects: 0,
    total_tasks: 0,
    successful_tasks: 0,
    failed_tasks: 0,
    success_rate: 0
  })
  const [recentProjects, setRecentProjects] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // 加载统计数据
  React.useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)
        
        // 并行加载数据
        const [statsData, projectsData] = await Promise.allSettled([
          api.projects.getProjectStats(),
          api.projects.getRecentProjects(5)
        ])
        
        if (statsData.status === 'fulfilled') {
          setStats(statsData.value)
        }
        
        if (projectsData.status === 'fulfilled') {
          setRecentProjects(projectsData.value)
        }
        
      } catch (err: any) {
        console.error('Load dashboard data error:', err)
        setError(err.response?.data?.detail || err.message || '加载数据失败')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  // 转换数据为卡片格式
  const statsCards = [
    {
      title: '活跃项目',
      value: stats.active_projects.toString(),
      change: `共 ${stats.total_projects} 个项目`,
      icon: GitBranch,
      color: 'text-blue-600'
    },
    {
      title: '总任务数',
      value: stats.total_tasks.toString(),
      change: `${stats.successful_tasks} 个成功`,
      icon: Activity,
      color: 'text-green-600'
    },
    {
      title: '成功率',
      value: `${stats.success_rate}%`,
      change: stats.total_tasks > 0 ? `基于 ${stats.total_tasks} 个任务` : '暂无任务',
      icon: TrendingUp,
      color: 'text-orange-600'
    },
    {
      title: '失败任务',
      value: stats.failed_tasks.toString(),
      change: stats.failed_tasks > 0 ? '需要处理' : '一切正常',
      icon: Users,
      color: 'text-purple-600'
    }
  ]

  // 转换项目数据为任务格式（临时）
  const recentTasks = recentProjects.map((project, index) => ({
    id: project.id || index,
    title: `项目: ${project.name}`,
    project: project.description || '无描述',
    status: project.status === 'active' ? 'completed' : 'pending',
    time: project.created_at ? new Date(project.created_at).toLocaleDateString('zh-CN') : '未知'
  }))

  const quickActions = [
    {
      title: '新建项目',
      description: '创建一个新的代码项目',
      icon: Plus,
      action: () => console.log('Create project'),
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    {
      title: '快速终端',
      description: '打开Claude CLI终端',
      icon: Terminal,
      action: () => console.log('Open terminal'),
      color: 'bg-green-500 hover:bg-green-600'
    },
    {
      title: '运行任务',
      description: '执行预定义的任务',
      icon: Zap,
      action: () => console.log('Run task'),
      color: 'bg-orange-500 hover:bg-orange-600'
    },
    {
      title: '系统监控',
      description: '查看系统状态',
      icon: Server,
      action: () => console.log('System monitor'),
      color: 'bg-purple-500 hover:bg-purple-600'
    }
  ]

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">工作台</h1>
            <p className="text-muted-foreground">
              管理您的Claude CLI项目和任务
            </p>
          </div>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            新建项目
          </Button>
        </div>

        {/* 统计卡片 */}
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>加载统计数据...</span>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center py-8 text-red-500">
            <AlertCircle className="h-6 w-6 mr-2" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statsCards.map((stat, index) => {
              const Icon = stat.icon
              return (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {stat.title}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {stat.change}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* 主要内容区 */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 快速操作 */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2" />
                  快速操作
                </CardTitle>
                <CardDescription>
                  常用功能的快速入口
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {quickActions.map((action, index) => {
                    const Icon = action.icon
                    return (
                      <Button
                        key={index}
                        variant="outline"
                        className="h-16 p-4 justify-start"
                        onClick={action.action}
                      >
                        <div className={`p-2 rounded-md mr-3 ${action.color}`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-left">
                          <div className="font-medium">{action.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {action.description}
                          </div>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 最近任务 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  最近任务
                </CardTitle>
                <CardDescription>
                  您最近执行的Claude CLI任务
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${
                          task.status === 'completed' ? 'bg-green-500' :
                          task.status === 'running' ? 'bg-blue-500 animate-pulse' :
                          'bg-gray-400'
                        }`} />
                        <div>
                          <p className="font-medium">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {task.project}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        {task.time}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <Button variant="outline" className="w-full">
                    查看所有任务
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 系统状态 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Server className="h-5 w-5 mr-2" />
              系统状态
            </CardTitle>
            <CardDescription>
              Claude Web平台运行状态
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm">API服务</span>
                <span className="text-sm text-muted-foreground">正常</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm">数据库</span>
                <span className="text-sm text-muted-foreground">正常</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm">任务队列</span>
                <span className="text-sm text-muted-foreground">正常</span>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  )
}

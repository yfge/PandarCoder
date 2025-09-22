'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CreateTaskForm } from '@/components/tasks/create-task-form'
import { 
  Plus, 
  Search, 
  Play, 
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  Calendar, 
  Activity,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Loader2,
  Filter
} from 'lucide-react'
import { api } from '@/api'

interface Task {
  id: number
  name: string
  description?: string
  command: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  project_id?: number
  project?: {
    id: number
    name: string
  }
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  output?: string
}

interface TaskListResponse {
  items: Task[]
  total: number
  page: number
  limit: number
  has_next: boolean
  has_prev: boolean
}

interface TaskStats {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  success_rate: number
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [totalTasks, setTotalTasks] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    success_rate: 0
  })

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // 模拟API调用，实际需要调用真实的API
      const response: TaskListResponse = await api.tasks.getTasks({
        page: currentPage,
        limit: 10,
        search: searchQuery || undefined,
        status: statusFilter || undefined
      })
      
      setTasks(response.items)
      setTotalTasks(response.total)
    } catch (err: any) {
      console.error('Load tasks error:', err)
      setError(err.response?.data?.detail || err.message || '加载任务失败')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  // 加载统计数据
  const loadStats = async () => {
    try {
      const statsData = await api.tasks.getTaskStats()
      setStats(statsData)
    } catch (err) {
      console.error('Load stats error:', err)
    }
  }

  // 初始加载
  useEffect(() => {
    loadTasks()
    loadStats()
  }, [currentPage, searchQuery, statusFilter])

  // 创建任务成功回调
  const handleCreateSuccess = (newTask: Task) => {
    setTasks(prev => [newTask, ...prev])
    setTotalTasks(prev => prev + 1)
    setShowCreateForm(false)
    loadStats() // 重新加载统计数据
  }

  // 搜索处理
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    loadTasks()
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 获取状态显示信息
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: '待执行', color: 'bg-gray-100 text-gray-800', icon: Clock }
      case 'running':
        return { label: '执行中', color: 'bg-blue-100 text-blue-800', icon: Play }
      case 'completed':
        return { label: '已完成', color: 'bg-green-100 text-green-800', icon: CheckCircle }
      case 'failed':
        return { label: '失败', color: 'bg-red-100 text-red-800', icon: XCircle }
      case 'cancelled':
        return { label: '已取消', color: 'bg-orange-100 text-orange-800', icon: Pause }
      default:
        return { label: '未知', color: 'bg-gray-100 text-gray-800', icon: Clock }
    }
  }

  // 任务操作
  const handleTaskAction = async (taskId: number, action: string) => {
    try {
      await api.tasks.performTaskAction(taskId, action)
      loadTasks() // 重新加载任务列表
      loadStats() // 重新加载统计数据
    } catch (err) {
      console.error('Task action error:', err)
    }
  }

  if (showCreateForm) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="container mx-auto py-8">
            <CreateTaskForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        </MainLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-6">
          {/* 页面标题和操作 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">任务管理</h1>
              <p className="text-muted-foreground">
                管理和监控您的所有Claude任务
              </p>
            </div>
            <Button 
              onClick={() => setShowCreateForm(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              新建任务
            </Button>
          </div>

          {/* 统计卡片 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总任务数</CardTitle>
                <Activity className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.running} 个正在执行
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.success_rate}%</div>
                <p className="text-xs text-muted-foreground">
                  {stats.completed} 个成功任务
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">失败任务</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.failed}</div>
                <p className="text-xs text-muted-foreground">
                  需要处理的问题
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">待执行</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pending}</div>
                <p className="text-xs text-muted-foreground">
                  等待处理的任务
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 搜索和筛选 */}
          <Card>
            <CardHeader>
              <CardTitle>任务列表</CardTitle>
              <CardDescription>
                查看和管理您的所有任务
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2 mb-4">
                <form onSubmit={handleSearch} className="flex space-x-2 flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="搜索任务名称或命令..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button type="submit" variant="outline">
                    搜索
                  </Button>
                </form>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">全部状态</option>
                  <option value="pending">待执行</option>
                  <option value="running">执行中</option>
                  <option value="completed">已完成</option>
                  <option value="failed">失败</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>

              {/* 任务列表 */}
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">加载中...</span>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-4">{error}</p>
                  <Button onClick={loadTasks} variant="outline">
                    重新加载
                  </Button>
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchQuery || statusFilter ? '未找到匹配的任务' : '还没有任务'}
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {searchQuery || statusFilter ? '尝试调整搜索或筛选条件' : '创建您的第一个任务开始自动化工作'}
                  </p>
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    创建任务
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasks.map((task) => {
                    const statusInfo = getStatusInfo(task.status)
                    const StatusIcon = statusInfo.icon
                    
                    return (
                      <Card key={task.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="text-lg font-semibold">{task.name}</h3>
                                <Badge className={statusInfo.color}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {statusInfo.label}
                                </Badge>
                                {task.project && (
                                  <Badge variant="outline">
                                    {task.project.name}
                                  </Badge>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-gray-600 mb-2 line-clamp-1">
                                  {task.description}
                                </p>
                              )}
                              <div className="bg-gray-100 rounded-md p-2 mb-3">
                                <code className="text-sm text-gray-800 font-mono">
                                  {task.command}
                                </code>
                              </div>
                              <div className="flex items-center space-x-4 text-sm text-gray-500">
                                <div className="flex items-center">
                                  <Calendar className="h-4 w-4 mr-1" />
                                  {formatDate(task.created_at)}
                                </div>
                                {task.started_at && (
                                  <div className="flex items-center">
                                    <Play className="h-4 w-4 mr-1" />
                                    {formatDate(task.started_at)}
                                  </div>
                                )}
                                {task.completed_at && (
                                  <div className="flex items-center">
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    {formatDate(task.completed_at)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {task.status === 'pending' && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleTaskAction(task.id, 'start')}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  执行
                                </Button>
                              )}
                              {task.status === 'running' && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleTaskAction(task.id, 'cancel')}
                                >
                                  <Pause className="h-4 w-4 mr-1" />
                                  取消
                                </Button>
                              )}
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4 mr-1" />
                                查看
                              </Button>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* 分页 */}
              {totalTasks > 10 && (
                <div className="flex justify-center mt-6">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                    >
                      上一页
                    </Button>
                    <span className="flex items-center px-4 py-2">
                      第 {currentPage} 页，共 {Math.ceil(totalTasks / 10)} 页
                    </span>
                    <Button
                      variant="outline"
                      disabled={currentPage >= Math.ceil(totalTasks / 10)}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  )
}
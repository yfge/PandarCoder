'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CreateProjectForm } from '@/components/projects/create-project-form'
import { GitHubImportForm } from '@/components/projects/github-import-form'
import { 
  Plus, 
  Search, 
  GitBranch, 
  Calendar, 
  Activity,
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  Eye,
  Loader2,
  Github
} from 'lucide-react'
import { api } from '@/api'
import type { Project, ProjectListResponse } from '@/api/projects'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showGithubImport, setShowGithubImport] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [totalProjects, setTotalProjects] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [stats, setStats] = useState({
    total_projects: 0,
    active_projects: 0,
    total_tasks: 0,
    successful_tasks: 0,
    failed_tasks: 0,
    success_rate: 0
  })

  // 加载项目列表
  const loadProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response: ProjectListResponse = await api.projects.getProjects({
        page: currentPage,
        limit: 10,
        search: searchQuery || undefined
      })
      
      setProjects(response.items)
      setTotalProjects(response.total)
    } catch (err: any) {
      console.error('Load projects error:', err)
      setError(err.response?.data?.detail || err.message || '加载项目失败')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  // 加载统计数据
  const loadStats = async () => {
    try {
      const statsData = await api.projects.getProjectStats()
      setStats(statsData)
    } catch (err) {
      console.error('Load stats error:', err)
    }
  }

  // 初始加载
  useEffect(() => {
    loadProjects()
    loadStats()
  }, [currentPage, searchQuery])

  // 创建项目成功回调
  const handleCreateSuccess = (newProject: Project) => {
    setProjects(prev => [newProject, ...prev])
    setTotalProjects(prev => prev + 1)
    setShowCreateForm(false)
    setStats(prev => ({
      ...prev,
      total_projects: prev.total_projects + 1,
      active_projects: prev.active_projects + 1
    }))
  }

  // 搜索处理
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    loadProjects()
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'archived': return 'text-orange-600 bg-orange-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (showCreateForm) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="container mx-auto py-8">
            <CreateProjectForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        </MainLayout>
      </ProtectedRoute>
    )
  }

  if (showGithubImport) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="container mx-auto py-8">
            <GitHubImportForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setShowGithubImport(false)}
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
              <h1 className="text-3xl font-bold tracking-tight">项目管理</h1>
              <p className="text-muted-foreground">
                管理您的所有Claude Web项目
              </p>
            </div>
            <div className="flex space-x-3">
              <Button 
                onClick={() => setShowGithubImport(true)}
                variant="outline"
                className="flex items-center"
              >
                <Github className="h-4 w-4 mr-2" />
                GitHub导入
              </Button>
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                新建项目
              </Button>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总项目数</CardTitle>
                <GitBranch className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_projects}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.active_projects} 个活跃项目
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总任务数</CardTitle>
                <Activity className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_tasks}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.successful_tasks} 个成功任务
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
                <div className="h-4 w-4 rounded-full bg-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.success_rate}%</div>
                <p className="text-xs text-muted-foreground">
                  基于 {stats.total_tasks} 个任务
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">失败任务</CardTitle>
                <div className="h-4 w-4 rounded-full bg-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.failed_tasks}</div>
                <p className="text-xs text-muted-foreground">
                  需要处理的问题
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 搜索和筛选 */}
          <Card>
            <CardHeader>
              <CardTitle>项目列表</CardTitle>
              <CardDescription>
                查看和管理您的所有项目
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex space-x-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="搜索项目名称或描述..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button type="submit" variant="outline">
                  搜索
                </Button>
              </form>

              {/* 项目列表 */}
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">加载中...</span>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-4">{error}</p>
                  <Button onClick={loadProjects} variant="outline">
                    重新加载
                  </Button>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-8">
                  <GitBranch className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchQuery ? '未找到匹配的项目' : '还没有项目'}
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {searchQuery ? '尝试调整搜索条件' : '创建您的第一个项目开始使用Claude Web'}
                  </p>
                  <Button onClick={() => setShowCreateForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    创建项目
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((project) => (
                    <Card key={project.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="text-lg font-semibold">{project.name}</h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                                {project.status === 'active' ? '活跃' : 
                                 project.status === 'inactive' ? '非活跃' : '已归档'}
                              </span>
                            </div>
                            {project.description && (
                              <p className="text-gray-600 mb-3 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              {project.git_url && (
                                <div className="flex items-center">
                                  <GitBranch className="h-4 w-4 mr-1" />
                                  Git仓库
                                </div>
                              )}
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(project.created_at)}
                              </div>
                              {project.last_activity && (
                                <div className="flex items-center">
                                  <Activity className="h-4 w-4 mr-1" />
                                  {formatDate(project.last_activity)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              查看
                            </Button>
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4 mr-1" />
                              编辑
                            </Button>
                            <Button variant="outline" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* 分页 */}
              {totalProjects > 10 && (
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
                      第 {currentPage} 页，共 {Math.ceil(totalProjects / 10)} 页
                    </span>
                    <Button
                      variant="outline"
                      disabled={currentPage >= Math.ceil(totalProjects / 10)}
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
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
import { api } from '@/api'

interface Project {
  id: number
  name: string
}

interface Task {
  id: number
  name: string
  description?: string
  command: string
  status: string
  project_id?: number
  created_at: string
}

interface CreateTaskFormProps {
  onSuccess: (task: Task) => void
  onCancel: () => void
  projectId?: number
}

export function CreateTaskForm({ onSuccess, onCancel, projectId }: CreateTaskFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    command: '',
    project_id: projectId ? String(projectId) : 'none',
    schedule: '',
    priority: 'medium'
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoadingProjects(true)
        const response = await api.projects.getProjects({ limit: 100 })
        setProjects(response.items)
      } catch (err) {
        console.error('Failed to load projects:', err)
      } finally {
        setLoadingProjects(false)
      }
    }
    
    loadProjects()
  }, [])

  // 处理输入变化
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // 清除错误信息
    if (error) {
      setError(null)
    }
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 基本验证
    if (!formData.name.trim()) {
      setError('任务名称不能为空')
      return
    }
    
    if (!formData.command.trim()) {
      setError('命令不能为空')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // 准备提交数据
      const submitData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        command: formData.command.trim(),
        project_id: formData.project_id && formData.project_id !== 'none' ? parseInt(formData.project_id) : undefined,
        priority: formData.priority,
        schedule: formData.schedule || undefined
      }

      const task = await api.tasks.createTask(submitData)
      onSuccess(task)
    } catch (err: any) {
      console.error('Create task error:', err)
      setError(err.response?.data?.detail || err.message || '创建任务失败')
    } finally {
      setLoading(false)
    }
  }

  // 常用命令模板
  const commandTemplates = [
    {
      name: 'Git Status',
      command: 'git status',
      description: '查看Git仓库状态'
    },
    {
      name: '运行测试',
      command: 'npm test',
      description: '运行项目测试'
    },
    {
      name: '构建项目',
      command: 'npm run build',
      description: '构建生产版本'
    },
    {
      name: '代码检查',
      command: 'npm run lint',
      description: '检查代码规范'
    },
    {
      name: '安装依赖',
      command: 'npm install',
      description: '安装项目依赖'
    }
  ]

  // 应用命令模板
  const applyTemplate = (template: typeof commandTemplates[0]) => {
    setFormData(prev => ({
      ...prev,
      name: prev.name || template.name,
      description: prev.description || template.description,
      command: template.command
    }))
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>创建新任务</CardTitle>
              <CardDescription>
                配置一个新的自动化任务
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">任务名称 *</Label>
                  <Input
                    id="name"
                    placeholder="输入任务名称"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">任务描述</Label>
                  <Textarea
                    id="description"
                    placeholder="输入任务描述（可选）"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    disabled={loading}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project">关联项目</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => handleInputChange('project_id', value)}
                    disabled={loading || loadingProjects}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingProjects ? "加载项目中..." : "选择项目（可选）"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不关联项目</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 命令配置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="command">执行命令 *</Label>
                <div className="text-sm text-gray-500">
                  或选择模板：
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                {commandTemplates.map((template, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(template)}
                    disabled={loading}
                    className="justify-start text-left"
                  >
                    <Plus className="h-3 w-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{template.name}</span>
                  </Button>
                ))}
              </div>

              <Textarea
                id="command"
                placeholder="输入要执行的命令，例如：npm run build"
                value={formData.command}
                onChange={(e) => handleInputChange('command', e.target.value)}
                disabled={loading}
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {/* 高级选项 */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">优先级</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleInputChange('priority', value)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">低</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="urgent">紧急</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule">定时执行</Label>
                  <Input
                    id="schedule"
                    placeholder="如：0 9 * * 1-5（工作日早9点）"
                    value={formData.schedule}
                    onChange={(e) => handleInputChange('schedule', e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* 错误信息 */}
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex justify-end space-x-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={loading || !formData.name.trim() || !formData.command.trim()}
                className="min-w-[100px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  '创建任务'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
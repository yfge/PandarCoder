'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, XCircle, GitBranch, FolderPlus } from 'lucide-react'
import { api } from '@/api'
import type { CreateProjectRequest } from '@/api/projects'

// 表单验证schema
const createProjectSchema = z.object({
  name: z.string()
    .min(1, '项目名称不能为空')
    .max(100, '项目名称不能超过100个字符')
    .regex(/^[\w\u4e00-\u9fa5\-\.]+$/, '项目名称只能包含字母、数字、中文、连字符、下划线和点号'),
  description: z.string()
    .max(1000, '项目描述不能超过1000个字符')
    .optional(),
  git_url: z.string()
    .url('请输入有效的Git仓库URL')
    .optional()
    .or(z.literal('')),
  branch: z.string()
    .max(100, '分支名称不能超过100个字符')
    .optional()
})

type CreateProjectFormData = z.infer<typeof createProjectSchema>

interface CreateProjectFormProps {
  onSuccess?: (project: any) => void
  onCancel?: () => void
}

export function CreateProjectForm({ onSuccess, onCancel }: CreateProjectFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nameAvailability, setNameAvailability] = useState<{
    checking: boolean
    available: boolean | null
    suggestions?: string[]
  }>({
    checking: false,
    available: null
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      git_url: '',
      branch: 'main'
    }
  })

  const watchedName = watch('name')

  // 检查项目名称可用性
  React.useEffect(() => {
    const checkNameAvailability = async () => {
      if (!watchedName || watchedName.length < 2) {
        setNameAvailability({ checking: false, available: null })
        return
      }

      setNameAvailability({ checking: true, available: null })
      
      try {
        const result = await api.projects.checkProjectNameAvailability(watchedName)
        setNameAvailability({
          checking: false,
          available: result.available,
          suggestions: result.suggestions
        })
      } catch (error) {
        setNameAvailability({ checking: false, available: null })
      }
    }

    const debounceTimer = setTimeout(checkNameAvailability, 500)
    return () => clearTimeout(debounceTimer)
  }, [watchedName])

  const onSubmit = async (data: CreateProjectFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const projectData: CreateProjectRequest = {
        name: data.name,
        description: data.description || undefined,
        git_url: data.git_url || undefined,
        branch: data.branch || 'main',
        settings: {
          auto_deploy: false,
          notification_enabled: true,
          environment_variables: {},
          build_command: undefined,
          test_command: undefined
        }
      }

      const project = await api.projects.createProject(projectData)
      
      if (onSuccess) {
        onSuccess(project)
      }
    } catch (error: any) {
      console.error('Create project error:', error)
      setSubmitError(
        error.response?.data?.detail || 
        error.message || 
        '创建项目失败，请稍后重试'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setValue('name', suggestion, { shouldValidate: true })
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <FolderPlus className="h-5 w-5 mr-2" />
          创建新项目
        </CardTitle>
        <CardDescription>
          创建一个新的Claude Web项目，开始您的开发之旅
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* 项目名称 */}
          <div className="space-y-2">
            <Label htmlFor="name">项目名称 *</Label>
            <div className="relative">
              <Input
                id="name"
                {...register('name')}
                placeholder="输入项目名称"
                className={errors.name ? 'border-red-500' : ''}
              />
              {nameAvailability.checking && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
              )}
              {!nameAvailability.checking && nameAvailability.available === true && (
                <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
              )}
              {!nameAvailability.checking && nameAvailability.available === false && (
                <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
              )}
            </div>
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
            {nameAvailability.available === false && (
              <div className="text-sm text-red-500">
                <p>该项目名称已存在</p>
                {nameAvailability.suggestions && nameAvailability.suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1">建议的替代名称：</p>
                    <div className="flex flex-wrap gap-2">
                      {nameAvailability.suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 项目描述 */}
          <div className="space-y-2">
            <Label htmlFor="description">项目描述</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="描述您的项目用途和特点"
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Git仓库URL */}
          <div className="space-y-2">
            <Label htmlFor="git_url" className="flex items-center">
              <GitBranch className="h-4 w-4 mr-1" />
              Git仓库URL
            </Label>
            <Input
              id="git_url"
              {...register('git_url')}
              placeholder="https://github.com/username/repository.git"
              className={errors.git_url ? 'border-red-500' : ''}
            />
            {errors.git_url && (
              <p className="text-sm text-red-500">{errors.git_url.message}</p>
            )}
            <p className="text-xs text-gray-500">
              可选：如果您有Git仓库，请输入URL以便自动同步代码
            </p>
          </div>

          {/* Git分支 */}
          <div className="space-y-2">
            <Label htmlFor="branch">默认分支</Label>
            <Input
              id="branch"
              {...register('branch')}
              placeholder="main"
              className={errors.branch ? 'border-red-500' : ''}
            />
            {errors.branch && (
              <p className="text-sm text-red-500">{errors.branch.message}</p>
            )}
          </div>

          {/* 错误提示 */}
          {submitError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* 按钮组 */}
          <div className="flex justify-end space-x-4 pt-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                取消
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !isValid || nameAvailability.available === false}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                '创建项目'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
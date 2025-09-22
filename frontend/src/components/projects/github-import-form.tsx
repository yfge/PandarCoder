'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Github, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  GitBranch,
  Star,
  Eye,
  GitFork,
  Calendar,
  Search,
  ArrowLeft
} from 'lucide-react'
import { api } from '@/api'

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  clone_url: string
  ssh_url: string
  default_branch: string
  language: string | null
  stargazers_count: number
  watchers_count: number
  forks_count: number
  created_at: string
  updated_at: string
  pushed_at: string
  private: boolean
  archived: boolean
  disabled: boolean
}

interface Branch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
}

interface GitHubImportFormProps {
  onSuccess: (project: any) => void
  onCancel: () => void
}

export function GitHubImportForm({ onSuccess, onCancel }: GitHubImportFormProps) {
  const [step, setStep] = useState<'url' | 'repo-select' | 'configure'>('url')
  const [githubUrl, setGithubUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 仓库相关状态
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [repositories, setRepositories] = useState<GitHubRepo[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  
  // 项目配置
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  
  // 解析GitHub URL
  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    const patterns = [
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?(?:\/)?$/,
      /^git@github\.com:([^\/]+)\/([^\/]+)\.git$/
    ]
    
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return { owner: match[1], repo: match[2] }
      }
    }
    return null
  }

  // 搜索GitHub仓库
  const searchRepositories = async (query: string) => {
    if (!query.trim()) return
    
    try {
      setLoading(true)
      setError(null)
      
      // 这里应该调用GitHub API搜索，为了演示使用模拟数据
      const mockRepos: GitHubRepo[] = [
        {
          id: 1,
          name: 'claude-web',
          full_name: 'user/claude-web',
          description: 'Remote Claude CLI Control Platform',
          html_url: 'https://github.com/user/claude-web',
          clone_url: 'https://github.com/user/claude-web.git',
          ssh_url: 'git@github.com:user/claude-web.git',
          default_branch: 'main',
          language: 'TypeScript',
          stargazers_count: 42,
          watchers_count: 15,
          forks_count: 8,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          pushed_at: '2024-01-15T10:30:00Z',
          private: false,
          archived: false,
          disabled: false
        }
      ]
      
      setRepositories(mockRepos)
      setStep('repo-select')
    } catch (err: any) {
      setError(err.message || '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  // 通过URL导入
  const importByUrl = async () => {
    const parsed = parseGitHubUrl(githubUrl)
    if (!parsed) {
      setError('请输入有效的GitHub仓库URL')
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      
      // 获取仓库信息（模拟）
      const mockRepo: GitHubRepo = {
        id: 1,
        name: parsed.repo,
        full_name: `${parsed.owner}/${parsed.repo}`,
        description: 'Imported from GitHub',
        html_url: githubUrl,
        clone_url: githubUrl,
        ssh_url: `git@github.com:${parsed.owner}/${parsed.repo}.git`,
        default_branch: 'main',
        language: 'TypeScript',
        stargazers_count: 0,
        watchers_count: 0,
        forks_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pushed_at: new Date().toISOString(),
        private: false,
        archived: false,
        disabled: false
      }
      
      setSelectedRepo(mockRepo)
      setProjectName(mockRepo.name)
      setProjectDescription(mockRepo.description || '')
      setStep('configure')
      
      // 获取分支信息
      loadBranches(mockRepo)
    } catch (err: any) {
      setError(err.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  // 选择仓库
  const selectRepository = (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setProjectName(repo.name)
    setProjectDescription(repo.description || '')
    setStep('configure')
    loadBranches(repo)
  }

  // 加载分支列表
  const loadBranches = async (repo: GitHubRepo) => {
    try {
      // 模拟分支数据
      const mockBranches: Branch[] = [
        {
          name: 'main',
          commit: { sha: 'abc123', url: '' },
          protected: true
        },
        {
          name: 'develop',
          commit: { sha: 'def456', url: '' },
          protected: false
        },
        {
          name: 'feature/auth',
          commit: { sha: 'ghi789', url: '' },
          protected: false
        }
      ]
      
      setBranches(mockBranches)
      setSelectedBranch(repo.default_branch)
    } catch (err) {
      console.error('Failed to load branches:', err)
    }
  }

  // 创建项目
  const createProject = async () => {
    if (!selectedRepo || !projectName.trim()) {
      setError('请填写项目名称')
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      
      const projectData = {
        name: projectName,
        description: projectDescription,
        git_url: selectedRepo.clone_url,
        branch: selectedBranch || selectedRepo.default_branch,
        source: 'github',
        github_repo_id: selectedRepo.id,
        settings: {
          auto_deploy: true,
          notification_enabled: true,
          environment_variables: {},
          build_command: undefined,
          test_command: undefined
        }
      }
      
      const project = await api.projects.createProject(projectData)
      onSuccess(project)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || '创建项目失败')
    } finally {
      setLoading(false)
    }
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (step === 'url') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
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
              <CardTitle className="flex items-center">
                <Github className="h-5 w-5 mr-2" />
                导入GitHub项目
              </CardTitle>
              <CardDescription>
                从GitHub导入现有项目到Claude Web
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* URL导入 */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="github-url">GitHub仓库URL</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="github-url"
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={loading}
                />
                <Button 
                  onClick={importByUrl} 
                  disabled={loading || !githubUrl.trim()}
                  className="min-w-[80px]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '导入'}
                </Button>
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">或</span>
            </div>
          </div>

          {/* 搜索导入 */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="search-query">搜索GitHub仓库</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="search-query"
                  placeholder="搜索仓库名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      searchRepositories(searchQuery)
                    }
                  }}
                />
                <Button 
                  onClick={() => searchRepositories(searchQuery)} 
                  disabled={loading || !searchQuery.trim()}
                  variant="outline"
                  className="min-w-[80px]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md flex items-center">
              <XCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (step === 'repo-select') {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('url')}
                className="p-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle>选择仓库</CardTitle>
                <CardDescription>
                  找到 {repositories.length} 个仓库
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {repositories.map((repo) => (
              <Card 
                key={repo.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => selectRepository(repo)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-blue-600">
                          {repo.full_name}
                        </h3>
                        {repo.private && (
                          <Badge variant="secondary">Private</Badge>
                        )}
                        {repo.archived && (
                          <Badge variant="outline">Archived</Badge>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-gray-600 mb-3 line-clamp-2">
                          {repo.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        {repo.language && (
                          <div className="flex items-center">
                            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
                            {repo.language}
                          </div>
                        )}
                        <div className="flex items-center">
                          <Star className="h-4 w-4 mr-1" />
                          {repo.stargazers_count}
                        </div>
                        <div className="flex items-center">
                          <GitFork className="h-4 w-4 mr-1" />
                          {repo.forks_count}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          更新于 {formatDate(repo.updated_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Badge variant="outline">
                        <GitBranch className="h-3 w-3 mr-1" />
                        {repo.default_branch}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'configure') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep('repo-select')}
              className="p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>配置项目</CardTitle>
              <CardDescription>
                配置从 {selectedRepo?.full_name} 导入的项目
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 项目名称 */}
          <div className="space-y-2">
            <Label htmlFor="project-name">项目名称 *</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* 项目描述 */}
          <div className="space-y-2">
            <Label htmlFor="project-description">项目描述</Label>
            <Input
              id="project-description"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* 分支选择 */}
          <div className="space-y-2">
            <Label htmlFor="branch">选择分支</Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <SelectValue placeholder="选择分支" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <div className="flex items-center space-x-2">
                      <GitBranch className="h-4 w-4" />
                      <span>{branch.name}</span>
                      {branch.protected && (
                        <Badge variant="outline" className="text-xs">
                          Protected
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 仓库信息 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium mb-2">仓库信息</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <div>URL: {selectedRepo?.html_url}</div>
              <div>默认分支: {selectedRepo?.default_branch}</div>
              {selectedRepo?.language && <div>主要语言: {selectedRepo.language}</div>}
            </div>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md flex items-center">
              <XCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end space-x-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('repo-select')}
              disabled={loading}
            >
              返回
            </Button>
            <Button
              onClick={createProject}
              disabled={loading || !projectName.trim()}
              className="min-w-[100px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                '创建项目'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
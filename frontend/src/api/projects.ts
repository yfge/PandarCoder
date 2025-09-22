/**
 * 项目相关API
 */
import { apiClient } from '@/lib/api'

// 类型定义
export interface Project {
  id: string
  name: string
  description?: string
  git_url?: string
  branch?: string
  status: 'active' | 'inactive' | 'archived'
  owner_id: string
  created_at: string
  updated_at: string
  last_activity?: string
  settings?: ProjectSettings
}

export interface ProjectSettings {
  auto_deploy: boolean
  notification_enabled: boolean
  environment_variables: Record<string, string>
  build_command?: string
  test_command?: string
}

export interface CreateProjectRequest {
  name: string
  description?: string
  git_url?: string
  branch?: string
  source?: 'github' | 'gitlab' | 'manual'
  github_repo_id?: number
  settings?: Partial<ProjectSettings>
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
  git_url?: string
  branch?: string
  status?: Project['status']
  settings?: Partial<ProjectSettings>
}

export interface ProjectListParams {
  page?: number
  limit?: number
  search?: string
  status?: Project['status']
  owner_id?: string
  sort_by?: 'name' | 'created_at' | 'updated_at' | 'last_activity'
  sort_order?: 'asc' | 'desc'
}

export interface ProjectListResponse {
  items: Project[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface ProjectStats {
  total_projects: number
  active_projects: number
  total_tasks: number
  successful_tasks: number
  failed_tasks: number
  success_rate: number
}

export interface ProjectEnvironmentVariables {
  environment_variables: Record<string, string>
  detected_env_vars: Record<string, any>
}

export interface ProjectEnvironmentUpdate {
  environment_variables: Record<string, string>
}

export interface DetectedEnvVar {
  name: string
  description?: string
  default_value?: string
  source_file: string
  line_number: number
  required: boolean
  category: string
}

export interface ProjectEnvDetectionResponse {
  detected_vars: DetectedEnvVar[]
  total_found: number
  source_files: string[]
  suggestions: string[]
}

// 项目API服务类
export class ProjectApiService {
  private static readonly BASE_PATH = '/api/v1/projects'

  /**
   * 获取项目列表
   */
  static async getProjects(params?: ProjectListParams): Promise<ProjectListResponse> {
    const queryParams = new URLSearchParams()
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString())
        }
      })
    }

    const url = queryParams.toString() 
      ? `${this.BASE_PATH}?${queryParams.toString()}`
      : this.BASE_PATH

    return apiClient.get<ProjectListResponse>(url)
  }

  /**
   * 获取单个项目详情
   */
  static async getProject(id: string): Promise<Project> {
    return apiClient.get<Project>(`${this.BASE_PATH}/${id}`)
  }

  /**
   * 创建新项目
   */
  static async createProject(data: CreateProjectRequest): Promise<Project> {
    return apiClient.post<Project>(this.BASE_PATH, data)
  }

  /**
   * 更新项目
   */
  static async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    return apiClient.put<Project>(`${this.BASE_PATH}/${id}`, data)
  }

  /**
   * 删除项目
   */
  static async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`${this.BASE_PATH}/${id}`)
  }

  /**
   * 归档项目
   */
  static async archiveProject(id: string): Promise<Project> {
    return apiClient.patch<Project>(`${this.BASE_PATH}/${id}/archive`)
  }

  /**
   * 恢复项目
   */
  static async restoreProject(id: string): Promise<Project> {
    return apiClient.patch<Project>(`${this.BASE_PATH}/${id}/restore`)
  }

  /**
   * 克隆Git仓库
   */
  static async cloneRepository(id: string): Promise<{
    task_id: string
    status: string
  }> {
    return apiClient.post<{
      task_id: string
      status: string
    }>(`${this.BASE_PATH}/${id}/clone`)
  }

  /**
   * 拉取最新代码
   */
  static async pullRepository(id: string): Promise<{
    task_id: string
    status: string
  }> {
    return apiClient.post<{
      task_id: string
      status: string
    }>(`${this.BASE_PATH}/${id}/pull`)
  }

  /**
   * 获取项目统计数据
   */
  static async getProjectStats(id?: string): Promise<ProjectStats> {
    const url = id ? `${this.BASE_PATH}/${id}/stats` : `${this.BASE_PATH}/stats`
    return apiClient.get<ProjectStats>(url)
  }

  /**
   * 获取项目活动历史
   */
  static async getProjectActivity(id: string, params?: {
    page?: number
    limit?: number
    type?: string
  }): Promise<{
    items: Array<{
      id: string
      type: string
      description: string
      created_at: string
      metadata?: Record<string, any>
    }>
    total: number
    page: number
    limit: number
  }> {
    const queryParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString())
        }
      })
    }

    const url = queryParams.toString()
      ? `${this.BASE_PATH}/${id}/activity?${queryParams.toString()}`
      : `${this.BASE_PATH}/${id}/activity`

    return apiClient.get(url)
  }

  /**
   * 获取项目文件树
   */
  static async getProjectFiles(id: string, path: string = ''): Promise<{
    files: Array<{
      name: string
      path: string
      type: 'file' | 'directory'
      size?: number
      modified_at: string
    }>
    current_path: string
  }> {
    const queryParams = path ? `?path=${encodeURIComponent(path)}` : ''
    return apiClient.get(`${this.BASE_PATH}/${id}/files${queryParams}`)
  }

  /**
   * 获取文件内容
   */
  static async getFileContent(id: string, filePath: string): Promise<{
    content: string
    encoding: string
    size: number
    modified_at: string
  }> {
    return apiClient.get(`${this.BASE_PATH}/${id}/files/content`, {
      params: { path: filePath }
    })
  }

  /**
   * 更新项目设置
   */
  static async updateProjectSettings(
    id: string, 
    settings: Partial<ProjectSettings>
  ): Promise<ProjectSettings> {
    return apiClient.put<ProjectSettings>(`${this.BASE_PATH}/${id}/settings`, settings)
  }

  /**
   * 获取项目环境变量
   */
  static async getEnvironmentVariables(id: string): Promise<ProjectEnvironmentVariables> {
    return apiClient.get(`${this.BASE_PATH}/${id}/environment`)
  }

  /**
   * 更新项目环境变量
   */
  static async updateEnvironmentVariables(
    id: string, 
    variables: ProjectEnvironmentUpdate
  ): Promise<{ environment_variables: Record<string, string>; message: string }> {
    return apiClient.put(`${this.BASE_PATH}/${id}/environment`, variables)
  }

  /**
   * AI自动检测项目环境变量
   */
  static async detectEnvironmentVariables(id: string): Promise<ProjectEnvDetectionResponse> {
    return apiClient.post(`${this.BASE_PATH}/${id}/detect-env`, {})
  }

  /**
   * 搜索项目
   */
  static async searchProjects(query: string, params?: {
    limit?: number
    filters?: {
      status?: Project['status']
      owner_id?: string
    }
  }): Promise<{
    items: Project[]
    total: number
    query: string
  }> {
    const searchParams = new URLSearchParams({ q: query })
    
    if (params?.limit) {
      searchParams.append('limit', params.limit.toString())
    }
    
    if (params?.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(`filter_${key}`, value.toString())
        }
      })
    }

    return apiClient.get(`${this.BASE_PATH}/search?${searchParams.toString()}`)
  }

  /**
   * 获取我的项目
   */
  static async getMyProjects(params?: Omit<ProjectListParams, 'owner_id'>): Promise<ProjectListResponse> {
    return this.getProjects({ ...params, owner_id: 'me' })
  }

  /**
   * 获取最近使用的项目
   */
  static async getRecentProjects(limit: number = 10): Promise<Project[]> {
    return apiClient.get(`${this.BASE_PATH}/recent?limit=${limit}`)
  }

  /**
   * 检查项目名称是否可用
   */
  static async checkProjectNameAvailability(name: string): Promise<{
    available: boolean
    suggestions?: string[]
  }> {
    return apiClient.get(`${this.BASE_PATH}/check-name`, {
      params: { name }
    })
  }
}

export default ProjectApiService
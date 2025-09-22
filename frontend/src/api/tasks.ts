/**
 * 任务相关API
 */
import { apiClient } from '@/lib/api'

// 类型定义
export interface Task {
  id: number
  project_id?: number
  name: string
  description?: string
  command: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  duration?: number // 执行时间（秒）
  output?: string
  error?: string
  exit_code?: number
  progress?: number // 0-100
  metadata?: Record<string, any>
  created_by: string
}

export interface CreateTaskRequest {
  project_id?: number
  name: string
  description?: string
  command: string
  priority?: Task['priority']
  scheduled_at?: string
  schedule?: string
  metadata?: Record<string, any>
}

export interface UpdateTaskRequest {
  name?: string
  description?: string
  priority?: Task['priority']
  scheduled_at?: string
  metadata?: Record<string, any>
}

export interface TaskListParams {
  page?: number
  limit?: number
  project_id?: number
  status?: Task['status'] | Task['status'][]
  priority?: Task['priority']
  search?: string
  sort_by?: 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'name' | 'priority'
  sort_order?: 'asc' | 'desc'
  date_from?: string
  date_to?: string
}

export interface TaskListResponse {
  items: Task[]
  total: number
  page: number
  limit: number
  pages?: number
  has_next?: boolean
  has_prev?: boolean
  summary?: {
    pending: number
    running: number
    completed: number
    failed: number
  }
}

export interface TaskExecution {
  id: string
  task_id: string
  status: Task['status']
  started_at: string
  completed_at?: string
  duration?: number
  output: string
  error?: string
  exit_code?: number
}

export interface TaskTemplate {
  id: string
  name: string
  description?: string
  command: string
  category: string
  parameters: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'select'
    required: boolean
    default_value?: any
    options?: string[]
    description?: string
  }>
  created_at: string
}

// 任务API服务类
export class TaskApiService {
  private static readonly BASE_PATH = '/api/v1/tasks'

  /**
   * 获取任务列表
   */
  static async getTasks(params?: TaskListParams): Promise<TaskListResponse> {
    const queryParams = new URLSearchParams()
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(key, v.toString()))
          } else {
            queryParams.append(key, value.toString())
          }
        }
      })
    }

    const url = queryParams.toString() 
      ? `${this.BASE_PATH}?${queryParams.toString()}`
      : this.BASE_PATH

    return apiClient.get<TaskListResponse>(url)
  }

  /**
   * 获取单个任务详情
   */
  static async getTask(id: number | string): Promise<Task> {
    return apiClient.get<Task>(`${this.BASE_PATH}/${id}`)
  }

  /**
   * 创建新任务
   */
  static async createTask(data: CreateTaskRequest): Promise<Task> {
    return apiClient.post<Task>(this.BASE_PATH, data)
  }

  /**
   * 更新任务
   */
  static async updateTask(id: number | string, data: UpdateTaskRequest): Promise<Task> {
    return apiClient.put<Task>(`${this.BASE_PATH}/${id}`, data)
  }

  /**
   * 删除任务
   */
  static async deleteTask(id: number | string): Promise<void> {
    await apiClient.delete(`${this.BASE_PATH}/${id}`)
  }

  /**
   * 执行任务
   */
  static async executeTask(id: number | string): Promise<{
    execution_id: string
    status: string
  }> {
    return apiClient.post(`${this.BASE_PATH}/${id}/execute`)
  }

  /**
   * 取消任务执行
   */
  static async cancelTask(id: number | string): Promise<Task> {
    return apiClient.post<Task>(`${this.BASE_PATH}/${id}/cancel`)
  }

  /**
   * 重新运行任务
   */
  static async retryTask(id: number | string): Promise<{
    execution_id: string
    status: string
  }> {
    return apiClient.post(`${this.BASE_PATH}/${id}/retry`)
  }

  /**
   * 获取任务输出（实时）
   */
  static async getTaskOutput(id: string, params?: {
    follow?: boolean
    tail?: number
  }): Promise<{
    output: string
    is_complete: boolean
    timestamp: string
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
      ? `${this.BASE_PATH}/${id}/output?${queryParams.toString()}`
      : `${this.BASE_PATH}/${id}/output`

    return apiClient.get(url)
  }

  /**
   * 获取任务执行历史
   */
  static async getTaskExecutions(id: string, params?: {
    page?: number
    limit?: number
  }): Promise<{
    items: TaskExecution[]
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
      ? `${this.BASE_PATH}/${id}/executions?${queryParams.toString()}`
      : `${this.BASE_PATH}/${id}/executions`

    return apiClient.get(url)
  }

  /**
   * 批量操作任务
   */
  static async batchOperationTasks(
    taskIds: string[],
    operation: 'execute' | 'cancel' | 'delete'
  ): Promise<{
    success: string[]
    failed: Array<{ id: string; error: string }>
  }> {
    return apiClient.post(`${this.BASE_PATH}/batch`, {
      task_ids: taskIds,
      operation
    })
  }

  /**
   * 获取任务统计
   */
  static async getTaskStats(params?: {
    project_id?: number
    date_from?: string
    date_to?: string
  }): Promise<{
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    cancelled: number
    success_rate: number
    by_status?: Record<Task['status'], number>
    by_priority?: Record<Task['priority'], number>
    average_duration?: number
    total_duration?: number
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
      ? `${this.BASE_PATH}/stats?${queryParams.toString()}`
      : `${this.BASE_PATH}/stats`

    return apiClient.get(url)
  }

  /**
   * 获取任务模板列表
   */
  static async getTaskTemplates(params?: {
    category?: string
    search?: string
  }): Promise<TaskTemplate[]> {
    const queryParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString())
        }
      })
    }

    const url = queryParams.toString()
      ? `${this.BASE_PATH}/templates?${queryParams.toString()}`
      : `${this.BASE_PATH}/templates`

    return apiClient.get<TaskTemplate[]>(url)
  }

  /**
   * 根据模板创建任务
   */
  static async createTaskFromTemplate(
    templateId: string,
    data: {
      project_id: string
      name: string
      description?: string
      parameters: Record<string, any>
    }
  ): Promise<Task> {
    return apiClient.post<Task>(`${this.BASE_PATH}/templates/${templateId}/create`, data)
  }

  /**
   * 搜索任务
   */
  static async searchTasks(query: string, params?: {
    project_id?: string
    limit?: number
    filters?: {
      status?: Task['status']
      priority?: Task['priority']
    }
  }): Promise<{
    items: Task[]
    total: number
    query: string
  }> {
    const searchParams = new URLSearchParams({ q: query })
    
    if (params?.project_id) {
      searchParams.append('project_id', params.project_id)
    }
    
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
   * 获取运行中的任务
   */
  static async getRunningTasks(projectId?: string): Promise<Task[]> {
    const params = new URLSearchParams({ status: 'running' })
    if (projectId) {
      params.append('project_id', projectId)
    }

    const response = await this.getTasks({
      status: 'running',
      project_id: projectId,
      sort_by: 'started_at',
      sort_order: 'desc'
    })

    return response.items
  }

  /**
   * 获取最近的任务
   */
  static async getRecentTasks(limit: number = 10, projectId?: string): Promise<Task[]> {
    const response = await this.getTasks({
      limit,
      project_id: projectId,
      sort_by: 'created_at',
      sort_order: 'desc'
    })

    return response.items
  }

  /**
   * 获取失败的任务
   */
  static async getFailedTasks(projectId?: string): Promise<Task[]> {
    const response = await this.getTasks({
      status: 'failed',
      project_id: projectId,
      sort_by: 'updated_at',
      sort_order: 'desc'
    })

    return response.items
  }

  /**
   * 导出任务数据
   */
  static async exportTasks(params?: {
    project_id?: string
    status?: Task['status'][]
    date_from?: string
    date_to?: string
    format: 'csv' | 'json'
  }): Promise<Blob> {
    const queryParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(key, v.toString()))
          } else {
            queryParams.append(key, value.toString())
          }
        }
      })
    }

    const url = queryParams.toString()
      ? `${this.BASE_PATH}/export?${queryParams.toString()}`
      : `${this.BASE_PATH}/export`

    const response = await apiClient.getAxiosInstance().get(url, {
      responseType: 'blob'
    })

    return response.data
  }
}

export default TaskApiService
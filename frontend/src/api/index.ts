/**
 * API模块统一入口
 */

// API客户端
export { apiClient, TokenManager, handleApiError, retryRequest, concurrentRequests } from '@/lib/api'
export type { ApiResponse, ApiError, ApiErrorResponse } from '@/lib/api'

// 认证相关
export { AuthApiService } from './auth'
export type { 
  LoginRequest, 
  RegisterRequest, 
  User, 
  LoginResponse,
  RefreshTokenRequest,
  ChangePasswordRequest,
  ResetPasswordRequest,
  ResetPasswordConfirmRequest
} from './auth'

// 项目相关
export { ProjectApiService } from './projects'
export type {
  Project,
  ProjectSettings,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectListParams,
  ProjectListResponse,
  ProjectStats,
  ProjectEnvironmentVariables,
  ProjectEnvironmentUpdate,
  DetectedEnvVar,
  ProjectEnvDetectionResponse
} from './projects'

// 任务相关
export { TaskApiService } from './tasks'
export type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskListParams,
  TaskListResponse,
  TaskExecution,
  TaskTemplate
} from './tasks'

// 用户相关
export { UserApiService } from './users'
export type {
  UserSettings,
  UserSettingsUpdate
} from './users'

// 常用API方法的简化导出
import { AuthApiService } from './auth'
import { ProjectApiService } from './projects'
import { TaskApiService } from './tasks'
import { UserApiService } from './users'
import { apiClient as _apiClient } from '@/lib/api'

export const api = {
  // 认证
  auth: {
    login: AuthApiService.login.bind(AuthApiService),
    register: AuthApiService.register.bind(AuthApiService),
    logout: AuthApiService.logout.bind(AuthApiService),
    refreshToken: AuthApiService.refreshToken.bind(AuthApiService),
    getCurrentUser: AuthApiService.getCurrentUser.bind(AuthApiService),
    updateCurrentUser: AuthApiService.updateCurrentUser.bind(AuthApiService),
    changePassword: AuthApiService.changePassword.bind(AuthApiService),
    checkAuthStatus: AuthApiService.checkAuthStatus.bind(AuthApiService),
    isAuthenticated: AuthApiService.isAuthenticated.bind(AuthApiService)
  },

  // 项目
  projects: {
    getProjects: ProjectApiService.getProjects.bind(ProjectApiService),
    getProject: ProjectApiService.getProject.bind(ProjectApiService),
    createProject: ProjectApiService.createProject.bind(ProjectApiService),
    updateProject: ProjectApiService.updateProject.bind(ProjectApiService),
    deleteProject: ProjectApiService.deleteProject.bind(ProjectApiService),
    getMyProjects: ProjectApiService.getMyProjects.bind(ProjectApiService),
    getRecentProjects: ProjectApiService.getRecentProjects.bind(ProjectApiService),
    getProjectStats: ProjectApiService.getProjectStats.bind(ProjectApiService),
    searchProjects: ProjectApiService.searchProjects.bind(ProjectApiService),
    cloneRepository: ProjectApiService.cloneRepository.bind(ProjectApiService),
    pullRepository: ProjectApiService.pullRepository.bind(ProjectApiService),
    getEnvironmentVariables: ProjectApiService.getEnvironmentVariables.bind(ProjectApiService),
    updateEnvironmentVariables: ProjectApiService.updateEnvironmentVariables.bind(ProjectApiService),
    detectEnvironmentVariables: ProjectApiService.detectEnvironmentVariables.bind(ProjectApiService)
  },

  // 任务
  tasks: {
    getTasks: TaskApiService.getTasks.bind(TaskApiService),
    getTask: TaskApiService.getTask.bind(TaskApiService),
    createTask: TaskApiService.createTask.bind(TaskApiService),
    updateTask: TaskApiService.updateTask.bind(TaskApiService),
    deleteTask: TaskApiService.deleteTask.bind(TaskApiService),
    executeTask: TaskApiService.executeTask.bind(TaskApiService),
    cancelTask: TaskApiService.cancelTask.bind(TaskApiService),
    retryTask: TaskApiService.retryTask.bind(TaskApiService),
    getTaskOutput: TaskApiService.getTaskOutput.bind(TaskApiService),
    getRunningTasks: TaskApiService.getRunningTasks.bind(TaskApiService),
    getRecentTasks: TaskApiService.getRecentTasks.bind(TaskApiService),
    getTaskStats: TaskApiService.getTaskStats.bind(TaskApiService),
    searchTasks: TaskApiService.searchTasks.bind(TaskApiService),
    performTaskAction: (taskId: number, action: string) => {
      // 根据操作类型调用对应的API方法
      switch (action) {
        case 'start':
        case 'execute':
          return TaskApiService.executeTask(String(taskId))
        case 'cancel':
          return TaskApiService.cancelTask(String(taskId))
        case 'retry':
          return TaskApiService.retryTask(String(taskId))
        default:
          throw new Error(`Unknown action: ${action}`)
      }
    }
  },

  // 用户设置
  users: {
    getSettings: UserApiService.getSettings.bind(UserApiService),
    updateSettings: UserApiService.updateSettings.bind(UserApiService)
  },

  // 系统
  system: {
    healthCheck: _apiClient.healthCheck.bind(_apiClient)
  }
}

export default api
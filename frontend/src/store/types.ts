/**
 * 状态管理类型定义
 */
import { User, Project, Task } from '@/api'

// 认证相关状态类型
export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, full_name: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  getCurrentUser: () => Promise<void>
  updateUser: (data: Partial<User>) => Promise<void>
  checkAuthStatus: () => Promise<void>
  clearError: () => void
}

// 项目相关状态类型
export interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  myProjects: Project[]
  recentProjects: Project[]
  isLoading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface ProjectActions {
  fetchProjects: (params?: any) => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: any) => Promise<Project>
  updateProject: (id: string, data: any) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  fetchMyProjects: () => Promise<void>
  fetchRecentProjects: () => Promise<void>
  searchProjects: (query: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  clearError: () => void
}

// 任务相关状态类型
export interface TaskState {
  tasks: Task[]
  currentTask: Task | null
  runningTasks: Task[]
  recentTasks: Task[]
  failedTasks: Task[]
  isLoading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  taskStats: {
    total: number
    by_status: Record<Task['status'], number>
    by_priority: Record<Task['priority'], number>
    success_rate: number
    average_duration: number
    total_duration: number
  } | null
}

export interface TaskActions {
  fetchTasks: (params?: any) => Promise<void>
  fetchTask: (id: string) => Promise<void>
  createTask: (data: any) => Promise<Task>
  updateTask: (id: string, data: any) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  executeTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  retryTask: (id: string) => Promise<void>
  fetchRunningTasks: (projectId?: string) => Promise<void>
  fetchRecentTasks: (projectId?: string) => Promise<void>
  fetchFailedTasks: (projectId?: string) => Promise<void>
  fetchTaskStats: (projectId?: string) => Promise<void>
  searchTasks: (query: string) => Promise<void>
  setCurrentTask: (task: Task | null) => void
  clearError: () => void
}

// UI相关状态类型
export interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  notifications: Notification[]
  modals: {
    isCreateProjectOpen: boolean
    isCreateTaskOpen: boolean
    isSettingsOpen: boolean
  }
  loading: {
    global: boolean
    local: Record<string, boolean>
  }
}

export interface UIActions {
  toggleTheme: () => void
  setTheme: (theme: UIState['theme']) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  openModal: (modal: keyof UIState['modals']) => void
  closeModal: (modal: keyof UIState['modals']) => void
  setGlobalLoading: (loading: boolean) => void
  setLocalLoading: (key: string, loading: boolean) => void
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  timestamp?: number
}

// 全局应用状态类型
export interface AppState {
  initialized: boolean
  version: string
  environment: 'development' | 'production' | 'test'
  apiStatus: 'connected' | 'disconnected' | 'error'
  lastActivity: number
  features: {
    notifications: boolean
    realtime: boolean
    fileUpload: boolean
  }
}

export interface AppActions {
  initialize: () => Promise<void>
  checkApiStatus: () => Promise<void>
  updateLastActivity: () => void
  toggleFeature: (feature: keyof AppState['features']) => void
}
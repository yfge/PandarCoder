/**
 * 任务状态管理
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api, handleApiError, type Task, type CreateTaskRequest, type UpdateTaskRequest, type TaskListParams } from '@/api'
import type { TaskState, TaskActions } from './types'

interface TaskStore extends TaskState, TaskActions {}

export const useTaskStore = create<TaskStore>()(
  devtools(
    (set, get) => ({
      // 状态
      tasks: [],
      currentTask: null,
      runningTasks: [],
      recentTasks: [],
      failedTasks: [],
      isLoading: false,
      error: null,
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
      },
      taskStats: null,

      // 操作
      fetchTasks: async (params?: TaskListParams) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.tasks.getTasks(params)
          set({
            tasks: response.items,
            pagination: {
              page: response.page,
              limit: response.limit,
              total: response.total,
              pages: response.pages
            },
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      fetchTask: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          const task = await api.tasks.getTask(id)
          set({
            currentTask: task,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      createTask: async (data: CreateTaskRequest) => {
        set({ isLoading: true, error: null })
        try {
          const task = await api.tasks.createTask(data)
          set(state => ({
            tasks: [task, ...state.tasks],
            isLoading: false,
            error: null
          }))
          return task
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      updateTask: async (id: string, data: UpdateTaskRequest) => {
        set({ isLoading: true, error: null })
        try {
          const task = await api.tasks.updateTask(id, data)
          set(state => ({
            tasks: state.tasks.map(t => t.id === id ? task : t),
            currentTask: state.currentTask?.id === id ? task : state.currentTask,
            runningTasks: state.runningTasks.map(t => t.id === id ? task : t),
            recentTasks: state.recentTasks.map(t => t.id === id ? task : t),
            failedTasks: state.failedTasks.map(t => t.id === id ? task : t),
            isLoading: false,
            error: null
          }))
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      deleteTask: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await api.tasks.deleteTask(id)
          set(state => ({
            tasks: state.tasks.filter(t => t.id !== id),
            runningTasks: state.runningTasks.filter(t => t.id !== id),
            recentTasks: state.recentTasks.filter(t => t.id !== id),
            failedTasks: state.failedTasks.filter(t => t.id !== id),
            currentTask: state.currentTask?.id === id ? null : state.currentTask,
            isLoading: false,
            error: null
          }))
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      executeTask: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await api.tasks.executeTask(id)
          // 刷新任务状态
          const task = await api.tasks.getTask(id)
          set(state => ({
            tasks: state.tasks.map(t => t.id === id ? task : t),
            currentTask: state.currentTask?.id === id ? task : state.currentTask,
            runningTasks: task.status === 'running' 
              ? [...state.runningTasks.filter(t => t.id !== id), task]
              : state.runningTasks.filter(t => t.id !== id),
            isLoading: false,
            error: null
          }))
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      cancelTask: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          const task = await api.tasks.cancelTask(id)
          set(state => ({
            tasks: state.tasks.map(t => t.id === id ? task : t),
            currentTask: state.currentTask?.id === id ? task : state.currentTask,
            runningTasks: state.runningTasks.filter(t => t.id !== id),
            isLoading: false,
            error: null
          }))
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      retryTask: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await api.tasks.retryTask(id)
          // 刷新任务状态
          const task = await api.tasks.getTask(id)
          set(state => ({
            tasks: state.tasks.map(t => t.id === id ? task : t),
            currentTask: state.currentTask?.id === id ? task : state.currentTask,
            runningTasks: task.status === 'running' 
              ? [...state.runningTasks.filter(t => t.id !== id), task]
              : state.runningTasks.filter(t => t.id !== id),
            failedTasks: state.failedTasks.filter(t => t.id !== id),
            isLoading: false,
            error: null
          }))
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      fetchRunningTasks: async (projectId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const tasks = await api.tasks.getRunningTasks(projectId)
          set({
            runningTasks: tasks,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      fetchRecentTasks: async (projectId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const tasks = await api.tasks.getRecentTasks(10, projectId)
          set({
            recentTasks: tasks,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      fetchFailedTasks: async (projectId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.tasks.getTasks({
            status: 'failed',
            project_id: projectId,
            sort_by: 'updated_at',
            sort_order: 'desc'
          })
          set({
            failedTasks: response.items,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      fetchTaskStats: async (projectId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const stats = await api.tasks.getTaskStats({ project_id: projectId })
          set({
            taskStats: stats,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      searchTasks: async (query: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.tasks.searchTasks(query)
          set({
            tasks: response.items,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      setCurrentTask: (task: Task | null) => {
        set({ currentTask: task })
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'task-store',
      store: 'TaskStore'
    }
  )
)
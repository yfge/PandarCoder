/**
 * 任务相关的自定义Hook
 */
import { useCallback } from 'react'
import { useTaskStore } from '@/store'
import { useUIStore } from '@/store'

export const useTasks = () => {
  const {
    tasks,
    currentTask,
    runningTasks,
    recentTasks,
    failedTasks,
    isLoading,
    error,
    pagination,
    taskStats,
    fetchTasks,
    fetchTask,
    createTask,
    updateTask,
    deleteTask,
    executeTask,
    cancelTask,
    retryTask,
    fetchRunningTasks,
    fetchRecentTasks,
    fetchFailedTasks,
    fetchTaskStats,
    searchTasks,
    setCurrentTask,
    clearError
  } = useTaskStore()

  const { addNotification } = useUIStore()

  const handleCreateTask = useCallback(async (data: any) => {
    try {
      const task = await createTask(data)
      addNotification({
        type: 'success',
        title: '任务创建成功',
        message: `任务 "${task.name}" 已创建`
      })
      return task
    } catch (error) {
      addNotification({
        type: 'error',
        title: '任务创建失败',
        message: '创建任务时发生错误'
      })
      throw error
    }
  }, [createTask, addNotification])

  const handleUpdateTask = useCallback(async (id: string, data: any) => {
    try {
      await updateTask(id, data)
      addNotification({
        type: 'success',
        title: '任务更新成功',
        message: '任务信息已更新'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '任务更新失败',
        message: '更新任务时发生错误'
      })
      throw error
    }
  }, [updateTask, addNotification])

  const handleDeleteTask = useCallback(async (id: string, name?: string) => {
    try {
      await deleteTask(id)
      addNotification({
        type: 'success',
        title: '任务删除成功',
        message: name ? `任务 "${name}" 已删除` : '任务已删除'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '任务删除失败',
        message: '删除任务时发生错误'
      })
      throw error
    }
  }, [deleteTask, addNotification])

  const handleExecuteTask = useCallback(async (id: string, name?: string) => {
    try {
      await executeTask(id)
      addNotification({
        type: 'success',
        title: '任务开始执行',
        message: name ? `任务 "${name}" 已开始执行` : '任务已开始执行'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '任务执行失败',
        message: '启动任务时发生错误'
      })
      throw error
    }
  }, [executeTask, addNotification])

  const handleCancelTask = useCallback(async (id: string, name?: string) => {
    try {
      await cancelTask(id)
      addNotification({
        type: 'success',
        title: '任务已取消',
        message: name ? `任务 "${name}" 已取消` : '任务已取消'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '取消任务失败',
        message: '取消任务时发生错误'
      })
      throw error
    }
  }, [cancelTask, addNotification])

  const handleRetryTask = useCallback(async (id: string, name?: string) => {
    try {
      await retryTask(id)
      addNotification({
        type: 'success',
        title: '任务重新执行',
        message: name ? `任务 "${name}" 已重新执行` : '任务已重新执行'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '重试任务失败',
        message: '重试任务时发生错误'
      })
      throw error
    }
  }, [retryTask, addNotification])

  const handleSearchTasks = useCallback(async (query: string) => {
    try {
      await searchTasks(query)
    } catch (error) {
      addNotification({
        type: 'error',
        title: '搜索失败',
        message: '搜索任务时发生错误'
      })
    }
  }, [searchTasks, addNotification])

  return {
    tasks,
    currentTask,
    runningTasks,
    recentTasks,
    failedTasks,
    isLoading,
    error,
    pagination,
    taskStats,
    fetchTasks,
    fetchTask,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    deleteTask: handleDeleteTask,
    executeTask: handleExecuteTask,
    cancelTask: handleCancelTask,
    retryTask: handleRetryTask,
    fetchRunningTasks,
    fetchRecentTasks,
    fetchFailedTasks,
    fetchTaskStats,
    searchTasks: handleSearchTasks,
    setCurrentTask,
    clearError
  }
}
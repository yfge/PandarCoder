/**
 * 项目相关的自定义Hook
 */
import { useCallback } from 'react'
import { useProjectStore } from '@/store'
import { useUIStore } from '@/store'

export const useProjects = () => {
  const {
    projects,
    currentProject,
    myProjects,
    recentProjects,
    isLoading,
    error,
    pagination,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    fetchMyProjects,
    fetchRecentProjects,
    searchProjects,
    setCurrentProject,
    clearError
  } = useProjectStore()

  const { addNotification } = useUIStore()

  const handleCreateProject = useCallback(async (data: any) => {
    try {
      const project = await createProject(data)
      addNotification({
        type: 'success',
        title: '项目创建成功',
        message: `项目 "${project.name}" 已创建`
      })
      return project
    } catch (error) {
      addNotification({
        type: 'error',
        title: '项目创建失败',
        message: '创建项目时发生错误'
      })
      throw error
    }
  }, [createProject, addNotification])

  const handleUpdateProject = useCallback(async (id: string, data: any) => {
    try {
      await updateProject(id, data)
      addNotification({
        type: 'success',
        title: '项目更新成功',
        message: '项目信息已更新'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '项目更新失败',
        message: '更新项目时发生错误'
      })
      throw error
    }
  }, [updateProject, addNotification])

  const handleDeleteProject = useCallback(async (id: string, name?: string) => {
    try {
      await deleteProject(id)
      addNotification({
        type: 'success',
        title: '项目删除成功',
        message: name ? `项目 "${name}" 已删除` : '项目已删除'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '项目删除失败',
        message: '删除项目时发生错误'
      })
      throw error
    }
  }, [deleteProject, addNotification])

  const handleSearchProjects = useCallback(async (query: string) => {
    try {
      await searchProjects(query)
    } catch (error) {
      addNotification({
        type: 'error',
        title: '搜索失败',
        message: '搜索项目时发生错误'
      })
    }
  }, [searchProjects, addNotification])

  return {
    projects,
    currentProject,
    myProjects,
    recentProjects,
    isLoading,
    error,
    pagination,
    fetchProjects,
    fetchProject,
    createProject: handleCreateProject,
    updateProject: handleUpdateProject,
    deleteProject: handleDeleteProject,
    fetchMyProjects,
    fetchRecentProjects,
    searchProjects: handleSearchProjects,
    setCurrentProject,
    clearError
  }
}
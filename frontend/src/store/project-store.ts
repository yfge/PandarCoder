/**
 * 项目状态管理
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api, handleApiError, type Project, type CreateProjectRequest, type UpdateProjectRequest, type ProjectListParams } from '@/api'
import type { ProjectState, ProjectActions } from './types'

interface ProjectStore extends ProjectState, ProjectActions {}

export const useProjectStore = create<ProjectStore>()(
  devtools(
    (set, get) => ({
      // 状态
      projects: [],
      currentProject: null,
      myProjects: [],
      recentProjects: [],
      isLoading: false,
      error: null,
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
      },

      // 操作
      fetchProjects: async (params?: ProjectListParams) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.projects.getProjects(params)
          set({
            projects: response.items,
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

      fetchProject: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          const project = await api.projects.getProject(id)
          set({
            currentProject: project,
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

      createProject: async (data: CreateProjectRequest) => {
        set({ isLoading: true, error: null })
        try {
          const project = await api.projects.createProject(data)
          set(state => ({
            projects: [project, ...state.projects],
            myProjects: [project, ...state.myProjects],
            isLoading: false,
            error: null
          }))
          return project
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      updateProject: async (id: string, data: UpdateProjectRequest) => {
        set({ isLoading: true, error: null })
        try {
          const project = await api.projects.updateProject(id, data)
          set(state => ({
            projects: state.projects.map(p => p.id === id ? project : p),
            myProjects: state.myProjects.map(p => p.id === id ? project : p),
            currentProject: state.currentProject?.id === id ? project : state.currentProject,
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

      deleteProject: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await api.projects.deleteProject(id)
          set(state => ({
            projects: state.projects.filter(p => p.id !== id),
            myProjects: state.myProjects.filter(p => p.id !== id),
            recentProjects: state.recentProjects.filter(p => p.id !== id),
            currentProject: state.currentProject?.id === id ? null : state.currentProject,
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

      fetchMyProjects: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.projects.getMyProjects()
          set({
            myProjects: response.items,
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

      fetchRecentProjects: async () => {
        set({ isLoading: true, error: null })
        try {
          const projects = await api.projects.getRecentProjects()
          set({
            recentProjects: projects,
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

      searchProjects: async (query: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.projects.searchProjects(query)
          set({
            projects: response.items,
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

      setCurrentProject: (project: Project | null) => {
        set({ currentProject: project })
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'project-store',
      store: 'ProjectStore'
    }
  )
)
/**
 * 认证状态管理
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api, handleApiError, type User } from '@/api'
import type { AuthState, AuthActions } from './types'

interface AuthStore extends AuthState, AuthActions {}

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      // 状态
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // 操作
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.auth.login({ email, password })
          set({
            user: response.user || null,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })
          return true
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false,
            isAuthenticated: false,
            user: null
          })
          throw error
        }
      },

      register: async (userData: { email: string; password: string; full_name: string }) => {
        set({ isLoading: true, error: null })
        try {
          const user = await api.auth.register(userData)
          set({ isLoading: false, error: null })
          return true
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      logout: async () => {
        set({ isLoading: true })
        try {
          await api.auth.logout()
        } catch (error) {
          console.warn('Logout API call failed:', error)
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null
          })
        }
      },

      refreshToken: async () => {
        try {
          const response = await api.auth.refreshToken()
          set({
            user: response.user || get().user,
            isAuthenticated: true,
            error: null
          })
        } catch (error) {
          set({
            user: null,
            isAuthenticated: false,
            error: handleApiError(error)
          })
          throw error
        }
      },

      getCurrentUser: async () => {
        set({ isLoading: true, error: null })
        try {
          const user = await api.auth.getCurrentUser()
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false,
            isAuthenticated: false,
            user: null
          })
          throw error
        }
      },

      updateUser: async (data: Partial<User>) => {
        set({ isLoading: true, error: null })
        try {
          const user = await api.auth.updateCurrentUser(data)
          set({
            user,
            isLoading: false,
            error: null
          })
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false
          })
          throw error
        }
      },

      checkAuthStatus: async () => {
        set({ isLoading: true, error: null })
        try {
          const authStatus = await api.auth.checkAuthStatus()
          set({
            isAuthenticated: authStatus.authenticated,
            user: authStatus.user || null,
            isLoading: false,
            error: null
          })
        } catch (error) {
          // 检查失败时清理存储
          api.auth.clearSavedUser()
          set({
            isAuthenticated: false,
            user: null,
            error: handleApiError(error),
            isLoading: false
          })
        }
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'auth-store',
      store: 'AuthStore'
    }
  )
)
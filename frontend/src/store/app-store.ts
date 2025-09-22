/**
 * 全局应用状态管理
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api, handleApiError } from '@/api'
import type { AppState, AppActions } from './types'

interface AppStore extends AppState, AppActions {}

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // 状态
      initialized: false,
      version: '1.0.0',
      environment: process.env.NODE_ENV as 'development' | 'production' | 'test',
      apiStatus: 'disconnected',
      lastActivity: Date.now(),
      features: {
        notifications: true,
        realtime: false,
        fileUpload: true
      },

      // 操作
      initialize: async () => {
        try {
          console.log('Initializing app...')
          
          // 检查API状态
          await get().checkApiStatus()
          
          // 更新最后活动时间
          get().updateLastActivity()
          
          console.log('App initialization completed successfully')
          set({ initialized: true })
        } catch (error: any) {
          console.error('Failed to initialize app:', {
            message: error?.message || 'Unknown error',
            code: error?.code || 'UNKNOWN_ERROR',
            response: error?.response?.data,
            status: error?.response?.status,
            url: error?.config?.url,
            fullError: error
          })
          set({ 
            initialized: true,
            apiStatus: 'error'
          })
        }
      },

      checkApiStatus: async () => {
        try {
          console.log('Attempting API health check...')
          const result = await api.system.healthCheck()
          console.log('API health check successful:', result)
          set({ apiStatus: 'connected' })
        } catch (error: any) {
          console.error('API health check failed:', {
            message: error?.message || 'Unknown error',
            code: error?.code || 'UNKNOWN_ERROR',
            response: error?.response?.data,
            status: error?.response?.status,
            url: error?.config?.url,
            fullError: error
          })
          set({ apiStatus: 'error' })
          throw error
        }
      },

      updateLastActivity: () => {
        set({ lastActivity: Date.now() })
      },

      toggleFeature: (feature: keyof AppState['features']) => {
        set(state => ({
          features: {
            ...state.features,
            [feature]: !state.features[feature]
          }
        }))
      }
    }),
    {
      name: 'app-store',
      store: 'AppStore'
    }
  )
)
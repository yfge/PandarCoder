/**
 * UI状态管理
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { UIState, UIActions, Notification } from './types'

interface UIStore extends UIState, UIActions {}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        // 状态
        theme: 'system',
        sidebarOpen: false,
        notifications: [],
        modals: {
          isCreateProjectOpen: false,
          isCreateTaskOpen: false,
          isSettingsOpen: false
        },
        loading: {
          global: false,
          local: {}
        },

        // 操作
        toggleTheme: () => {
          const currentTheme = get().theme
          const themes: UIState['theme'][] = ['light', 'dark', 'system']
          const currentIndex = themes.indexOf(currentTheme)
          const nextIndex = (currentIndex + 1) % themes.length
          set({ theme: themes[nextIndex] })
        },

        setTheme: (theme: UIState['theme']) => {
          set({ theme })
        },

        toggleSidebar: () => {
          set(state => ({ sidebarOpen: !state.sidebarOpen }))
        },

        setSidebarOpen: (open: boolean) => {
          set({ sidebarOpen: open })
        },

        addNotification: (notification: Omit<Notification, 'id'>) => {
          const id = Date.now().toString() + Math.random().toString(36).substring(2, 9)
          const newNotification: Notification = {
            ...notification,
            id,
            timestamp: Date.now()
          }
          
          set(state => ({
            notifications: [...state.notifications, newNotification]
          }))

          // 自动移除通知
          if (notification.duration !== 0) {
            const duration = notification.duration || 5000
            setTimeout(() => {
              get().removeNotification(id)
            }, duration)
          }
        },

        removeNotification: (id: string) => {
          set(state => ({
            notifications: state.notifications.filter(n => n.id !== id)
          }))
        },

        clearNotifications: () => {
          set({ notifications: [] })
        },

        openModal: (modal: keyof UIState['modals']) => {
          set(state => ({
            modals: {
              ...state.modals,
              [modal]: true
            }
          }))
        },

        closeModal: (modal: keyof UIState['modals']) => {
          set(state => ({
            modals: {
              ...state.modals,
              [modal]: false
            }
          }))
        },

        setGlobalLoading: (loading: boolean) => {
          set(state => ({
            loading: {
              ...state.loading,
              global: loading
            }
          }))
        },

        setLocalLoading: (key: string, loading: boolean) => {
          set(state => ({
            loading: {
              ...state.loading,
              local: {
                ...state.loading.local,
                [key]: loading
              }
            }
          }))
        }
      }),
      {
        name: 'ui-store',
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen
        })
      }
    ),
    {
      name: 'ui-store',
      store: 'UIStore'
    }
  )
)
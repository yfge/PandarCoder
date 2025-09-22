/**
 * 应用提供者组件
 */
'use client'

import { useEffect } from 'react'
import { useAppStore, useAuthStore, useUIStore } from '@/store'

interface AppProviderProps {
  children: React.ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const { initialize, updateLastActivity } = useAppStore()
  const { checkAuthStatus } = useAuthStore()
  const { addNotification, setGlobalLoading } = useUIStore()

  useEffect(() => {
    const initializeApp = async () => {
      setGlobalLoading(true)
      
      try {
        // 初始化应用
        await initialize()
        
        // 检查认证状态
        await checkAuthStatus()
        
        addNotification({
          type: 'success',
          title: '应用初始化成功',
          message: '欢迎使用 Claude Web',
          duration: 3000
        })
      } catch (error) {
        console.error('App initialization failed:', error)
        addNotification({
          type: 'warning',
          title: '初始化部分失败',
          message: '某些功能可能不可用',
          duration: 5000
        })
      } finally {
        setGlobalLoading(false)
      }
    }

    initializeApp()
  }, [initialize, checkAuthStatus, addNotification, setGlobalLoading])

  useEffect(() => {
    // 监听用户活动
    const handleActivity = () => {
      updateLastActivity()
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [updateLastActivity])

  return <>{children}</>
}
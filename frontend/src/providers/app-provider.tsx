/**
 * 应用提供者组件
 */
'use client'

import { useEffect } from 'react'
import { useAppStore, useAuthStore, useUIStore } from '@/store'
import { useI18n } from '@/providers/i18n-provider'

interface AppProviderProps {
  children: React.ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const { initialize, updateLastActivity } = useAppStore()
  const { checkAuthStatus } = useAuthStore()
  const { addNotification, setGlobalLoading } = useUIStore()
  const { t } = useI18n()

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
          title: t('app.init.success.title'),
          message: t('app.init.success.message'),
          duration: 3000
        })
      } catch (error) {
        console.error('App initialization failed:', error)
        addNotification({
          type: 'warning',
          title: t('app.init.partial_fail.title'),
          message: t('app.init.partial_fail.message'),
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

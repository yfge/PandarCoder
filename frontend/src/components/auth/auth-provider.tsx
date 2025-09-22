'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { TokenManager } from '@/lib/api'
import { AuthApiService } from '@/api/auth'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { checkAuthStatus, isAuthenticated, user, login } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 尝试从localStorage恢复用户信息和token
        const savedUser = AuthApiService.getSavedUser()
        const accessToken = TokenManager.getAccessToken()
        const refreshToken = TokenManager.getRefreshToken()
        
        if (savedUser && accessToken && !TokenManager.isTokenExpired(accessToken)) {
          // Token有效，直接恢复认证状态
          useAuthStore.setState({
            user: savedUser,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })
        } else if (refreshToken && !TokenManager.isTokenExpired(refreshToken)) {
          // Access token过期但refresh token有效，尝试刷新
          try {
            await useAuthStore.getState().refreshToken()
          } catch (error) {
            // 刷新失败，清理存储
            TokenManager.clearTokens()
            AuthApiService.clearSavedUser()
          }
        } else {
          // 没有有效token，检查认证状态
          await checkAuthStatus()
        }
      } catch (error) {
        console.error('Authentication initialization failed:', error)
        // 初始化失败，确保清理状态
        TokenManager.clearTokens()
        AuthApiService.clearSavedUser()
        useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
        })
      } finally {
        setIsInitialized(true)
      }
    }

    initializeAuth()
  }, []) // 移除依赖，确保只在mount时执行一次

  // 在初始化完成前显示加载状态
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">正在恢复登录状态...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
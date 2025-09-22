'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

export function ProtectedRoute({ 
  children, 
  requireAuth = true, 
  redirectTo = '/login' 
}: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, user, checkAuthStatus, isLoading } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 只有在没有认证状态时才检查
        if (!isAuthenticated && !user) {
          await checkAuthStatus()
        }
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setIsChecking(false)
      }
    }

    checkAuth()
  }, [checkAuthStatus, isAuthenticated, user])

  useEffect(() => {
    if (!isChecking && !isLoading) {
      if (requireAuth && !isAuthenticated) {
        // 需要认证但用户未登录，重定向到登录页
        const returnUrl = encodeURIComponent(pathname)
        router.push(`${redirectTo}?returnUrl=${returnUrl}`)
      } else if (!requireAuth && isAuthenticated) {
        // 不需要认证但用户已登录（如登录页），重定向到首页
        router.push('/')
      }
    }
  }, [isChecking, isLoading, requireAuth, isAuthenticated, pathname, router, redirectTo])

  // 显示加载状态
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">检查登录状态...</p>
        </div>
      </div>
    )
  }

  // 如果需要认证但用户未登录，不渲染子组件（会被重定向）
  if (requireAuth && !isAuthenticated) {
    return null
  }

  // 如果不需要认证但用户已登录，不渲染子组件（会被重定向）
  if (!requireAuth && isAuthenticated) {
    return null
  }

  return <>{children}</>
}

// 用于保护需要认证的页面
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  redirectTo?: string
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <ProtectedRoute requireAuth={true} redirectTo={redirectTo}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}

// 用于保护不需要认证的页面（如登录页）
export function withoutAuth<P extends object>(
  Component: React.ComponentType<P>,
  redirectTo?: string
) {
  return function UnauthenticatedComponent(props: P) {
    return (
      <ProtectedRoute requireAuth={false} redirectTo={redirectTo}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}
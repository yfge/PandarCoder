/**
 * 认证相关的自定义Hook
 */
import { useCallback } from 'react'
import { useAuthStore } from '@/store'
import { useUIStore } from '@/store'

export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    getCurrentUser,
    updateUser,
    checkAuthStatus,
    clearError
  } = useAuthStore()

  const { addNotification } = useUIStore()

  const handleLogin = useCallback(async (email: string, password: string) => {
    try {
      await login(email, password)
      addNotification({
        type: 'success',
        title: '登录成功',
        message: '欢迎回来！'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '登录失败',
        message: '请检查邮箱和密码是否正确'
      })
      throw error
    }
  }, [login, addNotification])

  const handleRegister = useCallback(async (email: string, password: string, full_name: string) => {
    try {
      await register(email, password, full_name)
      addNotification({
        type: 'success',
        title: '注册成功',
        message: '请检查邮箱验证链接'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '注册失败',
        message: '请检查输入信息是否正确'
      })
      throw error
    }
  }, [register, addNotification])

  const handleLogout = useCallback(async () => {
    try {
      await logout()
      addNotification({
        type: 'success',
        title: '退出成功',
        message: '已安全退出系统'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '退出失败',
        message: '退出过程中发生错误'
      })
    }
  }, [logout, addNotification])

  const handleUpdateUser = useCallback(async (data: any) => {
    try {
      await updateUser(data)
      addNotification({
        type: 'success',
        title: '更新成功',
        message: '用户信息已更新'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '更新失败',
        message: '更新用户信息时发生错误'
      })
      throw error
    }
  }, [updateUser, addNotification])

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    updateUser: handleUpdateUser,
    getCurrentUser,
    checkAuthStatus,
    clearError
  }
}
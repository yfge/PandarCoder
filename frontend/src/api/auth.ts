/**
 * 认证相关API
 */
import { apiClient, TokenManager } from '@/lib/api'

// 类型定义
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

export interface User {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_superuser?: boolean
  created_at: string
  updated_at: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user?: User
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface ResetPasswordRequest {
  email: string
}

export interface ResetPasswordConfirmRequest {
  token: string
  new_password: string
}

// 认证API服务类
export class AuthApiService {
  private static readonly BASE_PATH = '/api/v1/auth'

  /**
   * 用户登录
   */
  static async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      `${this.BASE_PATH}/login`,
      credentials
    )

    // 保存token
    if (response.access_token && response.refresh_token) {
      TokenManager.setTokens(response.access_token, response.refresh_token)
    }

    // 保存用户信息
    if (response.user) {
      this.saveUser(response.user)
    }

    return response
  }

  /**
   * 用户注册
   */
  static async register(userData: RegisterRequest): Promise<User> {
    return apiClient.post<User>(`${this.BASE_PATH}/register`, userData)
  }

  /**
   * 用户退出登录
   */
  static async logout(): Promise<void> {
    try {
      await apiClient.post(`${this.BASE_PATH}/logout`)
    } catch (error) {
      // 即使退出失败也要清理本地token
      console.warn('Logout request failed:', error)
    } finally {
      TokenManager.clearTokens()
    }
  }

  /**
   * 刷新访问令牌
   */
  static async refreshToken(): Promise<LoginResponse> {
    const refreshToken = TokenManager.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiClient.post<LoginResponse>(
      `${this.BASE_PATH}/refresh`,
      { refresh_token: refreshToken }
    )

    // 更新token
    if (response.access_token && response.refresh_token) {
      TokenManager.setTokens(response.access_token, response.refresh_token)
    }

    return response
  }

  /**
   * 获取当前用户信息
   */
  static async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/api/v1/users/me')
    
    // 保存用户信息
    this.saveUser(response)
    
    return response
  }

  /**
   * 更新当前用户信息
   */
  static async updateCurrentUser(userData: Partial<User>): Promise<User> {
    const response = await apiClient.put<User>('/api/v1/users/me', userData)
    
    // 更新保存的用户信息
    this.saveUser(response)
    
    return response
  }

  /**
   * 修改密码
   */
  static async changePassword(passwordData: ChangePasswordRequest): Promise<void> {
    await apiClient.put(`${this.BASE_PATH}/change-password`, passwordData)
  }

  /**
   * 请求重置密码
   */
  static async requestPasswordReset(data: ResetPasswordRequest): Promise<void> {
    await apiClient.post(`${this.BASE_PATH}/reset-password`, data)
  }

  /**
   * 确认重置密码
   */
  static async confirmPasswordReset(data: ResetPasswordConfirmRequest): Promise<void> {
    await apiClient.post(`${this.BASE_PATH}/reset-password/confirm`, data)
  }

  /**
   * 验证邮箱
   */
  static async verifyEmail(token: string): Promise<void> {
    await apiClient.post(`${this.BASE_PATH}/verify-email`, { token })
  }

  /**
   * 重新发送验证邮件
   */
  static async resendVerificationEmail(): Promise<void> {
    await apiClient.post(`${this.BASE_PATH}/resend-verification`)
  }

  /**
   * 检查认证状态
   */
  static async checkAuthStatus(): Promise<{
    authenticated: boolean
    user?: User
  }> {
    const token = TokenManager.getAccessToken()
    
    if (!token || TokenManager.isTokenExpired(token)) {
      return { authenticated: false }
    }

    try {
      const user = await this.getCurrentUser()
      return { authenticated: true, user }
    } catch (error) {
      // Token无效，清理本地存储
      TokenManager.clearTokens()
      return { authenticated: false }
    }
  }

  /**
   * 保存用户信息到localStorage
   */
  private static saveUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'claude_web_user',
        JSON.stringify(user)
      )
    }
  }

  /**
   * 从localStorage获取用户信息
   */
  static getSavedUser(): User | null {
    if (typeof window === 'undefined') return null

    try {
      const userStr = localStorage.getItem('claude_web_user')
      return userStr ? JSON.parse(userStr) : null
    } catch (error) {
      console.warn('Failed to parse saved user:', error)
      return null
    }
  }

  /**
   * 清理保存的用户信息
   */
  static clearSavedUser(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('claude_web_user')
    }
  }

  /**
   * 检查是否已登录
   */
  static isAuthenticated(): boolean {
    const token = TokenManager.getAccessToken()
    return !!(token && !TokenManager.isTokenExpired(token))
  }

  /**
   * 获取当前token
   */
  static getCurrentToken(): string | null {
    return TokenManager.getAccessToken()
  }
}

export default AuthApiService
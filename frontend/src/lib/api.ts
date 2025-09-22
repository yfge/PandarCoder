/**
 * API客户端
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { config, debugLog, debugError } from './config'

// API响应接口
export interface ApiResponse<T = any> {
  data?: T
  message?: string
  success: boolean
  timestamp?: number
}

export interface ApiError {
  code: string
  message: string
  details?: any
  timestamp?: number
  path?: string
}

export interface ApiErrorResponse {
  error: ApiError
  timestamp: number
  path: string
}

// 请求拦截器配置
interface RequestInterceptorConfig {
  includeAuth?: boolean
  timeout?: number
}

// Token管理
class TokenManager {
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(config.TOKEN_STORAGE_KEY)
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(config.REFRESH_TOKEN_STORAGE_KEY)
  }

  static setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(config.TOKEN_STORAGE_KEY, accessToken)
    localStorage.setItem(config.REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(config.TOKEN_STORAGE_KEY)
    localStorage.removeItem(config.REFRESH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(config.USER_STORAGE_KEY)
  }

  static isTokenExpired(token: string): boolean {
    if (!token) return true
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.exp * 1000 < Date.now()
    } catch {
      return true
    }
  }
}

// API客户端类
class ApiClient {
  private client: AxiosInstance
  private refreshPromise: Promise<string> | null = null

  constructor() {
    this.client = axios.create({
      baseURL: config.API_BASE_URL,
      timeout: config.API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  private setupInterceptors(): void {
    // 请求拦截器
    this.client.interceptors.request.use(
      async (config) => {
        // 添加认证头
        const token = TokenManager.getAccessToken()
        if (token && !TokenManager.isTokenExpired(token)) {
          config.headers.Authorization = `Bearer ${token}`
        }

        // 添加请求ID
        config.headers['X-Request-ID'] = `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        
        debugLog('API Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data,
          headers: config.headers
        })

        return config
      },
      (error) => {
        debugError('Request interceptor error:', error)
        return Promise.reject(error)
      }
    )

    // 响应拦截器
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        debugLog('API Response:', {
          status: response.status,
          url: response.config.url,
          data: response.data
        })
        return response
      },
      async (error: AxiosError<ApiErrorResponse>) => {
        debugError('API Error:', error)

        // 处理401错误（token过期）
        if (error.response?.status === 401 && error.config) {
          const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }
          
          if (!originalRequest._retry) {
            originalRequest._retry = true
            
            try {
              const newToken = await this.refreshAccessToken()
              if (newToken) {
                originalRequest.headers = originalRequest.headers || {}
                originalRequest.headers.Authorization = `Bearer ${newToken}`
                return this.client(originalRequest)
              }
            } catch (refreshError) {
              // 刷新失败，跳转到登录页
              TokenManager.clearTokens()
              window.location.href = '/auth/login'
              return Promise.reject(refreshError)
            }
          }
        }

        // 处理网络错误
        if (!error.response) {
          debugError('Network error detected:', {
            message: error.message,
            code: error.code,
            config: {
              url: error.config?.url,
              method: error.config?.method,
              baseURL: error.config?.baseURL,
              timeout: error.config?.timeout
            }
          })
          return Promise.reject({
            error: {
              code: 'NETWORK_ERROR',
              message: '网络连接错误，请检查网络连接',
              details: error.message
            }
          } as ApiErrorResponse)
        }

        return Promise.reject(error)
      }
    )
  }

  private async refreshAccessToken(): Promise<string | null> {
    // 防止并发刷新
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    const refreshToken = TokenManager.getRefreshToken()
    if (!refreshToken) {
      return null
    }

    this.refreshPromise = (async () => {
      try {
        const response = await axios.post(
          `${config.API_BASE_URL}/api/v1/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 10000 }
        )

        const { access_token, refresh_token: newRefreshToken } = response.data
        TokenManager.setTokens(access_token, newRefreshToken)
        
        return access_token
      } catch (error) {
        TokenManager.clearTokens()
        throw error
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  // GET请求
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  // POST请求
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  // PUT请求
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  // DELETE请求
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }

  // PATCH请求
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  // 文件上传
  async upload<T = any>(
    url: string, 
    file: File, 
    onProgress?: (progress: number) => void,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100
          onProgress(Math.round(progress))
        }
      },
      ...config,
    })

    return response.data
  }

  // 健康检查
  async healthCheck(): Promise<{
    status: string
    version: string
    timestamp: number
    checks: Record<string, string>
  }> {
    return this.get('/health')
  }

  // 获取原始axios实例（用于特殊情况）
  getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

// 创建API客户端实例
export const apiClient = new ApiClient()

// 导出Token管理器
export { TokenManager }

// 通用错误处理函数
export function handleApiError(error: any): string {
  // 网络错误
  if (!error.response) {
    return '网络连接错误，请检查网络连接'
  }

  // API错误响应
  if (error.response?.data?.error) {
    const apiError = error.response.data.error as ApiError
    return apiError.message || '请求失败'
  }

  // 其他HTTP错误
  const status = error.response?.status
  switch (status) {
    case 400:
      return '请求参数错误'
    case 401:
      return '未授权访问，请重新登录'
    case 403:
      return '权限不足'
    case 404:
      return '请求的资源不存在'
    case 408:
      return '请求超时'
    case 500:
      return '服务器内部错误'
    case 502:
      return '网关错误'
    case 503:
      return '服务暂时不可用'
    case 504:
      return '网关超时'
    default:
      return `请求失败 (${status})`
  }
}

// 重试请求函数
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = config.REQUEST_RETRY_COUNT,
  delay: number = config.REQUEST_RETRY_DELAY
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error
      
      // 最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        break
      }

      // 某些错误不需要重试
      const status = (error as any)?.response?.status
      if (status && [400, 401, 403, 404, 422].includes(status)) {
        break
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay * attempt))
    }
  }

  throw lastError
}

// 并发请求函数
export async function concurrentRequests<T>(
  requests: (() => Promise<T>)[],
  maxConcurrent: number = 5
): Promise<T[]> {
  const results: T[] = []
  const executing: Promise<void>[] = []

  for (const [index, request] of requests.entries()) {
    const promise = request().then(result => {
      results[index] = result
    })

    executing.push(promise)

    if (executing.length >= maxConcurrent) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(p => 
        p === promise || (p as any).resolved
      ), 1)
    }
  }

  await Promise.all(executing)
  return results
}
/**
 * 应用配置
 */

// 获取环境变量的辅助函数
const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || process.env[`NEXT_PUBLIC_${key}`]
  
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`)
  }
  
  return value || defaultValue || ''
}

// 环境检查
export const isDevelopment = process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV === 'production'
export const isTest = process.env.NODE_ENV === 'test'

// 应用配置
export const config = {
  // 基础信息
  APP_NAME: 'Claude Web',
  APP_VERSION: '0.1.0',
  APP_DESCRIPTION: 'Remote Claude CLI Control Platform',
  
  // 环境
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // API配置
  API_BASE_URL: getEnvVar(
    'API_BASE_URL',
    isTest ? 'http://localhost:8100' : 'http://localhost:8100'
  ),
  API_TIMEOUT: parseInt(getEnvVar('API_TIMEOUT', '10000'), 10),
  
  // 前端服务配置
  PORT: parseInt(getEnvVar('PORT', '3100'), 10),
  
  // 认证配置
  TOKEN_STORAGE_KEY: 'claude_web_token',
  REFRESH_TOKEN_STORAGE_KEY: 'claude_web_refresh_token',
  USER_STORAGE_KEY: 'claude_web_user',
  
  // 本地存储配置
  STORAGE_PREFIX: 'claude_web_',
  
  // UI配置
  DEFAULT_THEME: 'light' as 'light' | 'dark' | 'system',
  ANIMATION_DURATION: 200,
  
  // 分页配置
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  
  // 文件上传配置
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/json'
  ],
  
  // 网络配置
  REQUEST_RETRY_COUNT: 3,
  REQUEST_RETRY_DELAY: 1000,
  
  // 缓存配置
  CACHE_TTL: 5 * 60 * 1000, // 5分钟
  
  // WebSocket配置
  WS_BASE_URL: getEnvVar(
    'WS_BASE_URL',
    isTest ? 'ws://localhost:8100' : 'ws://localhost:8100'
  ),
  WS_RECONNECT_ATTEMPTS: 5,
  WS_RECONNECT_INTERVAL: 3000,
  
  // 功能开关
  FEATURES: {
    ENABLE_PWA: getEnvVar('ENABLE_PWA', 'false') === 'true',
    ENABLE_ANALYTICS: getEnvVar('ENABLE_ANALYTICS', 'false') === 'true',
    ENABLE_ERROR_REPORTING: getEnvVar('ENABLE_ERROR_REPORTING', 'false') === 'true',
    ENABLE_DEBUG_MODE: isDevelopment || getEnvVar('ENABLE_DEBUG_MODE', 'false') === 'true'
  },
  
  // 外部服务
  GITHUB_CLIENT_ID: getEnvVar('GITHUB_CLIENT_ID', 'dev-client-id'),
  GOOGLE_CLIENT_ID: getEnvVar('GOOGLE_CLIENT_ID', 'dev-client-id'),
  
  // 错误报告
  SENTRY_DSN: getEnvVar('SENTRY_DSN', ''),
  
  // 分析工具
  GA_MEASUREMENT_ID: getEnvVar('GA_MEASUREMENT_ID', '')
} as const

// 配置验证
export const validateConfig = () => {
  const errors: string[] = []
  
  // 验证必需的配置
  if (!config.API_BASE_URL) {
    errors.push('API_BASE_URL is required')
  }
  
  // 验证URL格式
  try {
    new URL(config.API_BASE_URL)
  } catch {
    errors.push('API_BASE_URL must be a valid URL')
  }
  
  // 验证端口号
  if (config.PORT < 1 || config.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535')
  }
  
  // 验证超时时间
  if (config.API_TIMEOUT < 1000) {
    errors.push('API_TIMEOUT must be at least 1000ms')
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }
}

// 在非测试环境验证配置
if (!isTest) {
  validateConfig()
}

// 导出类型
export type Config = typeof config
export type FeatureFlags = typeof config.FEATURES

// 配置工具函数
export const getApiUrl = (path: string = '') => {
  const baseUrl = config.API_BASE_URL.replace(/\/+$/, '') // 移除尾部斜杠
  const cleanPath = path.replace(/^\/+/, '') // 移除开头斜杠
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl
}

export const getWsUrl = (path: string = '') => {
  const baseUrl = config.WS_BASE_URL.replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl
}

export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
  return config.FEATURES[feature]
}

// 开发环境工具
export const debugLog = (...args: any[]) => {
  if (config.FEATURES.ENABLE_DEBUG_MODE) {
    console.log('[Claude Web Debug]:', ...args)
  }
}

export const debugError = (...args: any[]) => {
  if (config.FEATURES.ENABLE_DEBUG_MODE) {
    console.error('[Claude Web Error]:', ...args)
  }
}

export const debugWarn = (...args: any[]) => {
  if (config.FEATURES.ENABLE_DEBUG_MODE) {
    console.warn('[Claude Web Warning]:', ...args)
  }
}
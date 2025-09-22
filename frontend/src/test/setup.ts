import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock handlers for API calls
export const handlers = [
  // Auth endpoints
  http.post('http://localhost:8100/api/v1/auth/register', () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      full_name: 'Test User',
      is_active: true,
      created_at: new Date().toISOString()
    }, { status: 201 })
  }),

  http.post('http://localhost:8100/api/v1/auth/login', () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600
    })
  }),

  http.get('http://localhost:8100/api/v1/users/me', () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      full_name: 'Test User',
      is_active: true,
      created_at: new Date().toISOString()
    })
  }),

  // Health check
  http.get('http://localhost:8100/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      version: '0.1.0',
      timestamp: Date.now() / 1000,
      checks: {
        database: 'healthy',
        api: 'healthy'
      }
    })
  }),

  // Projects endpoints
  http.get('http://localhost:8100/api/v1/projects', () => {
    return HttpResponse.json([
      {
        id: 'project-1',
        name: 'Test Project 1',
        description: 'A test project',
        git_url: 'https://github.com/test/project1.git',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
  }),

  http.post('http://localhost:8100/api/v1/projects', () => {
    return HttpResponse.json({
      id: 'new-project-id',
      name: 'New Test Project',
      description: 'A new test project',
      git_url: 'https://github.com/test/new-project.git',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { status: 201 })
  }),

  // Error responses for testing
  http.get('http://localhost:8100/api/v1/error/unauthorized', () => {
    return HttpResponse.json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
        details: {}
      },
      timestamp: Date.now() / 1000,
      path: '/api/v1/error/unauthorized'
    }, { status: 401 })
  }),

  http.get('http://localhost:8100/api/v1/error/forbidden', () => {
    return HttpResponse.json({
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Permission denied',
        details: {}
      },
      timestamp: Date.now() / 1000,
      path: '/api/v1/error/forbidden'
    }, { status: 403 })
  }),

  http.get('http://localhost:8100/api/v1/error/not-found', () => {
    return HttpResponse.json({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        details: {}
      },
      timestamp: Date.now() / 1000,
      path: '/api/v1/error/not-found'
    }, { status: 404 })
  }),

  http.get('http://localhost:8100/api/v1/error/server-error', () => {
    return HttpResponse.json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error occurred',
        details: {}
      },
      timestamp: Date.now() / 1000,
      path: '/api/v1/error/server-error'
    }, { status: 500 })
  })
]

// Create MSW server
export const server = setupServer(...handlers)

// Establish API mocking before all tests
beforeAll(() => {
  server.listen({ 
    onUnhandledRequest: 'error' // 未处理的请求会报错，有助于发现测试中的问题
  })
})

// Clean up after each test case
afterEach(() => {
  cleanup()
  server.resetHandlers()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/test-path',
  useParams: () => ({}),
  notFound: vi.fn()
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    },
    get length() {
      return Object.keys(store).length
    }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock
})

// Mock console methods to avoid noise in tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeAll(() => {
  console.error = vi.fn()
  console.warn = vi.fn()
})

afterAll(() => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})

// Mock environment variables for tests
vi.mock('../lib/config', () => ({
  config: {
    API_BASE_URL: 'http://localhost:8100',
    APP_VERSION: '0.1.0',
    APP_NAME: 'Claude Web',
    NODE_ENV: 'test'
  }
}))

// Global test utilities
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
})

export const createMockProject = (overrides = {}) => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'A test project',
  git_url: 'https://github.com/test/project.git',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
})

export const createMockError = (status = 500, code = 'INTERNAL_SERVER_ERROR', message = 'Internal server error') => ({
  error: {
    code,
    message,
    details: {}
  },
  timestamp: Date.now() / 1000,
  path: '/test-path'
})

// Test helpers
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))
'use client'

import { useState } from 'react'
import { api } from '@/api'

export default function TestPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testAPI = async () => {
    setLoading(true)
    setResult('')
    
    try {
      console.log('Testing API connection...')
      
      // Test health check first
      const health = await api.system.healthCheck()
      console.log('Health check result:', health)
      
      // Test registration
      const testData = {
        full_name: 'Frontend Test User',
        email: `test.${Date.now()}@example.com`,
        password: 'TestPass123'
      }
      
      console.log('Attempting registration with:', testData)
      const user = await api.auth.register(testData)
      console.log('Registration result:', user)
      
      setResult(`Success! Registered user: ${user.email}`)
    } catch (error: any) {
      console.error('API test failed:', error)
      setResult(`Error: ${error.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
      
      <button 
        onClick={testAPI}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test API'}
      </button>
      
      {result && (
        <div className={`mt-4 p-4 rounded ${result.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {result}
        </div>
      )}
    </div>
  )
}
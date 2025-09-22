'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Settings, 
  Key, 
  Shield, 
  User, 
  Save,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { api } from '@/api'

interface UserSettings {
  has_ssh_key: boolean
  ssh_key_fingerprint?: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // SSH密钥相关状态
  const [sshKey, setSshKey] = useState('')
  const [showSshKey, setShowSshKey] = useState(false)
  const [sshKeyLoading, setSshKeyLoading] = useState(false)

  // 加载用户设置
  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.users.getSettings()
      setSettings(response)
    } catch (err: any) {
      console.error('Load settings error:', err)
      setError(err.response?.data?.detail || err.message || '加载设置失败')
    } finally {
      setLoading(false)
    }
  }

  // 更新SSH密钥
  const updateSshKey = async () => {
    if (!sshKey.trim()) {
      setError('请输入SSH私钥')
      return
    }

    try {
      setSshKeyLoading(true)
      setError(null)
      setSuccess(null)
      
      await api.users.updateSettings({
        ssh_private_key: sshKey
      })
      
      setSuccess('SSH私钥更新成功')
      setSshKey('')
      await loadSettings()
    } catch (err: any) {
      console.error('Update SSH key error:', err)
      setError(err.response?.data?.detail || err.message || 'SSH私钥更新失败')
    } finally {
      setSshKeyLoading(false)
    }
  }

  // 删除SSH密钥
  const deleteSshKey = async () => {
    if (!settings?.has_ssh_key) return
    
    if (!confirm('确定要删除SSH私钥吗？删除后将无法访问私有Git仓库。')) {
      return
    }

    try {
      setSshKeyLoading(true)
      setError(null)
      setSuccess(null)
      
      await api.users.updateSettings({
        ssh_private_key: ''
      })
      
      setSuccess('SSH私钥删除成功')
      await loadSettings()
    } catch (err: any) {
      console.error('Delete SSH key error:', err)
      setError(err.response?.data?.detail || err.message || 'SSH私钥删除失败')
    } finally {
      setSshKeyLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // 清除消息
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-6">
          {/* 页面标题 */}
          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">个人设置</h1>
              <p className="text-muted-foreground">
                管理您的账户设置和安全配置
              </p>
            </div>
          </div>

          {/* 全局消息提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6">
            {/* SSH密钥管理 */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Key className="h-5 w-5" />
                  <CardTitle>SSH私钥管理</CardTitle>
                </div>
                <CardDescription>
                  配置SSH私钥以访问私有Git仓库。私钥将被加密存储。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>加载设置中...</span>
                  </div>
                ) : (
                  <>
                    {/* 当前SSH密钥状态 */}
                    {settings?.has_ssh_key ? (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Shield className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800">SSH私钥已配置</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={deleteSshKey}
                            disabled={sshKeyLoading}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {sshKeyLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            删除
                          </Button>
                        </div>
                        {settings.ssh_key_fingerprint && (
                          <p className="text-sm text-green-700 mt-2">
                            密钥指纹: {settings.ssh_key_fingerprint}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          未配置SSH私钥。配置后可以访问私有Git仓库。
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* SSH密钥输入 */}
                    <div className="space-y-2">
                      <Label htmlFor="ssh-key">
                        {settings?.has_ssh_key ? '更新SSH私钥' : '添加SSH私钥'}
                      </Label>
                      <div className="relative">
                        <Textarea
                          id="ssh-key"
                          placeholder={`-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----`}
                          value={sshKey}
                          onChange={(e) => setSshKey(e.target.value)}
                          rows={10}
                          className="font-mono text-xs"
                          type={showSshKey ? 'text' : 'password'}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowSshKey(!showSshKey)}
                          className="absolute top-2 right-2"
                        >
                          {showSshKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        支持OpenSSH格式的私钥。请确保私钥的安全性，不要与他人分享。
                      </p>
                    </div>

                    <Button
                      onClick={updateSshKey}
                      disabled={!sshKey.trim() || sshKeyLoading}
                      className="w-full md:w-auto"
                    >
                      {sshKeyLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {settings?.has_ssh_key ? '更新密钥' : '保存密钥'}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 安全提示 */}
            <Card className="border-orange-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-orange-600" />
                  <CardTitle className="text-orange-800">安全提示</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-orange-700 space-y-2">
                <ul className="list-disc list-inside space-y-1">
                  <li>SSH私钥将被加密存储在服务器上</li>
                  <li>建议使用专门为Claude Web生成的SSH密钥对</li>
                  <li>定期轮换SSH密钥以提高安全性</li>
                  <li>不要在多个服务之间共享同一个私钥</li>
                  <li>如果密钥泄露，请立即删除并重新生成</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  )
}
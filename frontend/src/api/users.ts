/**
 * 用户设置相关API
 */
import { apiClient } from '@/lib/api'

// 类型定义
export interface UserSettings {
  has_ssh_key: boolean
  ssh_key_fingerprint?: string
}

export interface UserSettingsUpdate {
  ssh_private_key?: string
}

export class UserApiService {
  private static readonly BASE_PATH = '/api/v1/users'

  /**
   * 获取用户设置
   */
  static async getSettings(): Promise<UserSettings> {
    return await apiClient.get<UserSettings>(`${this.BASE_PATH}/settings`)
  }

  /**
   * 更新用户设置
   */
  static async updateSettings(settings: UserSettingsUpdate): Promise<UserSettings> {
    return await apiClient.put<UserSettings>(`${this.BASE_PATH}/settings`, settings)
  }
}

export default UserApiService
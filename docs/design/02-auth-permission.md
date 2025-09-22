# 用户认证和权限管理设计文档

## 1. 认证系统概览

### 1.1 设计目标
- **安全性**: 多层安全防护，防止未授权访问
- **便捷性**: 支持多种认证方式，用户体验友好
- **扩展性**: 支持第三方登录集成，权限模型可扩展
- **合规性**: 符合数据保护法规，审计追溯完整

### 1.2 认证流程架构
```
┌─────────────────────────────────────────────────────────────────┐
│                        认证流程架构                               │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   用户登录      │   Token验证     │   权限检查      │   会话管理   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │用户名密码   │ │ │JWT验证      │ │ │RBAC权限     │ │ │会话存储 │ │
│ │手机验证码   │ │ │Token刷新    │ │ │资源访问     │ │ │登录状态 │ │
│ │第三方OAuth  │ │ │签名校验     │ │ │操作审计     │ │ │设备管理 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. JWT Token设计

### 2.1 Token结构设计

#### 2.1.1 Access Token
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-1"
  },
  "payload": {
    "sub": "user-uuid-123",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user",
    "permissions": ["project:read", "project:write", "task:execute"],
    "iat": 1640995200,
    "exp": 1641081600,
    "aud": "claude-web",
    "iss": "claude-auth-service",
    "jti": "token-uuid-456",
    "device_id": "device-uuid-789"
  }
}
```

#### 2.1.2 Refresh Token
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-1"
  },
  "payload": {
    "sub": "user-uuid-123",
    "token_type": "refresh",
    "access_token_id": "token-uuid-456",
    "iat": 1640995200,
    "exp": 1648771200,
    "aud": "claude-web",
    "iss": "claude-auth-service",
    "jti": "refresh-token-uuid-321"
  }
}
```

### 2.2 Token生命周期管理

```python
class TokenLifecycle:
    ACCESS_TOKEN_EXPIRE = 15 * 60  # 15分钟
    REFRESH_TOKEN_EXPIRE = 90 * 24 * 60 * 60  # 90天
    REMEMBER_ME_EXPIRE = 365 * 24 * 60 * 60  # 1年
    
    def __init__(self):
        self.token_blacklist = RedisBlacklist()
        self.key_rotation = KeyRotationService()
    
    def create_token_pair(self, user: User, device_info: dict) -> TokenPair:
        # 创建Access Token和Refresh Token对
        pass
    
    def refresh_access_token(self, refresh_token: str) -> str:
        # 使用Refresh Token获取新的Access Token
        pass
    
    def revoke_token(self, token_id: str) -> bool:
        # 撤销Token (加入黑名单)
        pass
    
    def validate_token(self, token: str) -> TokenClaims:
        # 验证Token有效性
        pass
```

### 2.3 密钥管理和轮换

```python
class KeyManagement:
    def __init__(self):
        self.key_store = SecureKeyStore()
        self.rotation_schedule = CronScheduler()
    
    def generate_key_pair(self) -> KeyPair:
        """生成RSA密钥对"""
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096,
            backend=default_backend()
        )
        return KeyPair(private_key, private_key.public_key())
    
    def rotate_keys(self) -> None:
        """定期轮换密钥"""
        new_key_pair = self.generate_key_pair()
        self.key_store.add_key(new_key_pair)
        self.schedule_old_key_removal()
    
    def get_current_key(self) -> PrivateKey:
        """获取当前签名密钥"""
        return self.key_store.get_current_private_key()
    
    def get_public_key(self, key_id: str) -> PublicKey:
        """根据key_id获取公钥用于验证"""
        return self.key_store.get_public_key(key_id)
```

## 3. RBAC权限模型

### 3.1 权限模型设计

#### 3.1.1 核心实体关系
```
User ←→ UserRole ←→ Role ←→ RolePermission ←→ Permission
                    ↑
                Resource ←→ ResourcePermission
```

#### 3.1.2 数据库表结构
```sql
-- 用户表
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('active', 'inactive', 'locked') DEFAULT 'active',
    failed_login_attempts INT DEFAULT 0,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status)
);

-- 角色表
CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);

-- 权限表
CREATE TABLE permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_resource_action (resource, action)
);

-- 用户角色关联表
CREATE TABLE user_roles (
    user_id CHAR(36) NOT NULL,
    role_id INT NOT NULL,
    granted_by CHAR(36),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id)
);

-- 角色权限关联表
CREATE TABLE role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 资源表 (项目等)
CREATE TABLE resources (
    id CHAR(36) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_owner (owner_id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- 资源权限表 (资源级别的特殊权限)
CREATE TABLE resource_permissions (
    id CHAR(36) PRIMARY KEY,
    resource_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    permission VARCHAR(50) NOT NULL,
    granted_by CHAR(36),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    UNIQUE KEY uk_resource_user_permission (resource_id, user_id, permission),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id)
);
```

### 3.2 预定义角色和权限

#### 3.2.1 系统角色
```python
SYSTEM_ROLES = {
    'super_admin': {
        'name': '超级管理员',
        'permissions': ['*:*']  # 所有权限
    },
    'admin': {
        'name': '系统管理员', 
        'permissions': [
            'user:read', 'user:write', 'user:delete',
            'role:read', 'role:write',
            'system:read', 'system:config'
        ]
    },
    'user': {
        'name': '普通用户',
        'permissions': [
            'project:read', 'project:write', 'project:delete',
            'task:read', 'task:execute', 'task:cancel',
            'profile:read', 'profile:write'
        ]
    },
    'readonly': {
        'name': '只读用户',
        'permissions': [
            'project:read', 'task:read', 'profile:read'
        ]
    }
}
```

#### 3.2.2 权限定义
```python
PERMISSIONS = {
    # 用户管理
    'user:read': '查看用户信息',
    'user:write': '编辑用户信息',
    'user:delete': '删除用户',
    
    # 项目管理
    'project:read': '查看项目',
    'project:write': '编辑项目',
    'project:delete': '删除项目',
    'project:share': '分享项目',
    
    # 任务管理
    'task:read': '查看任务',
    'task:execute': '执行任务',
    'task:cancel': '取消任务',
    'task:retry': '重试任务',
    
    # 系统管理
    'system:read': '查看系统信息',
    'system:config': '配置系统',
    'system:monitor': '监控系统',
    
    # 个人资料
    'profile:read': '查看个人资料',
    'profile:write': '编辑个人资料'
}
```

### 3.3 权限检查实现

```python
class PermissionChecker:
    def __init__(self, redis_client: Redis, db_session: AsyncSession):
        self.redis = redis_client
        self.db = db_session
        
    async def check_permission(
        self, 
        user_id: str, 
        resource: str, 
        action: str,
        resource_id: str = None
    ) -> bool:
        """检查用户权限"""
        
        # 1. 检查缓存
        cache_key = f"perm:{user_id}:{resource}:{action}:{resource_id or 'global'}"
        cached_result = await self.redis.get(cache_key)
        if cached_result is not None:
            return cached_result == 'true'
        
        # 2. 检查全局权限 (通过角色)
        has_global_permission = await self._check_role_permission(
            user_id, resource, action
        )
        
        # 3. 检查资源级权限
        has_resource_permission = False
        if resource_id:
            has_resource_permission = await self._check_resource_permission(
                user_id, resource_id, action
            )
        
        # 4. 综合判断
        result = has_global_permission or has_resource_permission
        
        # 5. 缓存结果 (5分钟)
        await self.redis.setex(cache_key, 300, 'true' if result else 'false')
        
        return result
    
    async def _check_role_permission(
        self, user_id: str, resource: str, action: str
    ) -> bool:
        """检查角色权限"""
        query = """
        SELECT COUNT(*) > 0 as has_permission
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = %s
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND (p.resource = %s AND p.action = %s OR p.name = '*:*')
        """
        result = await self.db.execute(query, (user_id, resource, action))
        return result.scalar()
    
    async def _check_resource_permission(
        self, user_id: str, resource_id: str, action: str
    ) -> bool:
        """检查资源级权限"""
        query = """
        SELECT COUNT(*) > 0 as has_permission
        FROM resource_permissions rp
        WHERE rp.user_id = %s
          AND rp.resource_id = %s
          AND rp.permission = %s
          AND (rp.expires_at IS NULL OR rp.expires_at > NOW())
        """
        result = await self.db.execute(query, (user_id, resource_id, action))
        return result.scalar()
```

## 4. 多因子认证 (MFA)

### 4.1 支持的认证方式

#### 4.1.1 TOTP (Time-based One-Time Password)
```python
class TOTPAuthenticator:
    def __init__(self):
        self.totp = pyotp.TOTP
        
    def generate_secret(self) -> str:
        """生成TOTP密钥"""
        return pyotp.random_base32()
    
    def generate_qr_code(self, user: User, secret: str) -> str:
        """生成二维码URL"""
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(
            name=user.email,
            issuer_name="Claude Web"
        )
    
    def verify_token(self, secret: str, token: str) -> bool:
        """验证TOTP令牌"""
        totp = pyotp.TOTP(secret)
        return totp.verify(token, valid_window=1)
```

#### 4.1.2 SMS验证码
```python
class SMSAuthenticator:
    def __init__(self, sms_service: SMSService):
        self.sms_service = sms_service
        self.redis = Redis()
    
    async def send_code(self, phone: str) -> bool:
        """发送短信验证码"""
        code = self._generate_code()
        cache_key = f"sms_code:{phone}"
        
        # 存储验证码 (5分钟过期)
        await self.redis.setex(cache_key, 300, code)
        
        # 发送短信
        return await self.sms_service.send_message(
            phone, f"Claude Web验证码: {code}, 5分钟内有效"
        )
    
    async def verify_code(self, phone: str, code: str) -> bool:
        """验证短信验证码"""
        cache_key = f"sms_code:{phone}"
        stored_code = await self.redis.get(cache_key)
        
        if stored_code and stored_code.decode() == code:
            await self.redis.delete(cache_key)
            return True
        return False
    
    def _generate_code(self) -> str:
        """生成6位数字验证码"""
        return ''.join([str(random.randint(0, 9)) for _ in range(6)])
```

### 4.2 MFA认证流程

```python
class MFAAuthenticator:
    def __init__(self):
        self.totp = TOTPAuthenticator()
        self.sms = SMSAuthenticator()
        
    async def initiate_mfa_setup(self, user: User, method: str) -> dict:
        """初始化MFA设置"""
        if method == 'totp':
            secret = self.totp.generate_secret()
            qr_code_url = self.totp.generate_qr_code(user, secret)
            
            # 临时存储secret，等待验证
            cache_key = f"mfa_setup:{user.id}:totp"
            await self.redis.setex(cache_key, 600, secret)  # 10分钟
            
            return {
                'method': 'totp',
                'secret': secret,
                'qr_code_url': qr_code_url
            }
            
        elif method == 'sms':
            if not user.phone:
                raise ValueError("用户未绑定手机号")
            
            await self.sms.send_code(user.phone)
            return {'method': 'sms', 'phone': user.phone}
    
    async def verify_mfa_setup(self, user: User, method: str, token: str) -> bool:
        """验证MFA设置"""
        if method == 'totp':
            cache_key = f"mfa_setup:{user.id}:totp"
            secret = await self.redis.get(cache_key)
            
            if secret and self.totp.verify_token(secret.decode(), token):
                # 保存MFA配置
                await self._save_mfa_config(user.id, method, secret.decode())
                await self.redis.delete(cache_key)
                return True
                
        elif method == 'sms':
            if await self.sms.verify_code(user.phone, token):
                await self._save_mfa_config(user.id, method, user.phone)
                return True
                
        return False
    
    async def verify_mfa_token(self, user: User, token: str) -> bool:
        """验证MFA令牌"""
        mfa_config = await self._get_mfa_config(user.id)
        if not mfa_config:
            return True  # 未启用MFA
            
        method = mfa_config.method
        
        if method == 'totp':
            return self.totp.verify_token(mfa_config.secret, token)
        elif method == 'sms':
            return await self.sms.verify_code(mfa_config.phone, token)
            
        return False
```

## 5. 第三方认证集成

### 5.1 OAuth 2.0集成

#### 5.1.1 支持的第三方平台
- **GitHub**: 开发者身份验证
- **Google**: 通用身份验证
- **飞书**: 企业身份验证
- **微信**: 移动端身份验证

#### 5.1.2 OAuth配置
```python
OAUTH_PROVIDERS = {
    'github': {
        'client_id': os.getenv('GITHUB_CLIENT_ID'),
        'client_secret': os.getenv('GITHUB_CLIENT_SECRET'),
        'authorize_url': 'https://github.com/login/oauth/authorize',
        'token_url': 'https://github.com/login/oauth/access_token',
        'user_info_url': 'https://api.github.com/user',
        'scopes': ['user:email']
    },
    'google': {
        'client_id': os.getenv('GOOGLE_CLIENT_ID'),
        'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
        'authorize_url': 'https://accounts.google.com/o/oauth2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'user_info_url': 'https://www.googleapis.com/oauth2/v2/userinfo',
        'scopes': ['openid', 'email', 'profile']
    }
}
```

#### 5.1.3 OAuth认证流程
```python
class OAuthAuthenticator:
    def __init__(self, provider: str):
        self.provider = provider
        self.config = OAUTH_PROVIDERS[provider]
        
    def get_authorization_url(self, state: str) -> str:
        """获取授权URL"""
        params = {
            'client_id': self.config['client_id'],
            'redirect_uri': f"{BASE_URL}/auth/oauth/{self.provider}/callback",
            'scope': ' '.join(self.config['scopes']),
            'response_type': 'code',
            'state': state
        }
        return f"{self.config['authorize_url']}?{urlencode(params)}"
    
    async def exchange_code_for_token(self, code: str) -> dict:
        """用授权码换取访问令牌"""
        data = {
            'client_id': self.config['client_id'],
            'client_secret': self.config['client_secret'],
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': f"{BASE_URL}/auth/oauth/{self.provider}/callback"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(self.config['token_url'], data=data)
            return response.json()
    
    async def get_user_info(self, access_token: str) -> dict:
        """获取用户信息"""
        headers = {'Authorization': f'Bearer {access_token}'}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.config['user_info_url'], 
                headers=headers
            )
            return response.json()
    
    async def authenticate(self, code: str) -> User:
        """完整OAuth认证流程"""
        # 1. 交换访问令牌
        token_data = await self.exchange_code_for_token(code)
        access_token = token_data['access_token']
        
        # 2. 获取用户信息
        user_info = await self.get_user_info(access_token)
        
        # 3. 查找或创建用户
        user = await self._find_or_create_user(user_info)
        
        return user
```

## 6. 会话管理

### 6.1 会话存储设计

```python
class SessionManager:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        
    async def create_session(
        self, 
        user_id: str, 
        device_info: dict,
        remember_me: bool = False
    ) -> str:
        """创建用户会话"""
        session_id = str(uuid.uuid4())
        expire_time = 86400 if not remember_me else 86400 * 30  # 1天或30天
        
        session_data = {
            'user_id': user_id,
            'device_info': json.dumps(device_info),
            'created_at': datetime.utcnow().isoformat(),
            'last_activity': datetime.utcnow().isoformat()
        }
        
        # 存储会话数据
        session_key = f"session:{session_id}"
        await self.redis.hmset(session_key, session_data)
        await self.redis.expire(session_key, expire_time)
        
        # 添加到用户会话列表
        user_sessions_key = f"user_sessions:{user_id}"
        await self.redis.sadd(user_sessions_key, session_id)
        await self.redis.expire(user_sessions_key, expire_time)
        
        return session_id
    
    async def get_session(self, session_id: str) -> dict:
        """获取会话数据"""
        session_key = f"session:{session_id}"
        session_data = await self.redis.hgetall(session_key)
        
        if session_data:
            # 更新最后活动时间
            await self.redis.hset(
                session_key, 
                'last_activity', 
                datetime.utcnow().isoformat()
            )
            
            return {
                'user_id': session_data['user_id'],
                'device_info': json.loads(session_data['device_info']),
                'created_at': session_data['created_at'],
                'last_activity': session_data['last_activity']
            }
        return None
    
    async def revoke_session(self, session_id: str) -> bool:
        """撤销会话"""
        session_key = f"session:{session_id}"
        session_data = await self.redis.hgetall(session_key)
        
        if session_data:
            user_id = session_data['user_id']
            
            # 删除会话
            await self.redis.delete(session_key)
            
            # 从用户会话列表中移除
            user_sessions_key = f"user_sessions:{user_id}"
            await self.redis.srem(user_sessions_key, session_id)
            
            return True
        return False
    
    async def revoke_all_sessions(self, user_id: str, except_session: str = None) -> int:
        """撤销用户的所有会话"""
        user_sessions_key = f"user_sessions:{user_id}"
        session_ids = await self.redis.smembers(user_sessions_key)
        
        revoked_count = 0
        for session_id in session_ids:
            if session_id != except_session:
                if await self.revoke_session(session_id):
                    revoked_count += 1
                    
        return revoked_count
```

## 7. 安全防护机制

### 7.1 登录安全

#### 7.1.1 暴力破解防护
```python
class LoginSecurity:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        
    async def check_login_attempts(self, username: str, ip_address: str) -> dict:
        """检查登录尝试次数"""
        user_key = f"login_attempts:user:{username}"
        ip_key = f"login_attempts:ip:{ip_address}"
        
        user_attempts = await self.redis.get(user_key) or 0
        ip_attempts = await self.redis.get(ip_key) or 0
        
        user_attempts = int(user_attempts)
        ip_attempts = int(ip_attempts)
        
        # 检查是否被锁定
        if user_attempts >= 5:  # 用户锁定阈值
            user_lockout_key = f"lockout:user:{username}"
            lockout_time = await self.redis.ttl(user_lockout_key)
            if lockout_time > 0:
                return {
                    'allowed': False,
                    'reason': 'user_locked',
                    'retry_after': lockout_time
                }
                
        if ip_attempts >= 10:  # IP锁定阈值
            ip_lockout_key = f"lockout:ip:{ip_address}"
            lockout_time = await self.redis.ttl(ip_lockout_key)
            if lockout_time > 0:
                return {
                    'allowed': False,
                    'reason': 'ip_locked',
                    'retry_after': lockout_time
                }
        
        return {'allowed': True}
    
    async def record_failed_attempt(self, username: str, ip_address: str):
        """记录失败的登录尝试"""
        user_key = f"login_attempts:user:{username}"
        ip_key = f"login_attempts:ip:{ip_address}"
        
        # 增加尝试计数
        await self.redis.incr(user_key)
        await self.redis.incr(ip_key)
        
        # 设置过期时间 (1小时)
        await self.redis.expire(user_key, 3600)
        await self.redis.expire(ip_key, 3600)
        
        # 检查是否需要锁定
        user_attempts = int(await self.redis.get(user_key))
        ip_attempts = int(await self.redis.get(ip_key))
        
        if user_attempts >= 5:
            user_lockout_key = f"lockout:user:{username}"
            await self.redis.setex(user_lockout_key, 1800, "locked")  # 锁定30分钟
            
        if ip_attempts >= 10:
            ip_lockout_key = f"lockout:ip:{ip_address}"
            await self.redis.setex(ip_lockout_key, 3600, "locked")  # 锁定1小时
    
    async def clear_failed_attempts(self, username: str, ip_address: str):
        """清除失败尝试记录 (登录成功后)"""
        user_key = f"login_attempts:user:{username}"
        ip_key = f"login_attempts:ip:{ip_address}"
        
        await self.redis.delete(user_key, ip_key)
```

#### 7.1.2 异地登录检测
```python
class LocationSecurity:
    def __init__(self, geoip_service: GeoIPService):
        self.geoip = geoip_service
        self.redis = Redis()
        
    async def check_suspicious_location(self, user_id: str, ip_address: str) -> bool:
        """检测异地登录"""
        # 获取IP地理位置
        location = await self.geoip.get_location(ip_address)
        if not location:
            return False
            
        # 获取用户历史登录位置
        user_locations_key = f"user_locations:{user_id}"
        known_locations = await self.redis.smembers(user_locations_key)
        
        current_location = f"{location['country']}:{location['city']}"
        
        if current_location not in known_locations:
            # 新地点，记录并发送通知
            await self.redis.sadd(user_locations_key, current_location)
            await self.redis.expire(user_locations_key, 86400 * 365)  # 保留1年
            
            # 发送异地登录通知
            await self._send_location_alert(user_id, location, ip_address)
            return True
            
        return False
    
    async def _send_location_alert(self, user_id: str, location: dict, ip_address: str):
        """发送异地登录警报"""
        alert_data = {
            'type': 'suspicious_login',
            'location': location,
            'ip_address': ip_address,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 这里集成通知服务
        await NotificationService.send_security_alert(user_id, alert_data)
```

## 8. 审计和监控

### 8.1 操作审计

```python
class AuditLogger:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        
    async def log_auth_event(
        self,
        user_id: str,
        event_type: str,
        ip_address: str,
        user_agent: str,
        details: dict = None
    ):
        """记录认证相关事件"""
        audit_log = AuditLog(
            user_id=user_id,
            event_type=event_type,
            resource_type='auth',
            ip_address=ip_address,
            user_agent=user_agent,
            details=json.dumps(details or {}),
            timestamp=datetime.utcnow()
        )
        
        self.db.add(audit_log)
        await self.db.commit()
    
    async def log_permission_check(
        self,
        user_id: str,
        resource: str,
        action: str,
        allowed: bool,
        resource_id: str = None
    ):
        """记录权限检查"""
        await self.log_auth_event(
            user_id=user_id,
            event_type='permission_check',
            ip_address=get_client_ip(),
            user_agent=get_user_agent(),
            details={
                'resource': resource,
                'action': action,
                'resource_id': resource_id,
                'allowed': allowed
            }
        )

# 认证事件类型
AUTH_EVENTS = {
    'login_success': '登录成功',
    'login_failed': '登录失败',
    'logout': '用户登出',
    'password_change': '密码修改',
    'mfa_enabled': 'MFA启用',
    'mfa_disabled': 'MFA禁用',
    'oauth_login': '第三方登录',
    'session_expired': '会话过期',
    'suspicious_login': '异地登录',
    'account_locked': '账户锁定'
}
```

### 8.2 安全监控指标

```python
class SecurityMetrics:
    def __init__(self, metrics_client: MetricsClient):
        self.metrics = metrics_client
        
    def track_login_attempt(self, success: bool, method: str):
        """跟踪登录尝试"""
        self.metrics.increment(
            'auth.login_attempts',
            tags={
                'success': success,
                'method': method
            }
        )
    
    def track_token_usage(self, token_type: str, action: str):
        """跟踪Token使用"""
        self.metrics.increment(
            'auth.token_usage',
            tags={
                'type': token_type,
                'action': action
            }
        )
    
    def track_permission_check(self, resource: str, allowed: bool):
        """跟踪权限检查"""
        self.metrics.increment(
            'auth.permission_checks',
            tags={
                'resource': resource,
                'allowed': allowed
            }
        )
```

## 9. API接口设计

### 9.1 认证相关接口

```yaml
# 用户注册
POST /api/v1/auth/register:
  summary: 用户注册
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            username:
              type: string
              minLength: 3
              maxLength: 50
            email:
              type: string
              format: email
            password:
              type: string
              minLength: 8
            phone:
              type: string
              pattern: '^1[3-9]\d{9}$'
  responses:
    201:
      description: 注册成功
    400:
      description: 参数错误
    409:
      description: 用户已存在

# 用户登录
POST /api/v1/auth/login:
  summary: 用户登录
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            username:
              type: string
            password:
              type: string
            mfa_token:
              type: string
            remember_me:
              type: boolean
            device_info:
              type: object
  responses:
    200:
      description: 登录成功
      content:
        application/json:
          schema:
            type: object
            properties:
              access_token:
                type: string
              refresh_token:
                type: string
              expires_in:
                type: integer
              user:
                $ref: '#/components/schemas/User'
    401:
      description: 认证失败
    423:
      description: 账户锁定

# Token刷新
POST /api/v1/auth/refresh:
  summary: 刷新访问令牌
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            refresh_token:
              type: string
  responses:
    200:
      description: 刷新成功
    401:
      description: 刷新令牌无效

# MFA设置
POST /api/v1/auth/mfa/setup:
  summary: 设置多因子认证
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            method:
              type: string
              enum: [totp, sms]
  responses:
    200:
      description: 设置成功

# 第三方登录
GET /api/v1/auth/oauth/{provider}:
  summary: 第三方登录
  parameters:
    - name: provider
      in: path
      required: true
      schema:
        type: string
        enum: [github, google, feishu]
  responses:
    302:
      description: 重定向到第三方授权页面
```

这套认证和权限管理系统提供了完整的安全框架，支持多种认证方式、细粒度权限控制、全面的安全防护和审计监控。
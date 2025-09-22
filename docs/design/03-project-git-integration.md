# 项目管理和Git集成设计文档

## 1. 项目管理概览

### 1.1 设计目标
- **多项目隔离**: 不同用户项目完全隔离，数据安全
- **Git深度集成**: 支持主流Git托管平台，自动化仓库操作
- **权限精细控制**: 项目级别权限管理，支持团队协作
- **版本管理**: 支持分支管理，版本追踪，代码回滚

### 1.2 核心功能架构
```
┌─────────────────────────────────────────────────────────────────┐
│                      项目管理架构                                 │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   项目配置      │   Git集成       │   权限管理      │   文件管理   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │基本信息     │ │ │仓库克隆     │ │ │成员管理     │ │ │文件存储 │ │
│ │环境配置     │ │ │分支管理     │ │ │角色分配     │ │ │版本控制 │ │
│ │密钥管理     │ │ │提交推送     │ │ │权限验证     │ │ │备份策略 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. 项目数据模型设计

### 2.1 核心实体关系
```
User ←→ ProjectMember ←→ Project ←→ ProjectConfig
                         ↑           ↓
ProjectRepository ←→ GitBranch   ProjectSecret
       ↑                          ↓
   GitCredential              Environment
```

### 2.2 数据库表结构

#### 2.2.1 项目表
```sql
CREATE TABLE projects (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    owner_id CHAR(36) NOT NULL,
    status ENUM('active', 'archived', 'deleted') DEFAULT 'active',
    visibility ENUM('private', 'internal', 'public') DEFAULT 'private',
    
    -- Git相关信息
    git_url VARCHAR(500) NOT NULL,
    git_provider ENUM('github', 'gitlab', 'gitee', 'custom') NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main',
    
    -- 配置信息
    config JSON,
    settings JSON,
    
    -- 统计信息
    member_count INT DEFAULT 1,
    task_count INT DEFAULT 0,
    last_activity_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_owner (owner_id),
    INDEX idx_status (status),
    INDEX idx_last_activity (last_activity_at),
    FULLTEXT KEY ft_name_desc (name, description)
);

-- 项目成员表
CREATE TABLE project_members (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role ENUM('owner', 'admin', 'developer', 'viewer') NOT NULL,
    permissions JSON,
    
    invited_by CHAR(36),
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    joined_at TIMESTAMP NULL,
    status ENUM('pending', 'active', 'inactive') DEFAULT 'pending',
    
    UNIQUE KEY uk_project_user (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id),
    INDEX idx_user (user_id),
    INDEX idx_role (role)
);

-- Git仓库信息表
CREATE TABLE project_repositories (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    git_url VARCHAR(500) NOT NULL,
    provider ENUM('github', 'gitlab', 'gitee', 'custom') NOT NULL,
    
    -- 仓库元数据
    full_name VARCHAR(200),
    default_branch VARCHAR(100) DEFAULT 'main',
    is_private BOOLEAN DEFAULT TRUE,
    clone_url VARCHAR(500),
    ssh_url VARCHAR(500),
    
    -- 同步信息
    last_sync_at TIMESTAMP NULL,
    sync_status ENUM('success', 'failed', 'pending') DEFAULT 'pending',
    sync_error TEXT,
    
    -- 统计信息
    commit_count INT DEFAULT 0,
    branch_count INT DEFAULT 0,
    contributor_count INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_project_repo (project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_provider (provider),
    INDEX idx_sync_status (sync_status)
);

-- Git分支信息表
CREATE TABLE git_branches (
    id CHAR(36) PRIMARY KEY,
    repository_id CHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    commit_sha VARCHAR(40) NOT NULL,
    commit_message TEXT,
    commit_author VARCHAR(100),
    commit_date TIMESTAMP NULL,
    
    is_default BOOLEAN DEFAULT FALSE,
    is_protected BOOLEAN DEFAULT FALSE,
    behind_count INT DEFAULT 0,
    ahead_count INT DEFAULT 0,
    
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_repo_branch (repository_id, name),
    FOREIGN KEY (repository_id) REFERENCES project_repositories(id) ON DELETE CASCADE,
    INDEX idx_default (is_default),
    INDEX idx_commit_date (commit_date)
);

-- Git凭证表
CREATE TABLE git_credentials (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    credential_type ENUM('ssh_key', 'personal_token', 'oauth', 'username_password') NOT NULL,
    
    -- 加密存储的凭证信息
    encrypted_data TEXT NOT NULL,
    public_key TEXT NULL,  -- SSH公钥
    
    -- 元数据
    name VARCHAR(100) NOT NULL,
    description TEXT,
    provider VARCHAR(50),
    
    -- 状态信息
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_type (credential_type),
    INDEX idx_active (is_active)
);

-- 项目配置表
CREATE TABLE project_configs (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    config_type ENUM('environment', 'build', 'deploy', 'notification') NOT NULL,
    name VARCHAR(100) NOT NULL,
    config_data JSON NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_by CHAR(36) NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_project_type_name (project_id, config_type, name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_type (config_type)
);

-- 项目密钥表
CREATE TABLE project_secrets (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    encrypted_value TEXT NOT NULL,
    description TEXT,
    
    -- 权限控制
    access_level ENUM('owner', 'admin', 'developer') DEFAULT 'admin',
    
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_project_key (project_id, key_name),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_access_level (access_level)
);
```

## 3. Git集成架构

### 3.1 Git服务抽象层

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class GitRepository:
    url: str
    name: str
    full_name: str
    default_branch: str
    is_private: bool
    clone_url: str
    ssh_url: str

@dataclass
class GitBranch:
    name: str
    commit_sha: str
    commit_message: str
    commit_author: str
    commit_date: datetime
    is_default: bool

@dataclass
class GitCommit:
    sha: str
    message: str
    author: str
    date: datetime
    files_changed: List[str]

class GitProvider(ABC):
    """Git服务提供商抽象基类"""
    
    @abstractmethod
    async def authenticate(self, credentials: Dict) -> bool:
        """认证验证"""
        pass
    
    @abstractmethod
    async def get_repository_info(self, repo_url: str) -> GitRepository:
        """获取仓库信息"""
        pass
    
    @abstractmethod
    async def list_branches(self, repo_url: str) -> List[GitBranch]:
        """列出所有分支"""
        pass
    
    @abstractmethod
    async def get_commit_history(self, repo_url: str, branch: str, limit: int = 50) -> List[GitCommit]:
        """获取提交历史"""
        pass
    
    @abstractmethod
    async def create_branch(self, repo_url: str, branch_name: str, from_branch: str = None) -> bool:
        """创建分支"""
        pass
    
    @abstractmethod
    async def delete_branch(self, repo_url: str, branch_name: str) -> bool:
        """删除分支"""
        pass
    
    @abstractmethod
    async def get_file_content(self, repo_url: str, file_path: str, branch: str = None) -> str:
        """获取文件内容"""
        pass
    
    @abstractmethod
    async def create_webhook(self, repo_url: str, webhook_url: str, events: List[str]) -> str:
        """创建Webhook"""
        pass
```

### 3.2 GitHub集成实现

```python
import httpx
from typing import List, Dict, Optional

class GitHubProvider(GitProvider):
    def __init__(self, token: str = None):
        self.token = token
        self.base_url = "https://api.github.com"
        
    def _get_headers(self) -> Dict[str, str]:
        headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        return headers
    
    async def authenticate(self, credentials: Dict) -> bool:
        """验证GitHub凭证"""
        token = credentials.get("token")
        if not token:
            return False
            
        headers = {"Authorization": f"token {token}"}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/user",
                    headers=headers
                )
                return response.status_code == 200
            except Exception:
                return False
    
    async def get_repository_info(self, repo_url: str) -> GitRepository:
        """获取GitHub仓库信息"""
        repo_path = self._extract_repo_path(repo_url)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo_path}",
                headers=self._get_headers()
            )
            
            if response.status_code != 200:
                raise ValueError(f"Failed to fetch repository info: {response.status_code}")
            
            data = response.json()
            return GitRepository(
                url=data["html_url"],
                name=data["name"],
                full_name=data["full_name"],
                default_branch=data["default_branch"],
                is_private=data["private"],
                clone_url=data["clone_url"],
                ssh_url=data["ssh_url"]
            )
    
    async def list_branches(self, repo_url: str) -> List[GitBranch]:
        """列出GitHub仓库分支"""
        repo_path = self._extract_repo_path(repo_url)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/repos/{repo_path}/branches",
                headers=self._get_headers()
            )
            
            branches = []
            for branch_data in response.json():
                commit_data = branch_data["commit"]
                branches.append(GitBranch(
                    name=branch_data["name"],
                    commit_sha=commit_data["sha"],
                    commit_message=commit_data["commit"]["message"],
                    commit_author=commit_data["commit"]["author"]["name"],
                    commit_date=datetime.fromisoformat(
                        commit_data["commit"]["author"]["date"].replace("Z", "+00:00")
                    ),
                    is_default=False  # 需要额外查询默认分支
                ))
            
            return branches
    
    async def create_webhook(self, repo_url: str, webhook_url: str, events: List[str]) -> str:
        """创建GitHub Webhook"""
        repo_path = self._extract_repo_path(repo_url)
        
        webhook_config = {
            "name": "web",
            "active": True,
            "events": events,
            "config": {
                "url": webhook_url,
                "content_type": "json",
                "secret": self._generate_webhook_secret()
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/repos/{repo_path}/hooks",
                headers=self._get_headers(),
                json=webhook_config
            )
            
            if response.status_code == 201:
                return response.json()["id"]
            else:
                raise ValueError(f"Failed to create webhook: {response.status_code}")
    
    def _extract_repo_path(self, repo_url: str) -> str:
        """从URL提取仓库路径"""
        # 支持多种GitHub URL格式
        if "github.com/" in repo_url:
            parts = repo_url.split("github.com/")[-1]
            return parts.replace(".git", "").rstrip("/")
        else:
            raise ValueError("Invalid GitHub repository URL")
    
    def _generate_webhook_secret(self) -> str:
        """生成Webhook密钥"""
        import secrets
        return secrets.token_hex(32)
```

### 3.3 GitLab集成实现

```python
class GitLabProvider(GitProvider):
    def __init__(self, token: str = None, base_url: str = "https://gitlab.com"):
        self.token = token
        self.base_url = f"{base_url}/api/v4"
    
    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers
    
    async def get_repository_info(self, repo_url: str) -> GitRepository:
        """获取GitLab仓库信息"""
        project_id = self._extract_project_id(repo_url)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/projects/{project_id}",
                headers=self._get_headers()
            )
            
            data = response.json()
            return GitRepository(
                url=data["web_url"],
                name=data["name"],
                full_name=data["path_with_namespace"],
                default_branch=data["default_branch"],
                is_private=data["visibility"] == "private",
                clone_url=data["http_url_to_repo"],
                ssh_url=data["ssh_url_to_repo"]
            )
    
    def _extract_project_id(self, repo_url: str) -> str:
        """从URL提取项目ID"""
        # GitLab可以使用项目路径或ID
        if "gitlab.com/" in repo_url:
            path = repo_url.split("gitlab.com/")[-1].replace(".git", "").rstrip("/")
            return urllib.parse.quote_plus(path)
        else:
            raise ValueError("Invalid GitLab repository URL")
```

### 3.4 Git操作服务

```python
class GitOperationService:
    def __init__(self, storage_path: str = "/tmp/claude-repos"):
        self.storage_path = storage_path
        self.providers = {
            "github": GitHubProvider,
            "gitlab": GitLabProvider,
            "gitee": GiteeProvider
        }
        
    async def clone_repository(
        self, 
        project_id: str, 
        git_url: str, 
        credentials: Dict,
        branch: str = None
    ) -> str:
        """克隆Git仓库到本地"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        # 清理已存在的目录
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
        
        # 构建Git命令
        clone_cmd = ["git", "clone"]
        
        # 处理认证
        auth_url = self._build_authenticated_url(git_url, credentials)
        clone_cmd.append(auth_url)
        
        if branch:
            clone_cmd.extend(["-b", branch])
        
        clone_cmd.append(repo_path)
        
        # 执行克隆
        process = await asyncio.create_subprocess_exec(
            *clone_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.storage_path
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise GitOperationError(f"Clone failed: {stderr.decode()}")
        
        return repo_path
    
    async def pull_latest(self, project_id: str, branch: str = None) -> bool:
        """拉取最新代码"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        if not os.path.exists(repo_path):
            raise ValueError("Repository not cloned")
        
        # 切换分支（如果指定）
        if branch:
            await self._run_git_command(repo_path, ["checkout", branch])
        
        # 拉取最新代码
        result = await self._run_git_command(repo_path, ["pull", "origin"])
        return result.returncode == 0
    
    async def create_branch(self, project_id: str, branch_name: str, from_branch: str = None) -> bool:
        """创建新分支"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        if from_branch:
            await self._run_git_command(repo_path, ["checkout", from_branch])
        
        result = await self._run_git_command(repo_path, ["checkout", "-b", branch_name])
        return result.returncode == 0
    
    async def commit_changes(
        self, 
        project_id: str, 
        message: str, 
        files: List[str] = None
    ) -> str:
        """提交更改"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        # 添加文件
        if files:
            for file_path in files:
                await self._run_git_command(repo_path, ["add", file_path])
        else:
            await self._run_git_command(repo_path, ["add", "."])
        
        # 提交
        result = await self._run_git_command(repo_path, ["commit", "-m", message])
        
        if result.returncode == 0:
            # 获取提交SHA
            sha_result = await self._run_git_command(repo_path, ["rev-parse", "HEAD"])
            return sha_result.stdout.decode().strip()
        else:
            raise GitOperationError(f"Commit failed: {result.stderr.decode()}")
    
    async def push_changes(self, project_id: str, branch: str = None) -> bool:
        """推送更改到远程仓库"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        push_cmd = ["push", "origin"]
        if branch:
            push_cmd.append(branch)
        
        result = await self._run_git_command(repo_path, push_cmd)
        return result.returncode == 0
    
    async def get_status(self, project_id: str) -> Dict:
        """获取Git状态"""
        repo_path = os.path.join(self.storage_path, project_id)
        
        # 获取当前分支
        branch_result = await self._run_git_command(
            repo_path, ["branch", "--show-current"]
        )
        current_branch = branch_result.stdout.decode().strip()
        
        # 获取状态
        status_result = await self._run_git_command(
            repo_path, ["status", "--porcelain"]
        )
        
        # 解析状态
        changes = []
        for line in status_result.stdout.decode().split("\n"):
            if line.strip():
                status = line[:2]
                file_path = line[3:]
                changes.append({"status": status, "file": file_path})
        
        return {
            "current_branch": current_branch,
            "changes": changes,
            "has_changes": len(changes) > 0
        }
    
    async def _run_git_command(self, repo_path: str, args: List[str]):
        """运行Git命令"""
        cmd = ["git"] + args
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=repo_path
        )
        
        stdout, stderr = await process.communicate()
        
        return type('Result', (), {
            'returncode': process.returncode,
            'stdout': stdout,
            'stderr': stderr
        })()
    
    def _build_authenticated_url(self, git_url: str, credentials: Dict) -> str:
        """构建包含认证信息的Git URL"""
        if credentials.get("type") == "personal_token":
            token = credentials["token"]
            if "github.com" in git_url:
                return git_url.replace("https://", f"https://{token}@")
            elif "gitlab.com" in git_url:
                return git_url.replace("https://", f"https://oauth2:{token}@")
        
        return git_url


class GitOperationError(Exception):
    """Git操作异常"""
    pass
```

## 4. 项目管理服务

### 4.1 项目CRUD服务

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

class ProjectService:
    def __init__(self, db: AsyncSession, git_service: GitOperationService):
        self.db = db
        self.git_service = git_service
        self.encryption_service = EncryptionService()
    
    async def create_project(
        self, 
        user_id: str, 
        project_data: Dict,
        git_credentials: Dict = None
    ) -> Project:
        """创建新项目"""
        
        # 1. 验证Git仓库访问权限
        if git_credentials:
            provider = self._detect_git_provider(project_data["git_url"])
            git_provider = self._get_git_provider(provider, git_credentials)
            
            if not await git_provider.authenticate(git_credentials):
                raise ValueError("Git credentials authentication failed")
        
        # 2. 获取仓库信息
        repo_info = await git_provider.get_repository_info(project_data["git_url"])
        
        # 3. 创建项目记录
        project = Project(
            id=str(uuid.uuid4()),
            name=project_data["name"],
            description=project_data.get("description"),
            owner_id=user_id,
            git_url=project_data["git_url"],
            git_provider=provider,
            default_branch=repo_info.default_branch,
            config=project_data.get("config", {}),
            settings=project_data.get("settings", {})
        )
        
        self.db.add(project)
        
        # 4. 创建仓库信息记录
        repository = ProjectRepository(
            id=str(uuid.uuid4()),
            project_id=project.id,
            git_url=repo_info.url,
            provider=provider,
            full_name=repo_info.full_name,
            default_branch=repo_info.default_branch,
            is_private=repo_info.is_private,
            clone_url=repo_info.clone_url,
            ssh_url=repo_info.ssh_url
        )
        
        self.db.add(repository)
        
        # 5. 保存Git凭证
        if git_credentials:
            await self._save_git_credentials(project.id, git_credentials)
        
        # 6. 添加项目成员（所有者）
        member = ProjectMember(
            id=str(uuid.uuid4()),
            project_id=project.id,
            user_id=user_id,
            role="owner",
            status="active",
            joined_at=datetime.utcnow()
        )
        
        self.db.add(member)
        
        # 7. 异步克隆仓库
        asyncio.create_task(self._clone_repository_async(project.id, project_data["git_url"], git_credentials))
        
        await self.db.commit()
        return project
    
    async def get_project(self, project_id: str, user_id: str) -> Optional[Project]:
        """获取项目信息"""
        # 检查用户权限
        if not await self._check_project_access(project_id, user_id):
            raise PermissionError("Access denied")
        
        stmt = (
            select(Project)
            .options(
                selectinload(Project.repository),
                selectinload(Project.members),
                selectinload(Project.branches)
            )
            .where(Project.id == project_id)
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def update_project(
        self, 
        project_id: str, 
        user_id: str, 
        update_data: Dict
    ) -> Project:
        """更新项目信息"""
        # 检查权限
        if not await self._check_project_permission(project_id, user_id, "admin"):
            raise PermissionError("Insufficient permissions")
        
        # 更新项目
        stmt = (
            update(Project)
            .where(Project.id == project_id)
            .values(**update_data)
            .returning(Project)
        )
        
        result = await self.db.execute(stmt)
        project = result.scalar_one()
        
        await self.db.commit()
        return project
    
    async def delete_project(self, project_id: str, user_id: str) -> bool:
        """删除项目"""
        # 检查权限（仅所有者可删除）
        if not await self._check_project_permission(project_id, user_id, "owner"):
            raise PermissionError("Only project owner can delete project")
        
        # 软删除项目
        stmt = (
            update(Project)
            .where(Project.id == project_id)
            .values(status="deleted", updated_at=datetime.utcnow())
        )
        
        await self.db.execute(stmt)
        await self.db.commit()
        
        # 异步清理仓库文件
        asyncio.create_task(self._cleanup_project_files(project_id))
        
        return True
    
    async def list_user_projects(
        self, 
        user_id: str, 
        page: int = 1, 
        size: int = 20,
        status: str = "active"
    ) -> Dict:
        """列出用户项目"""
        offset = (page - 1) * size
        
        # 查询用户参与的项目
        stmt = (
            select(Project)
            .join(ProjectMember)
            .where(
                ProjectMember.user_id == user_id,
                ProjectMember.status == "active",
                Project.status == status
            )
            .options(selectinload(Project.repository))
            .order_by(Project.last_activity_at.desc())
            .offset(offset)
            .limit(size)
        )
        
        result = await self.db.execute(stmt)
        projects = result.scalars().all()
        
        # 统计总数
        count_stmt = (
            select(func.count(Project.id))
            .join(ProjectMember)
            .where(
                ProjectMember.user_id == user_id,
                ProjectMember.status == "active",
                Project.status == status
            )
        )
        
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar()
        
        return {
            "projects": projects,
            "total": total,
            "page": page,
            "size": size,
            "pages": (total + size - 1) // size
        }
    
    async def _save_git_credentials(self, project_id: str, credentials: Dict):
        """保存Git凭证"""
        encrypted_data = self.encryption_service.encrypt(json.dumps(credentials))
        
        git_credential = GitCredential(
            id=str(uuid.uuid4()),
            project_id=project_id,
            credential_type=credentials["type"],
            encrypted_data=encrypted_data,
            name=credentials.get("name", "default"),
            description=credentials.get("description"),
            provider=credentials.get("provider")
        )
        
        self.db.add(git_credential)
    
    async def _clone_repository_async(self, project_id: str, git_url: str, credentials: Dict):
        """异步克隆仓库"""
        try:
            repo_path = await self.git_service.clone_repository(
                project_id, git_url, credentials
            )
            
            # 更新仓库状态
            stmt = (
                update(ProjectRepository)
                .where(ProjectRepository.project_id == project_id)
                .values(
                    sync_status="success",
                    last_sync_at=datetime.utcnow()
                )
            )
            
            await self.db.execute(stmt)
            await self.db.commit()
            
            # 同步分支信息
            await self._sync_branch_info(project_id)
            
        except Exception as e:
            # 更新错误状态
            stmt = (
                update(ProjectRepository)
                .where(ProjectRepository.project_id == project_id)
                .values(
                    sync_status="failed",
                    sync_error=str(e),
                    last_sync_at=datetime.utcnow()
                )
            )
            
            await self.db.execute(stmt)
            await self.db.commit()
```

### 4.2 分支管理服务

```python
class BranchManagementService:
    def __init__(self, db: AsyncSession, git_service: GitOperationService):
        self.db = db
        self.git_service = git_service
    
    async def sync_branches(self, project_id: str) -> List[GitBranch]:
        """同步分支信息"""
        project = await self._get_project_with_credentials(project_id)
        provider = self._get_git_provider(project.git_provider, project.credentials)
        
        # 从远程获取分支列表
        remote_branches = await provider.list_branches(project.git_url)
        
        # 更新数据库中的分支信息
        for remote_branch in remote_branches:
            # 查找现有分支
            stmt = select(GitBranch).where(
                GitBranch.repository_id == project.repository.id,
                GitBranch.name == remote_branch.name
            )
            result = await self.db.execute(stmt)
            existing_branch = result.scalar_one_or_none()
            
            if existing_branch:
                # 更新现有分支
                existing_branch.commit_sha = remote_branch.commit_sha
                existing_branch.commit_message = remote_branch.commit_message
                existing_branch.commit_author = remote_branch.commit_author
                existing_branch.commit_date = remote_branch.commit_date
                existing_branch.last_updated_at = datetime.utcnow()
            else:
                # 创建新分支记录
                new_branch = GitBranch(
                    id=str(uuid.uuid4()),
                    repository_id=project.repository.id,
                    name=remote_branch.name,
                    commit_sha=remote_branch.commit_sha,
                    commit_message=remote_branch.commit_message,
                    commit_author=remote_branch.commit_author,
                    commit_date=remote_branch.commit_date,
                    is_default=remote_branch.is_default
                )
                self.db.add(new_branch)
        
        await self.db.commit()
        return remote_branches
    
    async def create_branch(
        self, 
        project_id: str, 
        user_id: str,
        branch_name: str,
        from_branch: str = None
    ) -> bool:
        """创建新分支"""
        # 检查权限
        if not await self._check_project_permission(project_id, user_id, "developer"):
            raise PermissionError("Insufficient permissions")
        
        # 本地创建分支
        success = await self.git_service.create_branch(
            project_id, branch_name, from_branch
        )
        
        if success:
            # 推送到远程
            push_success = await self.git_service.push_changes(project_id, branch_name)
            if push_success:
                # 同步分支信息
                await self.sync_branches(project_id)
                return True
        
        return False
    
    async def delete_branch(
        self, 
        project_id: str, 
        user_id: str,
        branch_name: str
    ) -> bool:
        """删除分支"""
        # 检查权限
        if not await self._check_project_permission(project_id, user_id, "admin"):
            raise PermissionError("Insufficient permissions")
        
        # 检查是否为默认分支
        stmt = select(GitBranch).where(
            GitBranch.repository_id.in_(
                select(ProjectRepository.id).where(
                    ProjectRepository.project_id == project_id
                )
            ),
            GitBranch.name == branch_name
        )
        
        result = await self.db.execute(stmt)
        branch = result.scalar_one_or_none()
        
        if branch and branch.is_default:
            raise ValueError("Cannot delete default branch")
        
        # 删除本地分支
        success = await self.git_service.delete_branch(project_id, branch_name)
        
        if success and branch:
            # 删除数据库记录
            await self.db.delete(branch)
            await self.db.commit()
            
        return success
```

## 5. 权限管理

### 5.1 项目角色定义

```python
PROJECT_ROLES = {
    "owner": {
        "name": "项目所有者",
        "permissions": [
            "project:read", "project:write", "project:delete",
            "member:invite", "member:remove", "member:manage",
            "branch:create", "branch:delete", "branch:protect",
            "credential:manage", "config:manage", "secret:manage"
        ]
    },
    "admin": {
        "name": "项目管理员", 
        "permissions": [
            "project:read", "project:write",
            "member:invite", "member:remove",
            "branch:create", "branch:delete",
            "credential:read", "config:manage", "secret:read"
        ]
    },
    "developer": {
        "name": "开发者",
        "permissions": [
            "project:read", "project:write",
            "branch:create", "task:execute",
            "config:read", "secret:read"
        ]
    },
    "viewer": {
        "name": "查看者",
        "permissions": [
            "project:read", "task:read"
        ]
    }
}
```

### 5.2 成员管理服务

```python
class ProjectMemberService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.notification_service = NotificationService()
    
    async def invite_member(
        self, 
        project_id: str, 
        inviter_id: str,
        invitee_email: str,
        role: str = "developer"
    ) -> ProjectMember:
        """邀请项目成员"""
        # 检查邀请者权限
        if not await self._check_project_permission(project_id, inviter_id, "admin"):
            raise PermissionError("Insufficient permissions to invite members")
        
        # 查找被邀请用户
        user_stmt = select(User).where(User.email == invitee_email)
        user_result = await self.db.execute(user_stmt)
        invitee = user_result.scalar_one_or_none()
        
        if not invitee:
            raise ValueError("User not found")
        
        # 检查是否已经是成员
        existing_stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == invitee.id
        )
        existing_result = await self.db.execute(existing_stmt)
        existing_member = existing_result.scalar_one_or_none()
        
        if existing_member:
            if existing_member.status == "active":
                raise ValueError("User is already a project member")
            else:
                # 重新激活成员
                existing_member.status = "pending"
                existing_member.role = role
                existing_member.invited_by = inviter_id
                existing_member.invited_at = datetime.utcnow()
                await self.db.commit()
                
                member = existing_member
        else:
            # 创建新的成员邀请
            member = ProjectMember(
                id=str(uuid.uuid4()),
                project_id=project_id,
                user_id=invitee.id,
                role=role,
                invited_by=inviter_id,
                status="pending"
            )
            
            self.db.add(member)
            await self.db.commit()
        
        # 发送邀请通知
        await self.notification_service.send_project_invitation(
            invitee.id, project_id, inviter_id, role
        )
        
        return member
    
    async def accept_invitation(self, project_id: str, user_id: str) -> bool:
        """接受项目邀请"""
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == "pending"
        )
        
        result = await self.db.execute(stmt)
        member = result.scalar_one_or_none()
        
        if not member:
            raise ValueError("No pending invitation found")
        
        member.status = "active"
        member.joined_at = datetime.utcnow()
        
        # 更新项目成员数量
        project_stmt = (
            update(Project)
            .where(Project.id == project_id)
            .values(member_count=Project.member_count + 1)
        )
        await self.db.execute(project_stmt)
        
        await self.db.commit()
        return True
    
    async def remove_member(
        self, 
        project_id: str, 
        remover_id: str,
        member_id: str
    ) -> bool:
        """移除项目成员"""
        # 检查权限
        if not await self._check_project_permission(project_id, remover_id, "admin"):
            raise PermissionError("Insufficient permissions")
        
        # 不能移除项目所有者
        member_stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_id
        )
        
        result = await self.db.execute(member_stmt)
        member = result.scalar_one_or_none()
        
        if not member:
            raise ValueError("Member not found")
        
        if member.role == "owner":
            raise ValueError("Cannot remove project owner")
        
        # 删除成员
        await self.db.delete(member)
        
        # 更新项目成员数量
        project_stmt = (
            update(Project)
            .where(Project.id == project_id)
            .values(member_count=Project.member_count - 1)
        )
        await self.db.execute(project_stmt)
        
        await self.db.commit()
        return True
    
    async def update_member_role(
        self, 
        project_id: str, 
        updater_id: str,
        member_id: str,
        new_role: str
    ) -> bool:
        """更新成员角色"""
        # 检查权限（仅所有者可以修改角色）
        if not await self._check_project_permission(project_id, updater_id, "owner"):
            raise PermissionError("Only project owner can update member roles")
        
        # 不能修改所有者角色
        if member_id == updater_id:
            raise ValueError("Cannot change own role")
        
        stmt = (
            update(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == member_id
            )
            .values(role=new_role, updated_at=datetime.utcnow())
        )
        
        await self.db.execute(stmt)
        await self.db.commit()
        return True
```

## 6. 密钥和配置管理

### 6.1 加密服务

```python
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os

class EncryptionService:
    def __init__(self, master_key: str = None):
        self.master_key = master_key or os.getenv("ENCRYPTION_MASTER_KEY")
        if not self.master_key:
            raise ValueError("Encryption master key not provided")
        
        self.cipher_suite = self._create_cipher_suite()
    
    def _create_cipher_suite(self) -> Fernet:
        """创建加密套件"""
        # 使用PBKDF2派生密钥
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'salt_',  # 生产环境应使用随机salt
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.master_key.encode()))
        return Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """加密文本"""
        encrypted_data = self.cipher_suite.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(encrypted_data).decode()
    
    def decrypt(self, encrypted_text: str) -> str:
        """解密文本"""
        encrypted_data = base64.urlsafe_b64decode(encrypted_text.encode())
        decrypted_data = self.cipher_suite.decrypt(encrypted_data)
        return decrypted_data.decode()
```

### 6.2 项目密钥管理

```python
class ProjectSecretService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.encryption_service = EncryptionService()
    
    async def set_secret(
        self, 
        project_id: str, 
        user_id: str,
        key_name: str,
        value: str,
        description: str = None,
        access_level: str = "admin"
    ) -> ProjectSecret:
        """设置项目密钥"""
        # 检查权限
        required_permission = "admin" if access_level == "admin" else "owner"
        if not await self._check_project_permission(project_id, user_id, required_permission):
            raise PermissionError("Insufficient permissions")
        
        # 加密值
        encrypted_value = self.encryption_service.encrypt(value)
        
        # 查找现有密钥
        stmt = select(ProjectSecret).where(
            ProjectSecret.project_id == project_id,
            ProjectSecret.key_name == key_name
        )
        
        result = await self.db.execute(stmt)
        existing_secret = result.scalar_one_or_none()
        
        if existing_secret:
            # 更新现有密钥
            existing_secret.encrypted_value = encrypted_value
            existing_secret.description = description
            existing_secret.access_level = access_level
            existing_secret.updated_at = datetime.utcnow()
            secret = existing_secret
        else:
            # 创建新密钥
            secret = ProjectSecret(
                id=str(uuid.uuid4()),
                project_id=project_id,
                key_name=key_name,
                encrypted_value=encrypted_value,
                description=description,
                access_level=access_level,
                created_by=user_id
            )
            self.db.add(secret)
        
        await self.db.commit()
        return secret
    
    async def get_secret(
        self, 
        project_id: str, 
        user_id: str,
        key_name: str
    ) -> Optional[str]:
        """获取项目密钥值"""
        # 获取用户在项目中的角色
        user_role = await self._get_user_project_role(project_id, user_id)
        if not user_role:
            raise PermissionError("Not a project member")
        
        # 查找密钥
        stmt = select(ProjectSecret).where(
            ProjectSecret.project_id == project_id,
            ProjectSecret.key_name == key_name
        )
        
        result = await self.db.execute(stmt)
        secret = result.scalar_one_or_none()
        
        if not secret:
            return None
        
        # 检查访问权限
        if not self._check_secret_access(user_role, secret.access_level):
            raise PermissionError("Insufficient access level")
        
        # 解密并返回值
        return self.encryption_service.decrypt(secret.encrypted_value)
    
    async def list_secrets(
        self, 
        project_id: str, 
        user_id: str
    ) -> List[Dict]:
        """列出项目密钥（不包含值）"""
        user_role = await self._get_user_project_role(project_id, user_id)
        if not user_role:
            raise PermissionError("Not a project member")
        
        stmt = select(ProjectSecret).where(
            ProjectSecret.project_id == project_id
        )
        
        result = await self.db.execute(stmt)
        secrets = result.scalars().all()
        
        # 过滤用户可访问的密钥
        accessible_secrets = []
        for secret in secrets:
            if self._check_secret_access(user_role, secret.access_level):
                accessible_secrets.append({
                    "key_name": secret.key_name,
                    "description": secret.description,
                    "access_level": secret.access_level,
                    "created_at": secret.created_at,
                    "updated_at": secret.updated_at
                })
        
        return accessible_secrets
    
    def _check_secret_access(self, user_role: str, secret_access_level: str) -> bool:
        """检查密钥访问权限"""
        role_hierarchy = {
            "viewer": 0,
            "developer": 1, 
            "admin": 2,
            "owner": 3
        }
        
        access_hierarchy = {
            "developer": 1,
            "admin": 2,
            "owner": 3
        }
        
        user_level = role_hierarchy.get(user_role, 0)
        required_level = access_hierarchy.get(secret_access_level, 3)
        
        return user_level >= required_level
```

## 7. API接口设计

### 7.1 项目管理接口

```yaml
# 创建项目
POST /api/v1/projects:
  summary: 创建新项目
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            name:
              type: string
              maxLength: 100
            description:
              type: string
            git_url:
              type: string
              format: uri
            git_credentials:
              type: object
              properties:
                type:
                  type: string
                  enum: [ssh_key, personal_token, oauth]
                data:
                  type: object
            config:
              type: object
          required:
            - name
            - git_url

# 获取项目列表
GET /api/v1/projects:
  summary: 获取用户项目列表
  security:
    - BearerAuth: []
  parameters:
    - name: page
      in: query
      schema:
        type: integer
        default: 1
    - name: size
      in: query
      schema:
        type: integer
        default: 20
    - name: status
      in: query
      schema:
        type: string
        enum: [active, archived]
        default: active

# 获取项目详情
GET /api/v1/projects/{project_id}:
  summary: 获取项目详细信息
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string

# 更新项目
PUT /api/v1/projects/{project_id}:
  summary: 更新项目信息
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            name:
              type: string
            description:
              type: string
            config:
              type: object

# 删除项目
DELETE /api/v1/projects/{project_id}:
  summary: 删除项目
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
```

### 7.2 Git集成接口

```yaml
# 同步分支信息
POST /api/v1/projects/{project_id}/git/sync:
  summary: 同步Git分支信息
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string

# 获取分支列表
GET /api/v1/projects/{project_id}/branches:
  summary: 获取项目分支列表
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string

# 创建分支
POST /api/v1/projects/{project_id}/branches:
  summary: 创建新分支
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            name:
              type: string
            from_branch:
              type: string
          required:
            - name

# 删除分支
DELETE /api/v1/projects/{project_id}/branches/{branch_name}:
  summary: 删除分支
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
    - name: branch_name
      in: path
      required: true
      schema:
        type: string

# 获取Git状态
GET /api/v1/projects/{project_id}/git/status:
  summary: 获取Git仓库状态
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
```

### 7.3 成员管理接口

```yaml
# 邀请成员
POST /api/v1/projects/{project_id}/members:
  summary: 邀请项目成员
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            email:
              type: string
              format: email
            role:
              type: string
              enum: [admin, developer, viewer]
              default: developer
          required:
            - email

# 获取成员列表
GET /api/v1/projects/{project_id}/members:
  summary: 获取项目成员列表
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string

# 更新成员角色
PUT /api/v1/projects/{project_id}/members/{user_id}:
  summary: 更新成员角色
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
    - name: user_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            role:
              type: string
              enum: [admin, developer, viewer]
          required:
            - role

# 移除成员
DELETE /api/v1/projects/{project_id}/members/{user_id}:
  summary: 移除项目成员
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
    - name: user_id
      in: path
      required: true
      schema:
        type: string
```

这个项目管理和Git集成设计提供了完整的项目生命周期管理，支持多Git平台集成、精细的权限控制和安全的密钥管理。
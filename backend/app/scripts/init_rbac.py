"""
初始化 RBAC 系统：创建默认角色和权限
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.db.database import async_session_maker
from app.models.user import Role, Permission, RolePermission


async def create_default_permissions(db: AsyncSession):
    """创建默认权限"""
    permissions_data = [
        # 用户权限
        {"name": "user:read", "display_name": "查看用户", "description": "查看用户信息", "resource": "user", "action": "read"},
        {"name": "user:write", "display_name": "编辑用户", "description": "编辑用户信息", "resource": "user", "action": "write"},
        {"name": "user:delete", "display_name": "删除用户", "description": "删除用户", "resource": "user", "action": "delete"},
        {"name": "user:manage", "display_name": "管理用户", "description": "完全管理用户", "resource": "user", "action": "manage"},
        
        # 项目权限
        {"name": "project:read", "display_name": "查看项目", "description": "查看项目信息", "resource": "project", "action": "read"},
        {"name": "project:write", "display_name": "编辑项目", "description": "创建和编辑项目", "resource": "project", "action": "write"},
        {"name": "project:delete", "display_name": "删除项目", "description": "删除项目", "resource": "project", "action": "delete"},
        {"name": "project:manage", "display_name": "管理项目", "description": "完全管理项目", "resource": "project", "action": "manage"},
        
        # 任务权限
        {"name": "task:read", "display_name": "查看任务", "description": "查看任务信息", "resource": "task", "action": "read"},
        {"name": "task:write", "display_name": "编辑任务", "description": "创建和编辑任务", "resource": "task", "action": "write"},
        {"name": "task:delete", "display_name": "删除任务", "description": "删除任务", "resource": "task", "action": "delete"},
        {"name": "task:execute", "display_name": "执行任务", "description": "执行和停止任务", "resource": "task", "action": "execute"},
        {"name": "task:manage", "display_name": "管理任务", "description": "完全管理任务", "resource": "task", "action": "manage"},
        
        # 系统权限
        {"name": "system:read", "display_name": "系统查看", "description": "查看系统信息", "resource": "system", "action": "read"},
        {"name": "system:manage", "display_name": "系统管理", "description": "系统管理权限", "resource": "system", "action": "manage"},
        
        # 通知权限
        {"name": "notification:read", "display_name": "查看通知", "description": "查看通知", "resource": "notification", "action": "read"},
        {"name": "notification:write", "display_name": "发送通知", "description": "发送通知", "resource": "notification", "action": "write"},
        {"name": "notification:manage", "display_name": "管理通知", "description": "完全管理通知", "resource": "notification", "action": "manage"},
    ]
    
    created_permissions = []
    
    for perm_data in permissions_data:
        # 检查权限是否已存在
        stmt = select(Permission).where(Permission.name == perm_data["name"])
        result = await db.execute(stmt)
        existing_perm = result.scalar_one_or_none()
        
        if not existing_perm:
            permission = Permission(**perm_data)
            db.add(permission)
            created_permissions.append(perm_data["name"])
            print(f"Created permission: {perm_data['name']}")
        else:
            print(f"Permission already exists: {perm_data['name']}")
    
    await db.commit()
    return created_permissions


async def create_default_roles(db: AsyncSession):
    """创建默认角色"""
    roles_data = [
        {
            "name": "admin",
            "display_name": "系统管理员",
            "description": "拥有所有系统权限的管理员角色"
        },
        {
            "name": "user",
            "display_name": "普通用户",
            "description": "普通用户角色，拥有基本的项目和任务权限"
        },
        {
            "name": "viewer",
            "display_name": "只读用户",
            "description": "只读用户角色，只能查看不能修改"
        }
    ]
    
    created_roles = []
    
    for role_data in roles_data:
        # 检查角色是否已存在
        stmt = select(Role).where(Role.name == role_data["name"])
        result = await db.execute(stmt)
        existing_role = result.scalar_one_or_none()
        
        if not existing_role:
            role = Role(**role_data)
            db.add(role)
            created_roles.append(role_data["name"])
            print(f"Created role: {role_data['name']}")
        else:
            print(f"Role already exists: {role_data['name']}")
    
    await db.commit()
    return created_roles


async def assign_permissions_to_roles(db: AsyncSession):
    """为角色分配权限"""
    role_permissions = {
        "admin": [
            # 管理员拥有所有权限
            "user:read", "user:write", "user:delete", "user:manage",
            "project:read", "project:write", "project:delete", "project:manage",
            "task:read", "task:write", "task:delete", "task:execute", "task:manage",
            "system:read", "system:manage",
            "notification:read", "notification:write", "notification:manage"
        ],
        "user": [
            # 普通用户权限
            "user:read",  # 只能查看自己的信息
            "project:read", "project:write", "project:delete",
            "task:read", "task:write", "task:delete", "task:execute",
            "notification:read"
        ],
        "viewer": [
            # 只读用户权限
            "user:read",
            "project:read",
            "task:read",
            "notification:read"
        ]
    }
    
    # 获取所有角色
    stmt = select(Role)
    result = await db.execute(stmt)
    roles = {role.name: role for role in result.scalars().all()}
    
    # 获取所有权限
    stmt = select(Permission)
    result = await db.execute(stmt)
    permissions = {perm.name: perm for perm in result.scalars().all()}
    
    # 分配权限
    for role_name, perm_names in role_permissions.items():
        if role_name not in roles:
            print(f"Role not found: {role_name}")
            continue
            
        role = roles[role_name]
        
        # 获取角色现有权限
        stmt = select(RolePermission).where(RolePermission.role_id == role.id)
        result = await db.execute(stmt)
        existing_role_perms = {rp.permission_id for rp in result.scalars().all()}
        
        for perm_name in perm_names:
            if perm_name not in permissions:
                print(f"Permission not found: {perm_name}")
                continue
                
            permission = permissions[perm_name]
            
            # 检查权限是否已分配给角色
            if permission.id not in existing_role_perms:
                role_permission = RolePermission(
                    role_id=role.id,
                    permission_id=permission.id
                )
                db.add(role_permission)
                print(f"Assigned permission '{perm_name}' to role '{role_name}'")
            else:
                print(f"Permission '{perm_name}' already assigned to role '{role_name}'")
    
    await db.commit()


async def init_rbac_system():
    """初始化 RBAC 系统"""
    print("Starting RBAC system initialization...")
    
    async with async_session_maker() as db:
        try:
            # 1. 创建默认权限
            print("\n1. Creating default permissions...")
            await create_default_permissions(db)
            
            # 2. 创建默认角色
            print("\n2. Creating default roles...")
            await create_default_roles(db)
            
            # 3. 为角色分配权限
            print("\n3. Assigning permissions to roles...")
            await assign_permissions_to_roles(db)
            
            print("\n✅ RBAC system initialization completed successfully!")
            
        except Exception as e:
            print(f"\n❌ Error during RBAC initialization: {e}")
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(init_rbac_system())
#!/bin/bash

# Claude Web 项目初始化脚本
set -e

echo "🚀 开始初始化 Claude Web 项目..."

# 检查必要工具
command -v conda >/dev/null 2>&1 || { echo "❌ 需要安装 conda"; exit 1; }
command -v nvm >/dev/null 2>&1 || { echo "❌ 需要安装 nvm"; exit 1; }
command -v mysql >/dev/null 2>&1 || { echo "❌ 需要安装 mysql client"; exit 1; }

echo "📦 创建 Python 环境..."
conda env create -f environment.yml -y || conda env update -f environment.yml -y
conda activate claude-web

echo "📦 设置 Node.js 版本..."
nvm install
nvm use

echo "🗄️  检查数据库连接..."
mysql -h127.0.0.1 -uroot -P13306 -pPa88word -e "SELECT 1" >/dev/null 2>&1 || {
    echo "❌ 无法连接到数据库 mysql://root@127.0.0.1:13306"
    echo "请确保 MySQL 服务正在运行，用户名:root，密码:Pa88word，端口:13306"
    exit 1
}

echo "🗄️  创建数据库..."
mysql -h127.0.0.1 -uroot -P13306 -pPa88word -e "CREATE DATABASE IF NOT EXISTS claude_web;"
mysql -h127.0.0.1 -uroot -P13306 -pPa88word -e "CREATE DATABASE IF NOT EXISTS claude_web_test;"

echo "🔧 安装后端依赖..."
cd backend
cp .env.example .env
pip install -r requirements.txt

echo "🔄 运行数据库迁移..."
alembic upgrade head

echo "🧪 运行后端测试..."
pytest -v

cd ../frontend

echo "🔧 安装前端依赖..."
npm install

echo "🔍 安装代码规范工具..."
cd ..
pip install pre-commit
pre-commit install

echo "✅ 项目初始化完成!"
echo ""
echo "🎯 接下来可以运行:"
echo "   后端: cd backend && uvicorn app.main:app --reload"
echo "   前端: cd frontend && npm run dev"
echo "   测试: cd backend && pytest"
echo ""
echo "🌐 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端API: http://localhost:8000"
echo "   API文档: http://localhost:8000/docs"
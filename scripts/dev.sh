#!/bin/bash

# 开发环境启动脚本
set -e

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

echo "🚀 启动开发环境..."

# 启动数据库
echo "🗄️  启动数据库服务..."
docker-compose up -d mysql

# 等待数据库启动
echo "⏳ 等待数据库启动..."
sleep 10

# 激活conda环境并启动后端
echo "🔧 启动后端服务..."
cd backend
conda activate claude-web 2>/dev/null || echo "请手动激活conda环境: conda activate claude-web"

# 后台启动后端
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# 启动前端
echo "🎨 启动前端服务..."
cd frontend
nvm use 2>/dev/null || echo "请手动设置Node版本: nvm use"

# 后台启动前端
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ 开发环境已启动!"
echo ""
echo "🌐 服务地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:8000"
echo "   API文档: http://localhost:8000/docs"
echo ""
echo "⏹️  按 Ctrl+C 停止所有服务"

# 捕获中断信号，清理后台进程
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker-compose down; exit' INT

# 等待用户中断
wait
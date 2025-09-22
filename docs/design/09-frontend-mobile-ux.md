# 设计文档 09: 前端UI/UX和移动端适配

## 概述

本文档设计了Claude Web应用的前端用户界面和移动端体验，重点关注移动优先的设计理念，提供直观、高效的Claude CLI远程控制体验。

## 目录
1. [设计理念和原则](#设计理念和原则)
2. [信息架构设计](#信息架构设计)
3. [移动端界面设计](#移动端界面设计)
4. [响应式设计策略](#响应式设计策略)
5. [交互设计模式](#交互设计模式)
6. [组件系统设计](#组件系统设计)
7. [性能优化策略](#性能优化策略)
8. [可访问性设计](#可访问性设计)
9. [多主题系统](#多主题系统)

## 设计理念和原则

### 核心设计理念

1. **移动优先**: 从移动端开始设计，逐步增强至桌面端
2. **任务导向**: 围绕用户核心任务设计界面流程
3. **实时反馈**: 提供即时的操作状态和结果反馈
4. **简约高效**: 减少认知负荷，突出重要信息
5. **渐进增强**: 基础功能优先，高级功能渐进增强

### 设计原则

```typescript
// src/design-system/principles.ts
export const DesignPrinciples = {
  // 移动优先原则
  MOBILE_FIRST: {
    breakpoints: {
      mobile: '320px',
      tablet: '768px', 
      desktop: '1024px',
      wide: '1440px'
    },
    touchTargets: {
      minimum: '44px',
      recommended: '48px',
      comfortable: '56px'
    }
  },
  
  // 视觉层次原则  
  VISUAL_HIERARCHY: {
    typography: {
      h1: { size: '2rem', weight: '700', lineHeight: '1.2' },
      h2: { size: '1.5rem', weight: '600', lineHeight: '1.3' },
      h3: { size: '1.25rem', weight: '500', lineHeight: '1.4' },
      body: { size: '1rem', weight: '400', lineHeight: '1.6' },
      small: { size: '0.875rem', weight: '400', lineHeight: '1.5' }
    },
    spacing: {
      xs: '0.25rem',
      sm: '0.5rem', 
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem'
    }
  },
  
  // 颜色系统原则
  COLOR_SYSTEM: {
    semantic: {
      primary: '#007AFF',
      success: '#34C759', 
      warning: '#FF9500',
      error: '#FF3B30',
      neutral: '#8E8E93'
    },
    accessibility: {
      minContrast: 4.5,
      preferredContrast: 7.0
    }
  }
} as const;
```

## 信息架构设计

### 应用导航结构

```typescript
// src/types/navigation.ts
export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: NavigationItem[];
}

export const navigationStructure: NavigationItem[] = [
  {
    id: 'dashboard',
    label: '工作台',
    icon: 'home',
    route: '/dashboard'
  },
  {
    id: 'projects',
    label: '项目',
    icon: 'folder',
    route: '/projects',
    children: [
      {
        id: 'my-projects',
        label: '我的项目',
        icon: 'user-folder',
        route: '/projects/my'
      },
      {
        id: 'shared-projects',
        label: '共享项目', 
        icon: 'users',
        route: '/projects/shared'
      }
    ]
  },
  {
    id: 'terminal',
    label: '终端',
    icon: 'terminal',
    route: '/terminal'
  },
  {
    id: 'tasks',
    label: '任务',
    icon: 'list-checks',
    route: '/tasks',
    badge: 3
  },
  {
    id: 'notifications',
    label: '通知',
    icon: 'bell',
    route: '/notifications',
    badge: 5
  },
  {
    id: 'settings',
    label: '设置',
    icon: 'settings',
    route: '/settings'
  }
];
```

### 页面布局架构

```tsx
// src/layouts/AppLayout.tsx
import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MobileNavigation } from '@/components/navigation/MobileNavigation';
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar';
import { TopBar } from '@/components/navigation/TopBar';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <div className="flex h-screen bg-background">
      {/* 桌面端侧边栏 */}
      {!isMobile && (
        <DesktopSidebar className="w-64 border-r border-border" />
      )}
      
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <TopBar />
        
        {/* 页面内容 */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
        
        {/* 移动端底部导航 */}
        {isMobile && (
          <MobileNavigation className="border-t border-border" />
        )}
      </div>
    </div>
  );
};
```

## 移动端界面设计

### 移动端专用组件

```tsx
// src/components/mobile/MobileTerminal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MobileTerminalProps {
  projectId: string;
  onCommand: (command: string) => void;
}

export const MobileTerminal: React.FC<MobileTerminalProps> = ({
  projectId,
  onCommand
}) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 常用命令快捷按钮
  const quickCommands = [
    { label: 'ls', command: 'ls -la' },
    { label: 'Status', command: 'git status' },
    { label: 'Pull', command: 'git pull' },
    { label: 'Test', command: 'npm test' },
    { label: 'Build', command: 'npm run build' }
  ];
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      onCommand(command);
      setHistory(prev => [...prev, command]);
      setCommand('');
    }
  };
  
  return (
    <Card className="bg-black text-green-400 font-mono">
      {/* 终端头部 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-green-400"
        >
          {isExpanded ? '收起' : '展开'}
        </Button>
      </div>
      
      {/* 终端内容区 */}
      <div className={`transition-all duration-300 ${
        isExpanded ? 'h-96' : 'h-32'
      }`}>
        <ScrollArea className="h-full p-3">
          {/* 终端输出历史 */}
          <div className="space-y-1 text-sm">
            {history.map((cmd, index) => (
              <div key={index} className="opacity-70">
                <span className="text-blue-400">$</span> {cmd}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      
      {/* 快捷命令按钮 */}
      <div className="flex flex-wrap gap-2 p-3 border-t border-gray-700">
        {quickCommands.map((cmd) => (
          <Button
            key={cmd.label}
            variant="outline"
            size="sm"
            onClick={() => onCommand(cmd.command)}
            className="text-xs bg-gray-800 border-gray-600 text-green-400 
                       hover:bg-gray-700 px-2 py-1"
          >
            {cmd.label}
          </Button>
        ))}
      </div>
      
      {/* 命令输入区 */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
        <div className="flex items-center space-x-2">
          <span className="text-blue-400 text-sm">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="输入命令..."
            className="flex-1 bg-transparent text-green-400 text-sm 
                       placeholder-gray-500 border-none outline-none"
          />
          <Button
            type="submit"
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-black"
          >
            执行
          </Button>
        </div>
      </form>
    </Card>
  );
};
```

### 手势和触摸交互

```tsx
// src/hooks/useGestures.ts
import { useGesture } from '@use-gesture/react';
import { useSpring, config } from '@react-spring/web';

export const useSwipeGestures = (onSwipe: (direction: string) => void) => {
  const [{ x, y }, api] = useSpring(() => ({ x: 0, y: 0 }));
  
  const bind = useGesture({
    onDrag: ({ offset: [ox, oy], velocity: [vx, vy], direction: [dx, dy], down }) => {
      // 实时更新位置
      api.start({ x: ox, y: oy, immediate: down });
      
      // 释放时检查是否达到滑动阈值
      if (!down) {
        const threshold = 100;
        const velocityThreshold = 0.5;
        
        if (Math.abs(ox) > threshold || Math.abs(vx) > velocityThreshold) {
          if (dx > 0) onSwipe('right');
          else onSwipe('left');
        }
        
        if (Math.abs(oy) > threshold || Math.abs(vy) > velocityThreshold) {
          if (dy > 0) onSwipe('down');
          else onSwipe('up');
        }
        
        // 重置位置
        api.start({ x: 0, y: 0, config: config.wobbly });
      }
    }
  });
  
  return { bind, style: { x, y } };
};

// src/components/mobile/SwipeableCard.tsx
import { animated } from '@react-spring/web';
import { useSwipeGestures } from '@/hooks/useGestures';

interface SwipeableCardProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  children: React.ReactNode;
}

export const SwipeableCard: React.FC<SwipeableCardProps> = ({
  onSwipeLeft,
  onSwipeRight,
  children
}) => {
  const handleSwipe = (direction: string) => {
    if (direction === 'left' && onSwipeLeft) onSwipeLeft();
    if (direction === 'right' && onSwipeRight) onSwipeRight();
  };
  
  const { bind, style } = useSwipeGestures(handleSwipe);
  
  return (
    <animated.div
      {...bind()}
      style={style}
      className="touch-pan-y select-none"
    >
      {children}
    </animated.div>
  );
};
```

### 移动端专用布局

```tsx
// src/components/mobile/MobileDashboard.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const MobileDashboard: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* 状态概览卡片 */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">活跃项目</p>
                <p className="text-2xl font-bold">5</p>
              </div>
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">📁</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">运行任务</p>
                <p className="text-2xl font-bold">3</p>
              </div>
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">⚡</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* 最近项目 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            最近项目
            <Badge variant="secondary">5</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-64">
            <div className="space-y-0">
              {[1, 2, 3, 4, 5].map((project) => (
                <div
                  key={project}
                  className="flex items-center space-x-3 p-4 hover:bg-muted/50 
                           border-b border-border last:border-b-0"
                >
                  <div className="w-10 h-10 bg-primary/10 rounded-lg 
                                flex items-center justify-center">
                    <span className="text-primary font-medium">P{project}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">Project {project}</p>
                    <p className="text-sm text-muted-foreground">
                      最后活动: 2小时前
                    </p>
                  </div>
                  <Badge 
                    variant={project % 2 === 0 ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {project % 2 === 0 ? '运行中' : '空闲'}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      
      {/* 快捷操作 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '➕', label: '新建项目', color: 'bg-blue-500' },
              { icon: '📋', label: '导入项目', color: 'bg-green-500' },
              { icon: '⚙️', label: '系统设置', color: 'bg-gray-500' }
            ].map((action, index) => (
              <div
                key={index}
                className="flex flex-col items-center space-y-2 p-3 
                         rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className={`w-12 h-12 ${action.color} rounded-lg 
                              flex items-center justify-center text-white text-lg`}>
                  {action.icon}
                </div>
                <span className="text-xs text-center font-medium">
                  {action.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

## 响应式设计策略

### 断点系统和媒体查询

```typescript
// src/styles/breakpoints.ts
export const breakpoints = {
  xs: '320px',   // 小屏手机
  sm: '640px',   // 大屏手机 
  md: '768px',   // 平板
  lg: '1024px',  // 桌面
  xl: '1280px',  // 大屏桌面
  '2xl': '1536px' // 超大屏
} as const;

export const mediaQueries = {
  mobile: `(max-width: ${breakpoints.md})`,
  tablet: `(min-width: ${breakpoints.md}) and (max-width: ${breakpoints.lg})`,
  desktop: `(min-width: ${breakpoints.lg})`,
  touch: '(hover: none) and (pointer: coarse)',
  mouse: '(hover: hover) and (pointer: fine)'
} as const;
```

### 自适应组件设计

```tsx
// src/components/responsive/ResponsiveGrid.tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: {
    mobile: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  className,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 'md'
}) => {
  const gridClasses = cn(
    'grid',
    {
      // 移动端列数
      'grid-cols-1': cols.mobile === 1,
      'grid-cols-2': cols.mobile === 2,
      'grid-cols-3': cols.mobile === 3,
      
      // 平板端列数
      'md:grid-cols-1': cols.tablet === 1,
      'md:grid-cols-2': cols.tablet === 2,
      'md:grid-cols-3': cols.tablet === 3,
      'md:grid-cols-4': cols.tablet === 4,
      
      // 桌面端列数
      'lg:grid-cols-1': cols.desktop === 1,
      'lg:grid-cols-2': cols.desktop === 2,
      'lg:grid-cols-3': cols.desktop === 3,
      'lg:grid-cols-4': cols.desktop === 4,
      'lg:grid-cols-5': cols.desktop === 5,
      
      // 间距
      'gap-2': gap === 'sm',
      'gap-4': gap === 'md',
      'gap-6': gap === 'lg'
    },
    className
  );
  
  return (
    <div className={gridClasses}>
      {children}
    </div>
  );
};

// src/components/responsive/AdaptiveLayout.tsx
import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface AdaptiveLayoutProps {
  mobileLayout: React.ComponentType<any>;
  desktopLayout: React.ComponentType<any>;
  breakpoint?: string;
  [key: string]: any;
}

export const AdaptiveLayout: React.FC<AdaptiveLayoutProps> = ({
  mobileLayout: MobileLayout,
  desktopLayout: DesktopLayout,
  breakpoint = '(max-width: 768px)',
  ...props
}) => {
  const isMobile = useMediaQuery(breakpoint);
  
  return isMobile ? 
    <MobileLayout {...props} /> : 
    <DesktopLayout {...props} />;
};
```

## 交互设计模式

### 模态框和抽屉设计

```tsx
// src/components/ui/adaptive-modal.tsx
import React from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

interface AdaptiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
}

export const AdaptiveModal: React.FC<AdaptiveModalProps> = ({
  open,
  onOpenChange,
  children,
  title
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <div className="p-4 overflow-auto">
            {title && (
              <h2 className="text-lg font-semibold mb-4">{title}</h2>
            )}
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {title && (
          <h2 className="text-lg font-semibold mb-4">{title}</h2>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
};
```

### 上下文菜单和动作面板

```tsx
// src/components/mobile/ActionSheet.tsx
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface ActionSheetItem {
  label: string;
  icon?: string;
  action: () => void;
  variant?: 'default' | 'destructive';
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
  title?: string;
}

export const ActionSheet: React.FC<ActionSheetProps> = ({
  open,
  onClose,
  items,
  title
}) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />
          
          {/* 动作面板 */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-background 
                       rounded-t-2xl shadow-2xl z-50 max-h-[80vh] overflow-hidden"
          >
            <div className="p-4">
              {/* 拖拽指示器 */}
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full 
                            mx-auto mb-4" />
              
              {/* 标题 */}
              {title && (
                <h3 className="text-lg font-medium text-center mb-4">
                  {title}
                </h3>
              )}
              
              {/* 动作列表 */}
              <div className="space-y-2">
                {items.map((item, index) => (
                  <Button
                    key={index}
                    variant={item.variant === 'destructive' ? 'destructive' : 'ghost'}
                    className="w-full justify-start text-left h-14 text-base"
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                  >
                    {item.icon && (
                      <span className="mr-3 text-lg">{item.icon}</span>
                    )}
                    {item.label}
                  </Button>
                ))}
              </div>
              
              {/* 取消按钮 */}
              <Button
                variant="outline"
                className="w-full mt-4 h-12"
                onClick={onClose}
              >
                取消
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
```

### 触摸反馈和动画

```tsx
// src/components/ui/touch-feedback.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface TouchFeedbackProps {
  children: React.ReactNode;
  onTap?: () => void;
  disabled?: boolean;
  haptic?: boolean;
}

export const TouchFeedback: React.FC<TouchFeedbackProps> = ({
  children,
  onTap,
  disabled = false,
  haptic = false
}) => {
  const [isPressed, setIsPressed] = useState(false);
  
  const handleTapStart = () => {
    if (disabled) return;
    setIsPressed(true);
    
    // 触觉反馈 (iOS Safari 支持)
    if (haptic && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };
  
  const handleTapEnd = () => {
    setIsPressed(false);
    if (onTap && !disabled) {
      onTap();
    }
  };
  
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      animate={{ scale: isPressed ? 0.98 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onTapStart={handleTapStart}
      onTap={handleTapEnd}
      onTapCancel={() => setIsPressed(false)}
      className={`touch-manipulation ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      {children}
    </motion.div>
  );
};

// src/components/ui/pull-to-refresh.tsx
import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, 100], [0, 180]);
  const opacity = useTransform(y, [0, 100], [0, 1]);
  
  const handleDragEnd = async () => {
    if (y.get() > 100 && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        y.set(0);
      }
    } else {
      y.set(0);
    }
  };
  
  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 150 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      style={{ y }}
      className="touch-pan-y overscroll-contain"
    >
      {/* 下拉刷新指示器 */}
      <motion.div
        className="flex justify-center items-center h-16 text-muted-foreground"
        style={{ opacity }}
      >
        <motion.div
          style={{ rotate }}
          className="mr-2"
        >
          ↓
        </motion.div>
        <span className="text-sm">
          {isRefreshing ? '正在刷新...' : '下拉刷新'}
        </span>
      </motion.div>
      
      {children}
    </motion.div>
  );
};
```

## 组件系统设计

### 移动优化组件库

```tsx
// src/components/ui/mobile-optimized/index.ts
export { MobileButton } from './mobile-button';
export { MobileInput } from './mobile-input';
export { MobileSelect } from './mobile-select';
export { MobileCard } from './mobile-card';
export { MobileNavigation } from './mobile-navigation';

// src/components/ui/mobile-optimized/mobile-button.tsx
import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileButtonProps extends ButtonProps {
  fullWidth?: boolean;
  large?: boolean;
}

export const MobileButton: React.FC<MobileButtonProps> = ({
  className,
  fullWidth = false,
  large = false,
  children,
  ...props
}) => {
  return (
    <Button
      className={cn(
        // 基础移动端优化
        'touch-manipulation select-none',
        // 最小触摸目标
        'min-h-[44px] min-w-[44px]',
        // 大按钮样式
        large && 'h-14 text-lg px-8',
        // 全宽按钮
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
};

// src/components/ui/mobile-optimized/mobile-input.tsx
import React from 'react';
import { Input, InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MobileInputProps extends InputProps {
  large?: boolean;
}

export const MobileInput: React.FC<MobileInputProps> = ({
  className,
  large = false,
  ...props
}) => {
  return (
    <Input
      className={cn(
        // 移动端基础样式
        'touch-manipulation',
        // 大输入框
        large ? 'h-14 text-lg px-4' : 'h-12 px-3',
        // 防止缩放
        'text-base',
        className
      )}
      {...props}
    />
  );
};
```

### 主题适配组件

```tsx
// src/components/theme/ThemeProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      
      root.classList.add(systemTheme);
      setResolvedTheme(systemTheme);
    } else {
      root.classList.add(theme);
      setResolvedTheme(theme);
    }
  }, [theme]);
  
  const value = {
    theme,
    setTheme,
    resolvedTheme
  };
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
```

## 性能优化策略

### 代码分割和懒加载

```tsx
// src/routes/index.tsx
import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// 懒加载页面组件
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Projects = lazy(() => import('@/pages/Projects'));
const Terminal = lazy(() => import('@/pages/Terminal'));
const Settings = lazy(() => import('@/pages/Settings'));

// 移动端专用页面
const MobileDashboard = lazy(() => import('@/pages/mobile/Dashboard'));
const MobileProjects = lazy(() => import('@/pages/mobile/Projects'));

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects/*" element={<Projects />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/settings" element={<Settings />} />
        
        {/* 移动端专用路由 */}
        <Route path="/mobile/dashboard" element={<MobileDashboard />} />
        <Route path="/mobile/projects" element={<MobileProjects />} />
      </Routes>
    </Suspense>
  );
};

// src/components/ui/loading-spinner.tsx
import React from 'react';
import { motion } from 'framer-motion';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-64">
      <motion.div
        className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
};
```

### 虚拟滚动和无限加载

```tsx
// src/components/virtualized/VirtualList.tsx
import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight: number;
  height: number;
  onLoadMore?: () => void;
}

export const VirtualList = <T,>({
  items,
  renderItem,
  itemHeight,
  height,
  onLoadMore
}: VirtualListProps<T>) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const ItemRenderer = useMemo(() => {
    return ({ index, style }: { index: number; style: React.CSSProperties }) => {
      // 触发加载更多
      if (onLoadMore && index === items.length - 5) {
        onLoadMore();
      }
      
      return (
        <div style={style}>
          {renderItem(items[index], index)}
        </div>
      );
    };
  }, [items, renderItem, onLoadMore]);
  
  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={isMobile ? itemHeight + 8 : itemHeight} // 移动端增加间距
      overscanCount={isMobile ? 5 : 10} // 移动端减少预渲染数量
    >
      {ItemRenderer}
    </List>
  );
};
```

### 图片优化和懒加载

```tsx
// src/components/ui/optimized-image.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  placeholder?: string;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  className = '',
  placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+PC9zdmc+'
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 占位符 */}
      <motion.div
        className="absolute inset-0 bg-muted animate-pulse"
        animate={{ opacity: isLoaded ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      />
      
      {/* 实际图片 */}
      <motion.img
        src={hasError ? placeholder : src}
        alt={alt}
        width={width}
        height={height}
        className="w-full h-full object-cover"
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
};
```

## 可访问性设计

### 无障碍支持

```tsx
// src/components/accessibility/AccessibilityProvider.tsx
import React, { createContext, useContext, useState } from 'react';

interface AccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  screenReader: boolean;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSetting: <K extends keyof AccessibilitySettings>(
    key: K, 
    value: AccessibilitySettings[K]
  ) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    highContrast: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fontSize: 'medium',
    screenReader: false
  });
  
  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    // 应用设置到根元素
    const root = document.documentElement;
    root.classList.toggle('high-contrast', settings.highContrast);
    root.classList.toggle('reduced-motion', settings.reducedMotion);
    root.classList.toggle('large-text', settings.fontSize === 'large');
  };
  
  return (
    <AccessibilityContext.Provider value={{ settings, updateSetting }}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
};
```

### 键盘导航支持

```tsx
// src/hooks/useKeyboardNavigation.ts
import { useEffect, useCallback } from 'react';

interface KeyboardNavigationOptions {
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onTab?: () => void;
  enabled?: boolean;
}

export const useKeyboardNavigation = ({
  onArrowUp,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  onEnter,
  onEscape,
  onTab,
  enabled = true
}: KeyboardNavigationOptions) => {
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        onArrowUp?.();
        break;
      case 'ArrowDown':
        event.preventDefault();
        onArrowDown?.();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        onArrowLeft?.();
        break;
      case 'ArrowRight':
        event.preventDefault();
        onArrowRight?.();
        break;
      case 'Enter':
        event.preventDefault();
        onEnter?.();
        break;
      case 'Escape':
        event.preventDefault();
        onEscape?.();
        break;
      case 'Tab':
        onTab?.();
        break;
    }
  }, [enabled, onArrowUp, onArrowDown, onArrowLeft, onArrowRight, onEnter, onEscape, onTab]);
  
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);
};
```

## 多主题系统

### 主题配置

```typescript
// src/styles/themes.ts
export const themes = {
  light: {
    colors: {
      primary: 'hsl(221, 83%, 53%)',
      secondary: 'hsl(210, 40%, 95%)',
      accent: 'hsl(221, 83%, 53%)',
      background: 'hsl(0, 0%, 100%)',
      foreground: 'hsl(222, 84%, 5%)',
      muted: 'hsl(210, 40%, 96%)',
      border: 'hsl(214, 32%, 91%)',
      success: 'hsl(142, 76%, 36%)',
      warning: 'hsl(38, 92%, 50%)',
      error: 'hsl(0, 84%, 60%)'
    },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
    }
  },
  
  dark: {
    colors: {
      primary: 'hsl(221, 83%, 53%)',
      secondary: 'hsl(217, 33%, 17%)',
      accent: 'hsl(221, 83%, 53%)',
      background: 'hsl(222, 84%, 5%)',
      foreground: 'hsl(210, 40%, 98%)',
      muted: 'hsl(217, 33%, 17%)',
      border: 'hsl(217, 33%, 17%)',
      success: 'hsl(142, 76%, 36%)',
      warning: 'hsl(38, 92%, 50%)',
      error: 'hsl(0, 84%, 60%)'
    },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.4)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.4)'
    }
  },
  
  mobile: {
    colors: {
      primary: 'hsl(221, 83%, 53%)',
      secondary: 'hsl(210, 40%, 95%)',
      accent: 'hsl(221, 83%, 53%)',
      background: 'hsl(0, 0%, 98%)',
      foreground: 'hsl(222, 84%, 5%)',
      muted: 'hsl(210, 40%, 93%)',
      border: 'hsl(214, 32%, 88%)',
      success: 'hsl(142, 76%, 36%)',
      warning: 'hsl(38, 92%, 50%)',
      error: 'hsl(0, 84%, 60%)'
    },
    shadows: {
      sm: '0 2px 4px 0 rgb(0 0 0 / 0.06)',
      md: '0 6px 8px -2px rgb(0 0 0 / 0.12)',
      lg: '0 12px 16px -4px rgb(0 0 0 / 0.15)'
    }
  }
} as const;

export type ThemeName = keyof typeof themes;
export type Theme = typeof themes.light;
```

### 动态主题切换

```tsx
// src/components/theme/ThemeToggle.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };
  
  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'system':
        return '⚙️';
      default:
        return '☀️';
    }
  };
  
  return (
    <Button
      variant="ghost"
      size={isMobile ? 'lg' : 'sm'}
      onClick={toggleTheme}
      className={isMobile ? 'h-12 w-12' : 'h-8 w-8'}
    >
      <span className="text-lg">{getThemeIcon()}</span>
      <span className="sr-only">切换主题</span>
    </Button>
  );
};
```

## 总结

本设计文档全面覆盖了Claude Web应用的前端UI/UX设计：

1. **移动优先设计**: 从移动端开始，渐进增强到桌面端
2. **响应式架构**: 自适应布局系统和断点管理
3. **触摸优化**: 手势交互、触摸反馈和移动端专用组件
4. **性能优化**: 代码分割、虚拟滚动、懒加载策略
5. **可访问性**: 无障碍支持、键盘导航、屏幕阅读器适配
6. **主题系统**: 多主题支持、动态切换、自适应配色
7. **交互模式**: 模态框、抽屉、动作面板等移动端交互
8. **组件系统**: 移动优化的UI组件库和设计系统

这套设计确保了应用在各种设备上都能提供优秀的用户体验，特别是在移动端的操作便利性和性能表现。
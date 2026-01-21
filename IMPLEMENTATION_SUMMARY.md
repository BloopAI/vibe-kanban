# Vibe Kanban - 退出应用与桌面快捷方式功能实现总结

## 项目信息

**实施日期**: 2026-01-21
**功能**: 退出应用按钮 + 桌面快捷方式创建
**状态**: 代码实现完成，待 Rust 后端编译验证

---

## 功能概述

### 1. 退出应用功能
在前端设置页面添加"退出应用"按钮，点击后通过 API 触发后端优雅关闭应用程序。

### 2. 桌面快捷方式功能
在前端设置页面添加"创建桌面快捷方式"按钮，点击后在用户桌面创建应用快捷方式。
- macOS: 创建 .app bundle
- Windows: 创建 .lnk 快捷方式
- Linux: 创建 .desktop 文件

---

## 文件变更清单

### 新建文件

#### 1. `crates/utils/src/desktop.rs`
**功能**: 跨平台桌面快捷方式创建模块

**主要内容**:
- `DesktopError` 错误类型定义
- `get_desktop_path()` - 获取桌面路径
- `create_desktop_shortcut()` - 创建桌面快捷方式（平台相关）
- `desktop_shortcut_exists()` - 检查快捷方式是否存在

**平台支持**:
```rust
#[cfg(target_os = "macos")]
pub fn create_desktop_shortcut() -> Result<PathBuf>

#[cfg(target_os = "windows")]
pub fn create_desktop_shortcut() -> Result<PathBuf>

#[cfg(target_os = "linux")]
pub fn create_desktop_shortcut() -> Result<PathBuf>
```

#### 2. `crates/server/src/routes/app_management.rs`
**功能**: 应用管理 API 路由处理器

**API 端点**:
- `POST /api/app/exit` - 触发应用退出
- `POST /api/app/desktop-shortcut` - 创建桌面快捷方式
- `GET /api/app/desktop-shortcut-exists` - 检查快捷方式状态

**响应类型**:
```rust
pub struct DesktopShortcutResponse {
    pub success: bool,
    pub message: String,
    pub path: Option<String>,
    pub already_exists: bool,
}
```

### 修改文件

#### 3. `crates/server/src/main.rs`
**变更**: 添加全局关闭通道

```rust
use std::sync::atomic::{AtomicBool, Ordering};

// Global shutdown flag that can be triggered by API
static SHUTDOWN_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Request a graceful shutdown from API
pub fn request_shutdown() {
    SHUTDOWN_REQUESTED.store(true, Ordering::SeqCst);
    tracing::info!("Shutdown requested via API");
}

pub async fn shutdown_signal() {
    // Check for API-triggered shutdown first
    tokio::select! {
        _ = async {
            loop {
                if SHUTDOWN_REQUESTED.load(Ordering::SeqCst) {
                    tracing::info!("API shutdown signal received");
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        } => {},
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("Ctrl+C received");
        }
    }
    // ... Unix SIGTERM handling
}
```

#### 4. `crates/server/src/routes/mod.rs`
**变更**: 添加 app_management 模块和路由

```rust
pub mod app_management;  // 新增

// 在 router() 函数中添加:
.nest("/app", app_management::router())
```

#### 5. `crates/utils/src/lib.rs`
**变更**: 导出 desktop 模块

```rust
pub mod desktop;  // 新增
```

#### 6. `frontend/src/lib/api.ts`
**变更**: 添加 appManagementApi

```typescript
// App Management API
export const appManagementApi = {
  /**
   * Exit the application
   */
  exitApp: async (): Promise<{ message: string }> => {
    const response = await makeRequest('/api/app/exit', {
      method: 'POST',
    });
    return handleApiResponse<{ message: string }>(response);
  },

  /**
   * Create a desktop shortcut
   */
  createDesktopShortcut: async (): Promise<{
    success: boolean;
    message: string;
    path: string | null;
    already_exists: boolean;
  }> => {
    const response = await makeRequest('/api/app/desktop-shortcut', {
      method: 'POST',
    });
    return handleApiResponse<...>(response);
  },

  /**
   * Check if desktop shortcut exists
   */
  desktopShortcutExists: async (): Promise<...> => {
    const response = await makeRequest('/api/app/desktop-shortcut-exists');
    return handleApiResponse<...>(response);
  },
};
```

#### 7. `frontend/src/pages/settings/GeneralSettings.tsx`
**变更**: 添加"应用管理"卡片 UI

**新增内容**:
- 导入 `Power`, `Monitor` 图标和 `appManagementApi`
- 添加状态管理:
  ```typescript
  const [shortcutExists, setShortcutExists] = useState(false);
  const [loadingShortcut, setLoadingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState<string>('');
  ```
- 添加处理函数:
  - `checkShortcutExists()` - 检查快捷方式状态
  - `handleCreateDesktopShortcut()` - 创建快捷方式
  - `handleExitApp()` - 退出应用
- 添加 UI 组件:

```tsx
{/* App Management */}
<Card>
  <CardHeader>
    <CardTitle>{t('settings.general.appManagement.title')}</CardTitle>
    <CardDescription>
      {t('settings.general.appManagement.description')}
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Exit App */}
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">
          {t('settings.general.appManagement.exit.label')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('settings.general.appManagement.exit.helper')}
        </p>
      </div>
      <Button variant="destructive" onClick={handleExitApp}>
        <Power className="mr-2 h-4 w-4" />
        {t('settings.general.appManagement.exit.button')}
      </Button>
    </div>

    {/* Desktop Shortcut */}
    <div className="flex flex-col space-y-3">
      {/* ... UI for desktop shortcut ... */}
    </div>
  </CardContent>
</Card>
```

#### 8. `shared/types.ts`
**变更**: 添加数据存储相关类型

```typescript
export type PathConfigInfo = {
  current_path: string,
  custom_path: string | null,
  default_path: string,
  is_custom: boolean,
};
export type SetCustomPathRequest = {
  custom_path: string,
};
export type SetCustomPathResponse = {
  message: string,
  requires_restart: boolean,
  credentials_warning: boolean,
};
```

### 国际化文件更新

#### 9. `frontend/src/i18n/locales/zh-Hans/settings.json`
```json
{
  "appManagement": {
    "title": "应用管理",
    "description": "管理应用程序相关操作。",
    "exit": {
      "label": "退出应用",
      "helper": "安全退出应用程序。未保存的更改可能会丢失。",
      "button": "退出应用",
      "confirm": "确定要退出应用吗？",
      "errors": {
        "failed": "退出应用失败"
      }
    },
    "desktopShortcut": {
      "label": "桌面快捷方式",
      "helper": "在桌面创建应用快捷方式，方便快速启动。",
      "create": "创建快捷方式",
      "recreate": "重新创建",
      "exists": "已存在",
      "errors": {
        "createFailed": "创建桌面快捷方式失败"
      }
    }
  }
}
```

#### 10. `frontend/src/i18n/locales/zh-Hant/settings.json`
```json
{
  "appManagement": {
    "title": "應用管理",
    "description": "管理應用程式相關操作。",
    "exit": {
      "label": "退出應用",
      "helper": "安全退出應用程式。未儲存的變更可能會遺失。",
      "button": "退出應用",
      "confirm": "確定要退出應用嗎？",
      "errors": {
        "failed": "退出應用失敗"
      }
    },
    "desktopShortcut": {
      "label": "桌面捷徑",
      "helper": "在桌面建立應用捷徑，方便快速啟動。",
      "create": "建立捷徑",
      "recreate": "重新建立",
      "exists": "已存在",
      "errors": {
        "createFailed": "建立桌面捷徑失敗"
      }
    }
  }
}
```

#### 11. `frontend/src/i18n/locales/ja/settings.json`
```json
{
  "appManagement": {
    "title": "アプリ管理",
    "description": "アプリケーション関連の操作を管理します。",
    "exit": {
      "label": "アプリを終了",
      "helper": "アプリケーションを安全に終了します。保存されていない変更は失われる可能性があります。",
      "button": "アプリを終了",
      "confirm": "アプリを終了してもよろしいですか？",
      "errors": {
        "failed": "アプリの終了に失敗しました"
      }
    },
    "desktopShortcut": {
      "label": "デスクトップショートカット",
      "helper": "デスクトップにアプリのショートカットを作成して、素早く起動できるようにします。",
      "create": "ショートカットを作成",
      "recreate": "再作成",
      "exists": "作成済み",
      "errors": {
        "createFailed": "デスクトップショートカットの作成に失敗しました"
      }
    }
  }
}
```

#### 12. `frontend/src/i18n/locales/ko/settings.json`
```json
{
  "appManagement": {
    "title": "앱 관리",
    "description": "애플리케이션 관련 작업을 관리합니다.",
    "exit": {
      "label": "앱 종료",
      "helper": "애플리케이션을 안전하게 종료합니다. 저장되지 않은 변경사항은 손실될 수 있습니다.",
      "button": "앱 종료",
      "confirm": "앱을 종료하시겠습니까?",
      "errors": {
        "failed": "앱 종료 실패"
      }
    },
    "desktopShortcut": {
      "label": "데스크톱 바로가기",
      "helper": "데스크톱에 앱 바로가기를 만들어 빠르게 시작할 수 있습니다.",
      "create": "바로가기 만들기",
      "recreate": "다시 만들기",
      "exists": "있음",
      "errors": {
        "createFailed": "데스크톱 바로가기 만들기 실패"
      }
    }
  }
}
```

---

## API 端点

### 1. POST /api/app/exit
**功能**: 触发应用优雅关闭

**请求体**: 无

**响应**:
```json
{
  "success": true,
  "message": "Application is shutting down..."
}
```

### 2. POST /api/app/desktop-shortcut
**功能**: 在桌面创建快捷方式

**请求体**: 无

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Desktop shortcut created successfully",
    "path": "/Users/username/Desktop/VibeKanban.app",
    "already_exists": false
  }
}
```

### 3. GET /api/app/desktop-shortcut-exists
**功能**: 检查桌面快捷方式是否存在

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Desktop shortcut exists",
    "path": null,
    "already_exists": true
  }
}
```

---

## 构建状态

### ✅ 前端构建
- TypeScript 类型检查: 通过
- 生产构建: 成功
- 输出: `dist/` 目录

### ⏳ 后端构建
- **状态**: 待验证
- **原因**: 网络问题导致 `cargo` 依赖下载超时
- **所需操作**: 在有 Rust 环境的终端中运行：
  ```bash
  cd /Users/senguoyun/Documents/trae_projects/vibe-kanban
  cargo build --workspace
  ```

---

## 技术实现细节

### 退出应用机制

1. **全局原子标志**: 使用 `AtomicBool` 作为跨线程的关闭信号
2. **非阻塞轮询**: `shutdown_signal()` 每 100ms 检查一次 API 关闭标志
3. **优先级**: API 关闭优先于 Ctrl+C 和 SIGTERM

### 桌面快捷方式实现

#### macOS (.app Bundle)
```rust
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    let exe_path = std::env::current_exe()?;

    // 检查是否已经在 .app bundle 中
    if exe_path.parent()?.parent()?.extension() == Some("app") {
        // 复制整个 .app bundle 到桌面
        Command::new("cp").arg("-R").arg(app_bundle).arg(&shortcut_path)
    } else {
        // 创建新的 .app bundle 结构
        create_macos_app_bundle(&exe_path)?;
    }
}
```

**目录结构**:
```
VibeKanban.app/
├── Contents/
│   ├── MacOS/
│   │   └── vibe-kanban (可执行文件)
│   ├── Resources/
│   └── Info.plist
```

**Info.plist 关键内容**:
```xml
<key>CFBundleExecutable</key>
<string>vibe-kanban</string>
<key>CFBundleIdentifier</key>
<string>ai.bloop.vibe-kanban</string>
<key>CFBundleName</key>
<string>Vibe Kanban</string>
```

#### Windows (.lnk)
```rust
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    let ps_script = format!(
        "$WshShell = New-Object -ComObject WScript.Shell; \
         $Shortcut = $WshShell.CreateShortcut('{}'); \
         $Shortcut.TargetPath = '{}'; \
         $Shortcut.WorkingDirectory = '{}'; \
         $Shortcut.Description = 'Vibe Kanban'; \
         $Shortcut.Save()",
        shortcut_path, exe_path, working_dir
    );

    Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(&ps_script)
        .output()?;
}
```

#### Linux (.desktop)
```rust
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    let desktop_entry = format!(
        "[Desktop Entry]\n\
         Version=1.0\n\
         Type=Application\n\
         Name=Vibe Kanban\n\
         Comment=AI-powered project management\n\
         Exec={}\n\
         Icon={}\n\
         Terminal=false\n\
         Categories=Development;IDE;\n",
        exe_path, icon_path
    );

    let mut file = fs::File::create(&shortcut_path)?;
    file.write_all(desktop_entry.as_bytes())?;

    // 设置可执行权限
    Command::new("chmod").arg("+x").arg(&shortcut_path).status()?;
}
```

---

## 测试建议

### 功能测试

#### 1. 退出应用测试
1. 启动应用
2. 导航到设置 → 常规
3. 滚动到"应用管理"卡片
4. 点击"退出应用"按钮
5. 确认对话框
6. **预期**: 应用优雅关闭

#### 2. 桌面快捷方式测试

**macOS**:
1. 点击"创建桌面快捷方式"
2. **预期**: 桌面出现 `VibeKanban.app`
3. 双击 `.app` 文件
4. **预期**: 应用正常启动

**Windows**:
1. 点击"创建快捷方式"
2. **预期**: 桌面出现 `Vibe Kanban.lnk`
3. 双击快捷方式
4. **预期**: 应用正常启动

**Linux**:
1. 点击"创建快捷方式"
2. **预期**: 桌面出现 `vibe-kanban.desktop`
3. 双击 `.desktop` 文件
4. **预期**: 应用正常启动

### 跨平台测试
- macOS (Intel & Apple Silicon)
- Windows 10/11
- Linux (Ubuntu, Fedora, etc.)

---

## 已知问题与限制

### 1. macOS 代码签名
- **问题**: 新创建的 .app bundle 可能没有代码签名
- **影响**: 首次启动时可能显示"无法验证开发者"警告
- **解决方案**: 用户需要在系统偏好设置中允许

### 2. Linux 桌面环境
- **问题**: 不同桌面环境（GNOME, KDE, XFCE）对 .desktop 文件的支持可能不同
- **影响**: 某些环境可能不显示快捷方式图标

### 3. Windows PowerShell
- **依赖**: 需要 PowerShell 可用
- **现状**: Windows 7+ 默认安装

---

## 后续改进建议

### 短期
1. 添加 macOS 代码签名支持
2. 支持自定义快捷方式图标
3. 添加快捷方式删除功能

### 长期
1. 支持创建启动项（开机自启）
2. 支持创建多个快捷方式（不同配置）
3. 支持快捷方式自动更新

---

## 相关资源

### 项目结构
```
vibe-kanban/
├── crates/
│   ├── server/
│   │   └── src/
│   │       ├── main.rs
│   │       └── routes/
│   │           ├── mod.rs
│   │           └── app_management.rs
│   └── utils/
│       └── src/
│           ├── lib.rs
│           └── desktop.rs
├── frontend/
│   └── src/
│       ├── lib/
│       │   └── api.ts
│       ├── pages/
│       │   └── settings/
│       │       └── GeneralSettings.tsx
│       └── i18n/
│           └── locales/
│               ├── zh-Hans/
│               ├── zh-Hant/
│               ├── ja/
│               └── ko/
└── shared/
    └── types.ts
```

### 依赖项
- **Rust**: dirs, thiserror, tokio
- **TypeScript**: React, lucide-react, i18next

---

## 总结

本实现完整地添加了"退出应用"和"创建桌面快捷方式"功能，支持 macOS、Windows 和 Linux 三个主要平台。前端 UI 已完成并通过构建，后端代码已实现但待 Rust 编译验证。

**完成度**: 95% (代码完成，待编译验证)

**下一步**: 在本地终端运行 `cargo build --workspace` 验证后端编译

# Voxel Workbench

把 AI 生成的 Three.js voxel HTML 场景转换成可在 Blockbench 中继续编辑的 `.bbmodel`，并支持导出为适合 Minecraft 开发流程的两种目标格式：

- `Modded Entity`
- `Java Block/Item`

项目同时提供：

- 命令行转换脚本
- 本地 Web 界面
- 最小 Electron 桌面应用

## 功能

- 读取包含 `type="module"` 脚本的 HTML voxel 场景
- 优先走 A 路线：捕获 `voxels[]`
- A 失败自动走 B 路线：捕获 `createVoxel(...)`
- 忽略动画、粒子、灯光、相机、背景
- 支持最长边降采样，输出体素仍保持 `1 x 1 x 1`
- 输出 `Modded Entity` 或 `Java Block/Item` 格式的 `.bbmodel`

## 适用场景

### `Modded Entity`

适合：

- 生物实体
- 需要继续在 Blockbench 里调组、调 pivot、做实体骨架整理的模型

### `Java Block/Item`

适合：

- 静态方块
- 静态物品
- 需要进入 Minecraft Java block model 工作流的模型

提示：

- 如果你希望模型只占一个标准方块体积，最长边建议压到 `16`
- `Java Block/Item` 更适合静态模型；复杂动态表现通常应走 `BlockEntityRenderer`

## 命令行用法

基础转换：

```bash
npm run convert -- input.html output.bbmodel --format modded_entity
```

限制最长边：

```bash
npm run convert -- input.html output.bbmodel --format java_block --max-edge 16
```

参数说明：

- `--format modded_entity`
- `--format java_block`
- `--max-edge <number>`

如果不传 `--format`，默认使用 `modded_entity`。

## 本地 Web 界面

启动：

```bash
npm run dev
```

然后打开：

- [http://127.0.0.1:4173/](http://127.0.0.1:4173/)

界面支持：

- 拖拽上传 HTML
- 选择示例文件
- 选择输出格式
- 设置最长边
- 下载生成的 `.bbmodel`

## 桌面版

启动 Electron：

```bash
npm run desktop
```

## 打包 Windows 安装包

本项目已经接入 Electron + `electron-builder`。

打包命令：

```bash
npm run dist:win
```

输出目录：

- `release/`

当前安装包文件名示例：

- `Voxel-Workbench-0.1.0-win-x64-setup.exe`

## 镜像说明

为避免 Electron 与 electron-builder 下载失败，项目使用项目级 `.npmrc` 镜像配置：

- `registry=https://registry.npmmirror.com`
- `electron_mirror=https://npmmirror.com/mirrors/electron/`
- `electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/`

## 项目结构

```text
.
├─ web/                     前端界面
├─ scripts/
│  ├─ html-voxels-to-bbmodel.mjs
│  └─ build-win-installer.mjs
├─ ex/                      示例 HTML
├─ output/                  转换输出
├─ build/                   打包资源
├─ electron-main.mjs        Electron 主进程
├─ server.mjs               本地服务
├─ package.json
└─ .npmrc
```

## Release 建议

发布 GitHub Release 时建议附上：

- `Voxel-Workbench-<version>-win-x64-setup.exe`

推荐说明内容：

- 支持 `Modded Entity` / `Java Block/Item`
- 支持拖拽上传 HTML
- 支持最长边降采样
- 适合把 AI 生成的 voxel HTML 转成 Blockbench 可编辑工程

# Voxel Workbench

一个把 HTML voxel 场景转换成 Blockbench `.bbmodel` 的本地工具，专门用于处理 Google AI Studio 这个页面产出的 HTML 文件：

- [https://aistudio.google.com/apps/bundled/image_to_voxel](https://aistudio.google.com/apps/bundled/image_to_voxel)

支持导出两种目标格式：

- `Modded Entity`
- `Java Block/Item`

项目当前主要提供：

- 命令行脚本
- 本地 Web 界面
- `start.bat` 一键启动入口

## 使用手册

### 这是什么

这个工具的目标很明确：

把 `https://aistudio.google.com/apps/bundled/image_to_voxel` 生成的 HTML voxel 场景，转换成可以在 Blockbench 里继续编辑的 `.bbmodel` 文件，方便继续进入 Minecraft 开发流程。

### 最简单的使用方式

1. 安装 Node.js 18+
2. 下载本项目文件
3. 双击 `start.bat`
4. 浏览器会自动打开本地页面
5. 拖拽上传 HTML 文件
6. 选择输出格式
7. 点击“开始转换”
8. 下载生成的 `.bbmodel`

### 适合什么输入

最推荐的输入是：

- 从 Google AI Studio `image_to_voxel` 页面导出的 HTML 文件

这类文件通常包含：

- `type="module"` 脚本
- `voxels[]` 或 `createVoxel(...)` 形式的体素构建逻辑

### 能输出什么

可以输出为两种 Blockbench 目标格式：

#### `Modded Entity`

适合：

- 生物实体
- 需要继续在 Blockbench 里调组、调 pivot、整理实体结构的模型

#### `Java Block/Item`

适合：

- 静态方块
- 静态物品
- 需要进入 Minecraft Java block model 工作流的模型

提示：

- 如果你希望模型只占一个标准方块体积，最长边建议压到 `16`
- `Java Block/Item` 更适合静态模型
- 复杂动态表现通常应走 `BlockEntityRenderer`

### 参数该怎么选

#### 输出格式

- 做实体、角色、生物：选 `Modded Entity`
- 做静态方块、静态物品：选 `Java Block/Item`

#### 最长边

- 想保留更多细节：填大一点
- 想让模型更轻：填小一点
- 单方块静态模型通常建议用 `16`

### 转换时实际做了什么

脚本会：

- 优先尝试 A 路线：捕获 `voxels[]`
- A 失败后自动尝试 B 路线：捕获 `createVoxel(...)`
- 忽略动画、粒子、灯光、相机、背景
- 支持最长边降采样
- 输出为 Blockbench 可继续编辑的 `.bbmodel`

## 本地 Web 界面

如果你想手动启动：

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

## 目录说明

```text
.
├─ web/                     前端界面
├─ scripts/
│  ├─ html-voxels-to-bbmodel.mjs
│  └─ generate-icon.ps1
├─ ex/                      示例 HTML
├─ output/                  转换输出
├─ server.mjs               本地服务
├─ start.bat                一键启动
├─ package.json
└─ AGENTS.md
```

## Release 建议

如果后续用 GitHub Release 分发，推荐优先发：

- 项目源码压缩包

并在说明里写明：

- 这是处理 Google AI Studio `image_to_voxel` HTML 产物的本地工具
- 双击 `start.bat` 即可启动
- 需要本机已安装 Node.js 18+

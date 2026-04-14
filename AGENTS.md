## 项目约定

- 仅在当前仓库内操作，不安装全局依赖。
- Python 如需使用，统一用 `uv` 在当前仓库创建 `.venv`，不要混用全局环境。
- 输出保持简洁，补丁尽量最小。
- 任何超出当前文件夹范围的改动，先停下并向用户报告。

## Electron 打包约定

- 本项目 Windows 安装包统一使用 Electron + `electron-builder` + NSIS。
- 优先使用项目级镜像配置，不改全局 npm。
- 镜像配置写在项目根目录 `.npmrc`：
  - `registry=https://registry.npmmirror.com`
  - `electron_mirror=https://npmmirror.com/mirrors/electron/`
  - `electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/`
- 打包脚本使用：
  - `npm run dist:win`
- Windows 打包依赖本地缓存：
  - `.cache/electron-builder/nsis`
  - `.cache/electron-builder/nsis-resources`
- 如果 Electron 或 electron-builder 下载异常，优先复用当前机器上已验证可用的镜像方案和本地缓存，不要先改成全局配置。
- 若需要参考已跑通的同机项目，可参考 `E:\\works\\ARTeaching` 中的 Electron / NSIS 配置与缓存组织方式。

## 发布物

- 安装包默认输出到 `release/`
- 当前安装包文件名规则：
  - `Voxel-Workbench-${version}-win-x64-setup.exe`

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const nsisDir = resolve(rootDir, '.cache', 'electron-builder', 'nsis');
const nsisResourcesDir = resolve(rootDir, '.cache', 'electron-builder', 'nsis-resources');

const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: resolve(rootDir, '.cache'),
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

if (existsSync(nsisDir)) {
  env.ELECTRON_BUILDER_NSIS_DIR = nsisDir;
}

if (existsSync(nsisResourcesDir)) {
  env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR = nsisResourcesDir;
}

const builderCmd =
  process.platform === 'win32'
    ? resolve(rootDir, 'node_modules', '.bin', 'electron-builder.cmd')
    : resolve(rootDir, 'node_modules', '.bin', 'electron-builder');

const result = process.platform === 'win32'
  ? spawnSync(`"${builderCmd}" --win nsis`, {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    })
  : spawnSync(builderCmd, ['--win', 'nsis'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: false,
    });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

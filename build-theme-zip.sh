#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is not installed or not in PATH." >&2
  exit 1
fi

if [ ! -f "package.json" ] || [ ! -f "vite.config.ts" ]; then
  echo "Error: run this script from the repository root." >&2
  exit 1
fi

echo "Installing dependencies if needed..."
pnpm install

echo "Building theme package..."
pnpm build

latest_zip="$(ls -t komari-theme-naive-build-*.zip 2>/dev/null | head -n 1 || true)"
output_dir="$ROOT_DIR/build-output"

if [ -z "$latest_zip" ]; then
  echo "Error: build finished, but no theme zip was found." >&2
  exit 1
fi

# 生成带时间戳的文件名，避免同一 commit 多次构建文件名冲突
timestamp="$(date +%Y%m%d-%H%M%S)"
base_name="${latest_zip%.zip}"
final_zip="${base_name}-${timestamp}.zip"

mkdir -p "$output_dir"
mv -f "$latest_zip" "$output_dir/$final_zip"

echo
echo "Theme zip created:"
echo "$output_dir/$final_zip"


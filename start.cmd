@echo off
title AI 学习空间 - 学生端

cd /d "%~dp0"

set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%"

REM ---- 检查 Node ----
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 没有找到 Node.js
  echo.
  echo   这个项目用 Node 跑一个本地小服务器，需要先装 Node。
  echo   下载地址: https://nodejs.org   装 LTS 版即可。
  echo.
  echo   装完后关掉这个窗口，重新双击 start.cmd。
  echo.
  pause
  exit /b 1
)

REM ---- 把地址复制到剪贴板 ----
<nul set /p "=%URL%" | clip

echo.
echo   ====================================================
echo.
echo      AI 学习空间 - 学生端
echo.
echo      地址已复制到剪贴板。
echo      打开浏览器，Ctrl+V 粘贴，回车:
echo.
echo          %URL%
echo.
echo      关闭这个窗口即可停止服务。
echo.
echo   ====================================================
echo.

node serve.mjs

echo.
echo   服务已停止。
pause

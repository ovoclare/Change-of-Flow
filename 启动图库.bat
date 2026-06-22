@echo off
cd /d "%~dp0"
echo 正在启动壶流图库……
echo 程序会自动扫描同级目录里的 codex整理，并按图片新文件名重建索引。
echo 如果浏览器先打开但页面还没出来，等命令行显示 Serving Hulium gallery 后刷新即可。
start "" "http://127.0.0.1:8877/"
python scripts\serve.py --host 127.0.0.1 --port 8877
pause

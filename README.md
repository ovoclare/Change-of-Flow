# 壶流论文图库原型

这是《流之变：中国古代陶瓷器“壶流”的形制演变与修复实践》的本地图库原型。程序只读扫描 `codex整理`，按论文分期浏览图片，并把同一器物的多张图片归到同一个临时编号下。

## 当前功能

- 启动时自动寻找图库目录：优先识别和 `壶流图库程序` 同级的 `codex整理`
- 自动扫描图库里的图片，不再依赖旧的固定绝对路径
- 自动解析当前命名规则：`Prefix-0000_时代_窑口或文化_器名_流形态_来源`
- 按文件名和路径推断论文分期、时代、窑口/文化、器类、流型、来源
- 改名后通过图片内容校验尽量保留原来的器物编号、图片编号、审阅状态和备注
- 识别疑似同一器物多图，写入 `data/pending-merge.json`
- 本地浏览器看图：缩略图、大图、路径、器物字段、同器物多图
- 时间轴支持“全部”范围，也支持按左侧论文分期、窑口/文化、搜索和审阅状态联动筛选；时间轴按朝代/时期归并显示，不再拆成早晚期或年号

原始图片不会被移动、改名或删除。删除本地文件前必须先征得用户许可。

## 使用方法

推荐保持这个目录结构：

```text
某个文件夹/
  codex整理/
  壶流图库程序/
```

在 Windows 上可以直接双击：

```text
启动图库.bat
```

也可以在 `壶流图库程序` 文件夹运行：

```powershell
python scripts/serve.py --host 127.0.0.1 --port 8877
```

程序启动时会自动重建：

- `data/catalog.json`：器物和图片索引
- `data/pending-merge.json`：待确认合并组

后续新增、删除、移动、改名图片，只要重启服务就会重新识别。已有器物编号会尽量保持稳定；找不到的旧图片会标记为 `missing`，不会删除记录。

然后打开：

```text
http://127.0.0.1:8877/
```

如果 `codex整理` 不在同级目录，可以手动指定：

```powershell
python scripts/serve.py --source "你的codex整理路径" --host 127.0.0.1 --port 8877
```

## 运行测试

```powershell
python -m unittest tests.test_catalog_builder tests.test_serve tests.test_frontend_contract -v
```

## GitHub

项目已上传到：

```text
https://github.com/ovoclare/Change-of-Flow
```

本地仓库远端：

```powershell
git remote -v
```

# 壶流论文图库原型

这是《流之变：中国古代陶瓷器“壶流”的形制演变与修复实践》的本地图库原型。第一版先服务论文写作：只读扫描 `codex整理`，按论文分期浏览图片，并把同一器物的多张图片归到同一个临时编号下。

## 当前功能

- 只读扫描 `F:\我爱的\美术\研究生\毕业论文毕业设计\1形制图谱\codex整理`
- 生成稳定器物编号，例如 `HL-0001`
- 生成图片编号，例如 `IMG-0001`
- 按论文分期浏览：元、亨、利、贞、近现代补充
- 标记前身/源流参照资料，例如青铜盉、陶鬶、爵
- 识别疑似同一器物多图，写入 `data/pending-merge.json`
- 本地浏览器看图：缩略图、大图、路径、器物字段、同器物多图

原始图片不会被移动、改名或删除。删除本地文件前必须先征得用户许可。

## 重新生成图库索引

在本文件夹运行：

```powershell
python scripts/catalog_builder.py --source "F:\我爱的\美术\研究生\毕业论文毕业设计\1形制图谱\codex整理" --catalog data/catalog.json --pending data/pending-merge.json
```

生成结果：

- `data/catalog.json`：器物和图片索引
- `data/pending-merge.json`：待确认合并组

后续新增图片时，重新运行上面的命令即可。已有器物编号会尽量保持稳定；找不到的旧图片会标记为 `missing`，不会删除记录。

## 启动本地图库

```powershell
python scripts/serve.py --host 127.0.0.1 --port 8877
```

然后打开：

```text
http://127.0.0.1:8877/
```

## 运行测试

```powershell
python -m unittest tests.test_catalog_builder -v
```

## GitHub 上传说明

这个文件夹目前可以作为独立项目上传到 GitHub。上传需要满足其中一种条件：

- 本机安装并登录 GitHub CLI：`gh auth login`
- GitHub 插件能正常连接，并提供已有仓库名称
- 用户提供一个可推送的 GitHub 远端地址

当前环境里 `gh` 命令不可用，GitHub 插件握手也曾超时，所以本地原型可以先完成；上传需要等 GitHub 连接条件满足后再执行。

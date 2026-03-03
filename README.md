# DouBao Assistant (Edge)

一个仅面向 **Edge 浏览器 + 豆包网页版** 的对话辅助插件：

- 自动提取用户提问
- 生成结构化问题目录
- 关键词搜索并高亮匹配
- 点击目录一键跳转到原对话位置

## 技术栈

- Manifest V3
- TypeScript
- Vite
- Preact
- `chrome.storage.local` 本地存储（不上传云端）

## 开发与构建

```bash
npm install
npm run build
```

## 在 Edge 中加载

1. 打开 `edge://extensions`
2. 开启「开发者模式」
3. 选择「加载已解压的扩展程序」
4. 选择本项目根目录

> 注意：`manifest.json` 指向 `dist/...` 文件，请先执行 `npm run build`。

## 目录结构

- `src/content`：内容脚本，负责提问提取与页面内定位
- `src/background`：后台脚本，负责本地存储与消息转发
- `src/sidebar`：侧边栏 UI，负责目录展示/搜索/跳转
- `src/shared`：共享类型与消息常量

## 隐私说明

本插件不收集任何用户数据，所有内容仅保存在本地。
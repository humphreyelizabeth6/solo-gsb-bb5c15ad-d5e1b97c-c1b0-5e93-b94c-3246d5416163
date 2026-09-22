# 色觉安全图例校验台（CVD Legend Checker）

校验图例调色板在色觉缺陷（色弱）模拟下是否仍可区分，并在指定待替换色、锁定其余颜色的前提下，从内置候选网格中推荐更安全的替代色。

## 功能

- **2–8 色带标签调色板**：每色可编辑标签与十六进制色值（含取色器）。
- **视觉模式**：正常 / 红弱（Protan）/ 绿弱（Deutan）/ 蓝弱（Tritan），可任意勾选组合；阈值（CIEDE2000）可调。
- **模拟与度量**：在**线性 RGB** 空间应用 CVD 模拟矩阵，转换到 **Lab** 空间后计算全部色对的 **CIEDE2000** 距离。
- **结果标注**：标出**最差模式**（最小色对距离最小的模式）与每个模式下**不达标色对**（距离 < 阈值）。
- **替换推荐**：指定一个待替换色并锁定其余颜色，从内置 HSL 候选网格（24 色相 × 3 饱和度 × 4 亮度 + 灰阶，共 294 色）中挑选**跨全部模式最小色对距离最大**（maximin）的候选；平局时取与原色 CIEDE2000 改变量更小者。
- **并排对比**：每个模式下，原色与模拟色并排显示。

## 技术栈

- 前端：React 18 + Vite
- 后端：Express（Node 20，ESM）
- 色彩计算：[culori](https://culorijs.org/)（RGB↔Lab 转换、CIEDE2000）

## 快速开始（Docker，一键）

```bash
docker compose up --build
```

然后访问 **http://localhost:3000**（容器内外均为端口 **3000**）。

也可以不用 Compose：

```bash
docker build -t cvd-legend-checker .
docker run --rm -p 3000:3000 cvd-legend-checker
```

## 本地开发

```bash
npm install                  # 安装服务端依赖
npm --prefix client install  # 安装前端依赖

npm run dev:server           # API 服务：http://localhost:3000（--watch 热重载）
npm run dev:client           # 前端开发服：http://localhost:5173（/api 自动代理到 3000）
```

## 生产模式（无 Docker）

```bash
npm install && npm --prefix client install
npm run build                # 构建前端到 client/dist
npm start                    # http://localhost:3000（Express 同时托管 API 与静态文件）
```

## API

### `POST /api/evaluate`

```json
{
  "colors": [{ "label": "蓝", "hex": "#0072B2" }, { "label": "橙", "hex": "#E69F00" }],
  "threshold": 12,
  "modes": ["normal", "protan", "deutan", "tritan"]
}
```

返回各模式的模拟色值、全部色对距离与达标判定、最小距离，以及 `worstMode` / `worstMinDistance`。

### `POST /api/suggest`

在 `evaluate` 请求体基础上增加 `replaceIndex`（待替换色下标，其余颜色锁定）。返回推荐色 `hex`、跨模式最小距离 `minDistance`、与原色改变量 `change`、各模式最小距离 `perMode` 及是否达标 `pass`。

## 端口

| 用途 | 端口 |
| --- | --- |
| 生产 / Docker（API + 前端） | 3000 |
| Vite 开发服务器（仅本地开发） | 5173 |

## 项目结构

```
server/
  index.js       Express 入口：API + 静态托管
  colorMath.js   CVD 模拟矩阵（线性 RGB）、CIEDE2000 评估、替换推荐
client/
  src/App.jsx    调色板编辑、结果展示、替换推荐 UI
Dockerfile       多阶段构建（前端构建 + 生产运行）
docker-compose.yml
```

# ---------- 构建阶段：安装依赖并构建前端 ----------
FROM node:20-alpine AS build
WORKDIR /app

# 先拷贝依赖清单，充分利用镜像层缓存
COPY package.json package-lock.json* ./
COPY client/package.json client/package-lock.json* ./client/
RUN npm install --omit=dev && npm --prefix client install

# 拷贝源码并构建前端
COPY server ./server
COPY client ./client
RUN npm --prefix client run build

# ---------- 运行阶段：仅保留生产依赖与构建产物 ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/index.js"]

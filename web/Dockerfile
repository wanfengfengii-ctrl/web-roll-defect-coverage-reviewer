# 构建阶段：安装依赖 → 单元测试（Vitest）→ 类型检查 → 产物构建
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run test \
 && npm run typecheck \
 && npm run build

# 运行阶段：nginx 托管静态产物，并把 /api 同源反代到 API 容器
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

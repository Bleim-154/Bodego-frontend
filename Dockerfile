FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BODEGO_BACKEND_API_URL
ENV NODE_OPTIONS=--max-old-space-size=768 NG_BUILD_MAX_WORKERS=1 NG_BUILD_PARALLEL_TS=0 GOMAXPROCS=2
RUN npm run build -- --configuration production

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
ENV PORT=8080 NGINX_ENVSUBST_FILTER=PORT
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/Bodego/browser/ /usr/share/nginx/html/
EXPOSE 8080

FROM oven/bun:latest

WORKDIR /app

COPY . .
ENV TZ=Asia/Shanghai

WORKDIR /app/frontend
RUN bun install
RUN bun run build


WORKDIR /app
RUN bun install

RUN bun build \
--compile \
--minify-whitespace \
--minify-syntax \
--target bun \
--outfile server \
./src/index.ts

EXPOSE 3000

CMD ["./server"]
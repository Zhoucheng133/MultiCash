# MultiCash

<img src="assets/icon.svg" width=100></img>

![License](https://img.shields.io/badge/License-MIT-dark_green)

## 快速开始

### 部署

```bash
sudo docker run -d \
--restart always \
--name multicash \
-p <主机端口>:3000 \
-v <主机上存储数据库的位置*>:/app/db \
zhouc1230/multicash:latest
```

### 更新

```bash
# 拉取最新镜像
docker pull zhouc1230/multicash:latest
# 停止旧容器
docker stop multicash
# 删除旧容器
docker rm multicash
# 启动新容器
sudo docker run -d \
--restart always \
--name multicash \
-p <主机端口>:3000 \
-v <主机上存储数据库的位置>:/app/db \
zhouc1230/multicash:latest
```
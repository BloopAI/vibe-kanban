#!/bin/bash

# ============================================
# Fork 仓库同步脚本
# ============================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}   Fork 仓库同步工具${NC}"
echo -e "${BLUE}=======================================${NC}"

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}错误: 当前目录不是 Git 仓库${NC}"
    exit 1
fi

# 检查 upstream 是否配置
if ! git remote | grep -q "upstream"; then
    echo -e "${YELLOW}未配置 upstream 远程仓库${NC}"
    echo "请先运行: git remote add upstream <原始仓库地址>"
    echo "例如: git remote add upstream https://github.com/原作者/项目.git"
    exit 1
fi

echo -e "\n${GREEN}步骤 1: 获取 upstream 更新...${NC}"
git fetch upstream
echo -e "${GREEN}✓ 完成${NC}"

echo -e "\n${GREEN}步骤 2: 检查当前分支...${NC}"
CURRENT_BRANCH=$(git branch --show-current)
echo "当前分支: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo -e "${YELLOW}警告: 当前不在主分支上${NC}"
    read -p "是否切换到主分支? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if git show-ref --verify --quiet refs/heads/main; then
            git checkout main
        elif git show-ref --verify --quiet refs/heads/master; then
            git checkout master
        fi
        CURRENT_BRANCH=$(git branch --show-current)
    fi
fi

echo -e "\n${GREEN}步骤 3: 合并 upstream 更新...${NC}"
git merge upstream/$CURRENT_BRANCH

echo -e "\n${GREEN}步骤 4: 推送到你的 fork (origin)...${NC}"
git push origin $CURRENT_BRANCH

echo -e "\n${GREEN}=======================================${NC}"
echo -e "${GREEN}✓ 同步完成！${NC}"
echo -e "${GREEN}=======================================${NC}"

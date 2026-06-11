#!/bin/bash
# Docker Cleanup Script for Kilusi Bill
# This script removes unused Docker resources to free up disk space

echo "=== Docker Cleanup Script ==="
echo "Started at: $(date)"

# Remove stopped containers
echo "Removing stopped containers..."
docker container prune -f

# Remove unused images
echo "Removing unused images..."
docker image prune -a -f

# Remove unused volumes
echo "Removing unused volumes..."
docker volume prune -f

# Remove unused networks
echo "Removing unused networks..."
docker network prune -f

# System prune (build cache, etc.)
echo "Running system prune..."
docker system prune -f

echo "=== Cleanup Complete ==="
echo "Disk usage after cleanup:"
df -h / | tail -1

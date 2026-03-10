#!/bin/bash

# BIM Assistant - Docker Management Script
# This script helps manage the Docker Compose setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect docker compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo -e "${RED}✗ Docker Compose is not installed${NC}"
    exit 1
fi

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  BIM Assistant - Docker Manager${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed ($DOCKER_COMPOSE)"
}

check_env_file() {
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from .env.example..."
        if [ -f .env.example ]; then
            cp .env.example .env
            print_success ".env file created. Please review and update if needed."
        else
            print_error ".env.example not found!"
            exit 1
        fi
    else
        print_success ".env file exists"
    fi
}

start_services() {
    print_info "Starting all services in DEVELOPMENT mode..."
    $DOCKER_COMPOSE up -d
    print_success "All services started successfully"
    print_warning "Code changes will auto-reload. Check logs with: ./docker-manager.sh logs"
    show_status
}

start_with_workers() {
    print_info "Starting all services + workers in DEVELOPMENT mode..."
    $DOCKER_COMPOSE --profile workers up -d
    print_success "All services + workers started successfully"
    print_warning "Code changes will auto-reload. Check logs with: ./docker-manager.sh logs"
    show_status
}

start_workers_only() {
    print_info "Starting conversion and clash detection workers..."
    $DOCKER_COMPOSE --profile workers up -d worker clash-worker
    print_success "Workers started successfully"
    show_status
}

start_conversion_worker() {
    print_info "Starting conversion worker only..."
    $DOCKER_COMPOSE --profile workers up -d worker
    print_success "Conversion worker started successfully"
    show_status
}

start_clash_worker() {
    print_info "Starting clash detection worker only..."
    $DOCKER_COMPOSE --profile workers up -d clash-worker
    print_success "Clash detection worker started successfully"
    show_status
}

stop_workers_only() {
    print_info "Stopping conversion and clash detection workers..."
    $DOCKER_COMPOSE stop worker clash-worker
    print_success "Workers stopped"
    show_status
}

stop_conversion_worker() {
    print_info "Stopping conversion worker..."
    $DOCKER_COMPOSE stop worker
    print_success "Conversion worker stopped"
    show_status
}

stop_clash_worker() {
    print_info "Stopping clash detection worker..."
    $DOCKER_COMPOSE stop clash-worker
    print_success "Clash detection worker stopped"
    show_status
}

scale_workers() {
    local conversion_workers=${2:-2}
    local clash_workers=${3:-1}
    print_info "Scaling workers: conversion=$conversion_workers, clash=$clash_workers..."
    $DOCKER_COMPOSE --profile workers up -d --scale worker=$conversion_workers --scale clash-worker=$clash_workers
    print_success "Workers scaled successfully"
    show_status
}

stop_services() {
    print_info "Stopping all services..."
    $DOCKER_COMPOSE down
    print_success "All services stopped"
}

restart_services() {
    print_info "Restarting all services..."
    $DOCKER_COMPOSE restart
    print_success "All services restarted"
}

show_status() {
    print_info "Service Status:"
    $DOCKER_COMPOSE ps
}

show_logs() {
    if [ -z "$1" ]; then
        $DOCKER_COMPOSE logs -f
    else
        $DOCKER_COMPOSE logs -f "$1"
    fi
}

rebuild_services() {
    print_info "Rebuilding services..."
    $DOCKER_COMPOSE up -d --build
    print_success "Services rebuilt and started"
}

clean_all() {
    print_warning "This will remove all containers, volumes, and data!"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        $DOCKER_COMPOSE down -v
        print_success "All services and data removed"
    else
        print_info "Operation cancelled"
    fi
}

show_urls() {
    print_header
    echo ""
    print_info "Access Points:"
    echo ""
    echo "  Frontend:        http://localhost:5173"
    echo "  Backend API:     http://localhost:3000"
    echo "  MinIO Console:   http://localhost:9001"
    echo "  PostgreSQL:      localhost:5432"
    echo "  RabbitMQ UI:     http://localhost:15672"
    echo ""
}

backup_db() {
    print_info "Creating database backup..."
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="backup_${timestamp}.sql"
    $DOCKER_COMPOSE exec -T postgres pg_dump -U bim_user bim_assistant > "$backup_file"
    print_success "Database backed up to: $backup_file"
}

show_help() {
    print_header
    echo ""
    echo "Usage: ./docker-manager.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start              - Start all services (without workers)"
    echo "  start-all          - Start all services + workers"
    echo "  start-workers      - Start both workers (conversion + clash)"
    echo "  start-conversion   - Start only conversion worker"
    echo "  start-clash        - Start only clash detection worker"
    echo "  stop               - Stop all services"
    echo "  stop-workers       - Stop both workers"
    echo "  stop-conversion    - Stop only conversion worker"
    echo "  stop-clash         - Stop only clash detection worker"
    echo "  scale [conv] [cls] - Scale workers (default: 2 conversion, 1 clash)"
    echo "  restart            - Restart all services"
    echo "  status             - Show service status"
    echo "  logs [svc]         - Show logs (optionally for specific service)"
    echo "  rebuild            - Rebuild and restart services"
    echo "  clean              - Remove all containers and data (⚠️  destructive)"
    echo "  urls               - Show all access URLs"
    echo "  backup             - Backup PostgreSQL database"
    echo "  shell [svc]        - Open shell in service container"
    echo "  help               - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./docker-manager.sh start              # Start without workers"
    echo "  ./docker-manager.sh start-all          # Start with workers"
    echo "  ./docker-manager.sh start-workers      # Start both workers"
    echo "  ./docker-manager.sh start-conversion   # Start only conversion worker"
    echo "  ./docker-manager.sh start-clash        # Start only clash worker"
    echo "  ./docker-manager.sh stop-workers       # Stop both workers"
    echo "  ./docker-manager.sh stop-conversion    # Stop conversion worker only"
    echo "  ./docker-manager.sh scale 4 2          # Scale to 4 conversion + 2 clash workers"
    echo "  ./docker-manager.sh logs worker        # Watch worker logs"
    echo "  ./docker-manager.sh shell backend      # Open backend shell"
    echo ""
}

open_shell() {
    if [ -z "$1" ]; then
        print_error "Please specify a service name"
        echo "Available services: backend, frontend, postgres, rabbitmq, minio, worker"
        exit 1
    fi
    $DOCKER_COMPOSE exec "$1" sh
}

# Main script
print_header

case "${1:-help}" in
    start)
        check_docker
        check_env_file
        start_services
        show_urls
        ;;
    start-all)
        check_docker
        check_env_file
        start_with_workers
        show_urls
        ;;
    start-workers)
        check_docker
        start_workers_only
        ;;
    start-conversion)
        check_docker
        start_conversion_worker
        ;;
    start-clash)
        check_docker
        start_clash_worker
        ;;
    stop)
        check_docker
        stop_services
        ;;
    stop-workers)
        check_docker
        stop_workers_only
        ;;
    stop-conversion)
        check_docker
        stop_conversion_worker
        ;;
    stop-clash)
        check_docker
        stop_clash_worker
        ;;
    scale)
        check_docker
        scale_workers "$@"
        ;;
    restart)
        check_docker
        restart_services
        ;;
    status)
        check_docker
        show_status
        ;;
    logs)
        check_docker
        show_logs "$2"
        ;;
    rebuild)
        check_docker
        check_env_file
        rebuild_services
        show_urls
        ;;
    clean)
        check_docker
        clean_all
        ;;
    urls)
        show_urls
        ;;
    backup)
        check_docker
        backup_db
        ;;
    shell)
        check_docker
        open_shell "$2"
        ;;
    help|*)
        show_help
        ;;
esac

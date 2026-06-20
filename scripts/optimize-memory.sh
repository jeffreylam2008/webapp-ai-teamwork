#!/bin/bash

echo "🧹 Next.js Memory Optimization Script"
echo "====================================="

# Function to check if Next.js server is running
check_server() {
    if pgrep -f "next dev" > /dev/null; then
        echo "✅ Next.js development server is running"
        return 0
    else
        echo "❌ Next.js development server is not running"
        return 1
    fi
}

# Function to stop Next.js server
stop_server() {
    echo "🛑 Stopping Next.js development server..."
    pkill -f "next dev"
    sleep 2
    if ! pgrep -f "next dev" > /dev/null; then
        echo "✅ Server stopped successfully"
    else
        echo "⚠️  Server may still be running, trying force kill..."
        pkill -9 -f "next dev"
    fi
}

# Function to clear caches
clear_caches() {
    echo "🗑️  Clearing caches..."
    
    # Clear Next.js build cache
    if [ -d ".next" ]; then
        rm -rf .next
        echo "✅ Cleared .next cache"
    fi
    
    # Clear node_modules cache
    if [ -d "node_modules/.cache" ]; then
        rm -rf node_modules/.cache
        echo "✅ Cleared node_modules cache"
    fi
    
    # Clear npm cache
    npm cache clean --force
    echo "✅ Cleared npm cache"
    
    # Clear system cache (if available)
    if command -v sync > /dev/null; then
        sync
        echo "✅ Synced file system cache"
    fi
}

# Function to show memory usage
show_memory() {
    echo "📊 Current Memory Usage:"
    echo "------------------------"
    free -h
    echo ""
    echo "🔍 Node.js Processes:"
    ps aux | grep node | grep -v grep || echo "No Node.js processes found"
}

# Function to start server with memory limits
start_server_optimized() {
    echo "🚀 Starting Next.js server with memory optimization..."
    
    # Set Node.js memory limits
    export NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size"
    
    # Start server in background
    npm run dev &
    
    sleep 3
    if pgrep -f "next dev" > /dev/null; then
        echo "✅ Server started with memory optimization"
        echo "📝 Memory limit set to 2GB"
    else
        echo "❌ Failed to start server"
    fi
}

# Main script logic
echo ""
show_memory

echo ""
echo "Choose an option:"
echo "1. Stop server and clear caches"
echo "2. Restart server with memory optimization"
echo "3. Show current memory usage"
echo "4. Exit"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        if check_server; then
            stop_server
        fi
        clear_caches
        echo "✅ Memory cleanup completed"
        ;;
    2)
        if check_server; then
            stop_server
        fi
        clear_caches
        start_server_optimized
        ;;
    3)
        show_memory
        ;;
    4)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎯 Memory optimization completed!" 
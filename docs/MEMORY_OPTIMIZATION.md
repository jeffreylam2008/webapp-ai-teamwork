# 🧹 Next.js Memory Optimization Guide

## 📊 **Quick Memory Check Commands**

```bash
# Check system memory
free -h

# Check Node.js process memory
ps aux | grep node | grep -v grep

# Check Next.js specific processes
ps aux | grep "next dev" | grep -v grep
```

## 🚀 **Immediate Memory Solutions**

### **1. Restart with Memory Limits**
```bash
# Stop current server
pkill -f "next dev"

# Start with memory optimization
npm run dev:optimized
```

### **2. Clear All Caches**
```bash
# Use the built-in clean script
npm run clean

# Or manually clear caches
rm -rf .next
rm -rf node_modules/.cache
npm cache clean --force
```

### **3. Use Memory Optimization Script**
```bash
# Run the interactive memory optimization script
npm run memory:optimize
```

## ⚙️ **Configuration Optimizations**

### **Node.js Memory Settings**
```bash
# Set memory limits for Node.js
export NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size"

# For production
export NODE_OPTIONS="--max-old-space-size=4096"
```

### **Next.js Configuration (next.config.js)**
```javascript
const nextConfig = {
  experimental: {
    optimizeCss: true,
    treeShaking: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000, // 25 seconds
    pagesBufferLength: 2,      // Keep only 2 pages in memory
  },
};
```

## 🔧 **Development Best Practices**

### **1. Code Splitting**
```javascript
// Use dynamic imports for large components
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>,
  ssr: false
});
```

### **2. Optimize Images**
```javascript
import Image from 'next/image'

// Use optimized images
<Image
  src="/large-image.jpg"
  alt="Description"
  width={500}
  height={300}
  priority={false} // Only set true for above-the-fold images
/>
```

### **3. Memory-Efficient Data Fetching**
```javascript
// Use pagination and limits
const fetchData = async (page = 1, limit = 10) => {
  const response = await fetch(`/api/data?page=${page}&limit=${limit}`);
  return response.json();
};

// Implement virtual scrolling for large lists
import { FixedSizeList as List } from 'react-window';
```

## 🏗️ **Production Optimizations**

### **1. Build Optimization**
```bash
# Analyze bundle size
npm run build:analyze

# Build with memory limits
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### **2. Server Memory Management**
```bash
# Start production server with memory limits
npm run start:optimized

# Or manually
NODE_OPTIONS="--max-old-space-size=4096" next start
```

### **3. Environment Variables**
```bash
# .env.local
NODE_OPTIONS=--max-old-space-size=2048
NEXT_TELEMETRY_DISABLED=1
```

## 🐛 **Troubleshooting Memory Issues**

### **Common Memory Problems**

1. **"JavaScript heap out of memory"**
   ```bash
   # Solution: Increase heap size
   NODE_OPTIONS="--max-old-space-size=4096" npm run dev
   ```

2. **Slow development server**
   ```bash
   # Solution: Clear caches and restart
   npm run clean
   npm run dev:optimized
   ```

3. **High memory usage in production**
   ```bash
   # Solution: Optimize build and use memory limits
   npm run build
   npm run start:optimized
   ```

### **Memory Monitoring**
```bash
# Monitor memory usage in real-time
watch -n 1 'ps aux | grep node | grep -v grep'

# Check memory leaks
node --inspect npm run dev
```

## 📈 **Performance Monitoring**

### **Bundle Analysis**
```bash
# Install bundle analyzer
npm install --save-dev @next/bundle-analyzer

# Analyze bundle
npm run build:analyze
```

### **Memory Profiling**
```javascript
// Add memory profiling in development
if (process.env.NODE_ENV === 'development') {
  const used = process.memoryUsage();
  console.log({
    rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
  });
}
```

## 🎯 **Quick Memory Fix Checklist**

- [ ] **Restart development server** with memory limits
- [ ] **Clear all caches** (.next, node_modules/.cache, npm cache)
- [ ] **Check for memory leaks** in components
- [ ] **Optimize images** and use proper sizing
- [ ] **Implement code splitting** for large components
- [ ] **Use pagination** for large data sets
- [ ] **Monitor bundle size** regularly
- [ ] **Set appropriate memory limits** for your server

## 🚨 **Emergency Memory Cleanup**

If your server is running out of memory:

```bash
# 1. Stop all Node.js processes
pkill -f node

# 2. Clear system cache
sudo sync && sudo sysctl -w vm.drop_caches=3

# 3. Restart with memory limits
NODE_OPTIONS="--max-old-space-size=2048" npm run dev:optimized
```

---

**💡 Pro Tip**: Regularly monitor your application's memory usage and implement these optimizations early to prevent memory issues as your application grows. 
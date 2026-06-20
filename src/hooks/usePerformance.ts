'use client';
import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
  timeToInteractive: number;
}

interface PerformanceObserver {
  observe: (options: PerformanceObserverInit) => void;
  disconnect: () => void;
}

interface PerformanceEntry {
  startTime: number;
  processingStart?: number;
  hadRecentInput?: boolean;
  value?: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
}

export const usePerformance = () => {
  const metricsRef = useRef<PerformanceMetrics>({
    pageLoadTime: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0,
    firstInputDelay: 0,
    timeToInteractive: 0,
  });

  const observerRef = useRef<PerformanceObserver | null>(null);

  // Measure page load time
  const measurePageLoadTime = useCallback(() => {
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        metricsRef.current.pageLoadTime = navigation.loadEventEnd - navigation.loadEventStart;
      }
    }
  }, []);

  // Measure First Contentful Paint
  const measureFCP = useCallback(() => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        const observer = new (window as Window & typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver((list: PerformanceObserverEntryList) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            metricsRef.current.firstContentfulPaint = entries[0].startTime;
          }
        });
        observer.observe({ entryTypes: ['paint'] });
        observerRef.current = observer;
      } catch (error) {
        console.warn('FCP measurement failed:', error);
      }
    }
  }, []);

  // Measure Largest Contentful Paint
  const measureLCP = useCallback(() => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        const observer = new (window as Window & typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver((list: PerformanceObserverEntryList) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            metricsRef.current.largestContentfulPaint = lastEntry.startTime;
          }
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (error) {
        console.warn('LCP measurement failed:', error);
      }
    }
  }, []);

  // Measure Cumulative Layout Shift
  const measureCLS = useCallback(() => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        let clsValue = 0;
        const observer = new (window as Window & typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver((list: PerformanceObserverEntryList) => {
                  for (const entry of list.getEntries()) {
          const layoutEntry = entry as unknown as LayoutShiftEntry;
          if (!layoutEntry.hadRecentInput) {
            clsValue += layoutEntry.value;
          }
        }
          metricsRef.current.cumulativeLayoutShift = clsValue;
        });
        observer.observe({ entryTypes: ['layout-shift'] });
      } catch (error) {
        console.warn('CLS measurement failed:', error);
      }
    }
  }, []);

  // Measure First Input Delay
  const measureFID = useCallback(() => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        const observer = new (window as Window & typeof globalThis & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver((list: PerformanceObserverEntryList) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const firstInputEntry = entries[0] as unknown as FirstInputEntry;
            metricsRef.current.firstInputDelay = firstInputEntry.processingStart - firstInputEntry.startTime;
          }
        });
        observer.observe({ entryTypes: ['first-input'] });
      } catch (error) {
        console.warn('FID measurement failed:', error);
      }
    }
  }, []);

  // Measure Time to Interactive
  const measureTTI = useCallback(() => {
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        metricsRef.current.timeToInteractive = navigation.domInteractive - navigation.fetchStart;
      }
    }
  }, []);

  // Get current metrics
  const getMetrics = useCallback((): PerformanceMetrics => {
    return { ...metricsRef.current };
  }, []);

  // Log performance metrics
  const logMetrics = useCallback(() => {
    const metrics = getMetrics();
    console.group('🚀 Performance Metrics');
    console.log('Page Load Time:', `${metrics.pageLoadTime.toFixed(2)}ms`);
    console.log('First Contentful Paint:', `${metrics.firstContentfulPaint.toFixed(2)}ms`);
    console.log('Largest Contentful Paint:', `${metrics.largestContentfulPaint.toFixed(2)}ms`);
    console.log('Cumulative Layout Shift:', metrics.cumulativeLayoutShift.toFixed(4));
    console.log('First Input Delay:', `${metrics.firstInputDelay.toFixed(2)}ms`);
    console.log('Time to Interactive:', `${metrics.timeToInteractive.toFixed(2)}ms`);
    console.groupEnd();

    // Send to analytics if available
    if (typeof window !== 'undefined' && (window as Window & typeof globalThis & { gtag: unknown }).gtag) {
      (window as Window & typeof globalThis & { gtag: (event: string, action: string, params: Record<string, unknown>) => void }).gtag('event', 'performance_metrics', {
        event_category: 'performance',
        value: metrics.pageLoadTime,
        custom_map: {
          fcp: metrics.firstContentfulPaint,
          lcp: metrics.largestContentfulPaint,
          cls: metrics.cumulativeLayoutShift,
          fid: metrics.firstInputDelay,
          tti: metrics.timeToInteractive,
        }
      });
    }
  }, [getMetrics]);

  // Optimize images
  const optimizeImages = useCallback(() => {
    if (typeof window !== 'undefined') {
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        // Add loading="lazy" to images below the fold
        if (!img.loading) {
          img.loading = 'lazy';
        }
        
        // Add decoding="async" for better performance
        if (!img.decoding) {
          img.decoding = 'async';
        }
      });
    }
  }, []);

  // Preload critical resources
  const preloadCriticalResources = useCallback(() => {
    if (typeof window !== 'undefined') {
      // Preload critical CSS
      const criticalCSS = document.createElement('link');
      criticalCSS.rel = 'preload';
      criticalCSS.as = 'style';
      criticalCSS.href = '/critical.css'; // Create this file for critical CSS
      document.head.appendChild(criticalCSS);

      // Preload critical fonts
      const criticalFont = document.createElement('link');
      criticalFont.rel = 'preload';
      criticalFont.as = 'font';
      criticalFont.href = '/fonts/geist-sans.woff2';
      criticalFont.crossOrigin = 'anonymous';
      document.head.appendChild(criticalFont);
    }
  }, []);

  useEffect(() => {
    // Start measuring when component mounts
    measurePageLoadTime();
    measureFCP();
    measureLCP();
    measureCLS();
    measureFID();
    measureTTI();

    // Optimize after initial load
    const timer = setTimeout(() => {
      optimizeImages();
      preloadCriticalResources();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [measurePageLoadTime, measureFCP, measureLCP, measureCLS, measureFID, measureTTI, optimizeImages, preloadCriticalResources]);

  return {
    getMetrics,
    logMetrics,
    optimizeImages,
    preloadCriticalResources,
  };
};

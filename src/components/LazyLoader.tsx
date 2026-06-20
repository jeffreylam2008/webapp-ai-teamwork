'use client';
import React, { Suspense, lazy, ComponentType } from 'react';
import { Spin } from 'antd';

interface LazyLoaderProps {
  component: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  fallback?: React.ReactNode;
  props?: Record<string, unknown>;
}

const LazyLoader: React.FC<LazyLoaderProps> = ({ 
  component, 
  fallback = <Spin size="large" />,
  props = {}
}) => {
  const LazyComponent = lazy(component);

  return (
    <Suspense fallback={fallback}>
      <LazyComponent {...props} />
    </Suspense>
  );
};

export default LazyLoader;

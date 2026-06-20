'use client';
import { ComponentType } from 'react';
import ProtectedRoute from './ProtectedRoute';

/**
 * Higher-Order Component for protecting pages with authentication
 * Usage: export default withAuth(MyPageComponent);
 */
export default function withAuth<P extends object>(Component: ComponentType<P>) {
  const AuthenticatedComponent = (props: P) => {
    return (
      <ProtectedRoute>
        <Component {...props} />
      </ProtectedRoute>
    );
  };

  // Set display name for debugging
  AuthenticatedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;

  return AuthenticatedComponent;
}

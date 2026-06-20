import React from 'react';
import { useStyleProfile } from '@/hooks/useStyleProfile';
import { StyleProfile } from '@/styles/profiles/styleProfiles';

interface StyledContainerProps {
  children: React.ReactNode;
  className?: string;
  type?: 'container' | 'surface' | 'card';
}

// Helper function to generate CSS classes from profile
export const getProfileClasses = (profile: StyleProfile, type: 'container' | 'surface' | 'card' = 'container') => {
  const baseClasses = {
    container: `${profile.spacing.container} bg-white`,
    surface: `${profile.spacing.card} ${profile.borderRadius.medium}`,
    card: `${profile.spacing.card} ${profile.borderRadius.medium} ${profile.colors.shadow} border`
  };

  return baseClasses[type];
};

// Helper function to get button classes
export const getButtonClasses = (
  profile: StyleProfile, 
  variant: 'primary' | 'secondary' | 'danger' = 'primary',
  additionalClasses: string = ''
) => {
  const buttonStyle = profile.colors.button[variant];
  return `${profile.spacing.button} ${buttonStyle.bg} ${buttonStyle.hover} ${buttonStyle.text} ${profile.borderRadius.medium} transition-colors flex items-center gap-2 font-medium ${profile.typography.buttonSize} ${additionalClasses}`;
};

const StyledContainer: React.FC<StyledContainerProps> = ({ 
  children, 
  className = '', 
  type = 'container' 
}) => {
  const { currentProfile } = useStyleProfile();
  
  const profileClasses = getProfileClasses(currentProfile, type);
  
  return (
    <div className={`${profileClasses} ${className}`}>
      {children}
    </div>
  );
};

export default StyledContainer;

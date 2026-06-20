'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Spin } from 'antd';
import styleProfilesModule from '@/styles/profiles/styleProfiles';

const { styleProfiles } = styleProfilesModule;

interface StyleProfileContextType {
  currentProfile: typeof styleProfiles[0];
  selectProfile: (profileId: string) => void;
  availableProfiles: typeof styleProfiles;
}

const StyleProfileContext = createContext<StyleProfileContextType | null>(null);

export function StyleProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfile] = useState(styleProfiles[0]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedProfileId = localStorage.getItem('userStyleProfile');
        if (savedProfileId) {
          const profile = styleProfiles.find(p => p.id === savedProfileId);
          if (profile) {
            setCurrentProfile(profile);
          }
        }
      } catch (error) {
        console.error('Error loading style profile:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const selectProfile = (profileId: string) => {
    try {
      const profile = styleProfiles.find(p => p.id === profileId);
      if (profile) {
        setCurrentProfile(profile);
        if (typeof window !== 'undefined') {
          localStorage.setItem('userStyleProfile', profileId);
        }
      }
    } catch (error) {
      console.error('Error saving style profile:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <StyleProfileContext.Provider value={{ currentProfile, selectProfile, availableProfiles: styleProfiles }}>
      {children}
    </StyleProfileContext.Provider>
  );
}

export function useStyleProfile() {
  const context = useContext(StyleProfileContext);
  if (!context) {
    throw new Error('useStyleProfile must be used within a StyleProfileProvider');
  }
  return context;
}
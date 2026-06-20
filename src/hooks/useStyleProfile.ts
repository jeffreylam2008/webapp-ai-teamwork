import { useState, useEffect } from 'react';
import { StyleProfile } from '@/styles/profiles/styleProfiles';
import styleProfilesModule from '@/styles/profiles/styleProfiles';

const { getStyleProfile, styleProfiles } = styleProfilesModule;

const STORAGE_KEY = 'userStyleProfile';

export const useStyleProfile = () => {
  const [currentProfile, setCurrentProfile] = useState<StyleProfile>(styleProfiles[0]);

  // Load saved profile from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedProfileId = localStorage.getItem(STORAGE_KEY);
        if (savedProfileId) {
          const profile = getStyleProfile(savedProfileId);
          setCurrentProfile(profile);
        }
      } catch (error) {
        console.error('Error loading style profile:', error);
      }
    }
  }, []);

  // Save profile to localStorage and update state
  const selectProfile = (profileId: string) => {
    try {
      const profile = getStyleProfile(profileId);
      setCurrentProfile(profile);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, profileId);
      }
    } catch (error) {
      console.error('Error saving style profile:', error);
    }
  };

  // Get all available profiles
  const availableProfiles = styleProfiles;

  return {
    currentProfile,
    selectProfile,
    availableProfiles
  };
};

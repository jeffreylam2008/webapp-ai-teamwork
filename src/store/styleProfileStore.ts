import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import styleProfilesModule from '@/styles/profiles/styleProfiles';
import { StyleProfile } from '@/styles/profiles/styleProfiles';

const { styleProfiles } = styleProfilesModule;

interface StyleProfileState {
  currentProfile: StyleProfile;
  selectProfile: (profileId: string) => void;
  availableProfiles: StyleProfile[];
}

export const useStyleProfileStore = create<StyleProfileState>()(
  persist(
    (set) => ({
      currentProfile: styleProfiles[0],
      availableProfiles: styleProfiles,
      selectProfile: (profileId: string) => {
        const profile = styleProfiles.find(p => p.id === profileId);
        if (profile) {
          set({ currentProfile: profile });
        }
      }
    }),
    {
      name: 'style-profile-storage'
    }
  )
);





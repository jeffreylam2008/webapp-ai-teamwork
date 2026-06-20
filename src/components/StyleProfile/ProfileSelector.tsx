import React from 'react';
import { Select, Card, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { useStyleProfile } from '@/hooks/useStyleProfile';

const { Option } = Select;

interface ProfileSelectorProps {
  className?: string;
  showLabel?: boolean;
}

const ProfileSelector: React.FC<ProfileSelectorProps> = ({ 
  className = '', 
  showLabel = true 
}) => {
  const { currentProfile, selectProfile, availableProfiles } = useStyleProfile();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <div className="flex items-center gap-1">
          <BgColorsOutlined />
          <span className="text-sm font-medium">Style:</span>
        </div>
      )}
      
      <Select
        value={currentProfile.id}
        onChange={selectProfile}
        style={{ minWidth: 140 }}
        size="small"
        dropdownRender={(menu) => (
          <div>
            {menu}
            <div className="border-t border-gray-200 mt-2 pt-2 px-2">
              <div className="text-xs text-gray-500 mb-2">
                Preview themes above
              </div>
            </div>
          </div>
        )}
      >
        {availableProfiles.map((profile) => (
          <Option key={profile.id} value={profile.id}>
            <div className="flex items-center justify-between">
              <span>{profile.name}</span>
              <div className="flex gap-1 ml-2">
                <div 
                  className="w-3 h-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: profile.colors.primary }}
                />
                <div 
                  className="w-3 h-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: profile.colors.accent }}
                />
              </div>
            </div>
          </Option>
        ))}
      </Select>
    </div>
  );
};

export default ProfileSelector;

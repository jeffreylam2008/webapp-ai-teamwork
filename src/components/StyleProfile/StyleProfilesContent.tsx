'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Row, Col, Button, Space, Typography, Alert, Divider } from 'antd';
import { BgColorsOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useStyleProfile } from '@/hooks/useStyleProfile';
import type { StyleProfile } from '@/styles/profiles/styleProfiles';
import StyledContainer from '@/components/StyleProfile/StyledContainer';

const { Title, Paragraph, Text } = Typography;

export default function StyleProfilesContent() {
  const router = useRouter();
  const { currentProfile, selectProfile, availableProfiles } = useStyleProfile();
  const [previewProfile, setPreviewProfile] = useState<StyleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectProfile = (profileId: string) => {
    selectProfile(profileId);
    setPreviewProfile(null);
  };

  const handlePreview = (profile: StyleProfile) => {
    setPreviewProfile(profile);
  };

  const clearPreview = () => {
    setPreviewProfile(null);
  };

  // Use preview profile if available, otherwise current profile
  const displayProfile = previewProfile || currentProfile;

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Style Profiles</h1>
        <p className="text-gray-700">{error}</p>
      </div>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: 'Home', href: '/' },
            { label: 'System Administration', current: true },
            { label: 'Settings', href: '/administration/settings' },
            { label: 'Style Profiles', current: true }
          ]} 
        />
      }
      title="Style Profile Settings"
      description="Customize the visual appearance and theme of your application"
    >
      <StyledContainer type="container">
        
        {/* Current Profile Info */}
        <Alert
          message={
            <div className="flex items-center justify-between">
              <div>
                <strong>Current Profile:</strong> {currentProfile.name}
                <span className="ml-2 text-gray-600">({currentProfile.description})</span>
              </div>
              <div className="flex gap-2">
                <div 
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: currentProfile.colors.primary }}
                />
                <div 
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: currentProfile.colors.accent }}
                />
              </div>
            </div>
          }
          type="info"
          className="mb-6"
        />

        {/* Preview Section */}
        {previewProfile && (
          <Alert
            message={
              <div className="flex items-center justify-between">
                <div>
                  <strong>Previewing:</strong> {previewProfile.name}
                  <span className="ml-2 text-gray-600">({previewProfile.description})</span>
                </div>
                <Button onClick={clearPreview} size="small">
                  Exit Preview
                </Button>
              </div>
            }
            type="warning"
            className="mb-6"
          />
        )}

        {/* Live Preview Area */}
        <Card 
          title="Live Preview" 
          className="mb-8"
          style={{ 
            backgroundColor: displayProfile.colors.surface,
            borderColor: displayProfile.colors.border 
          }}
        >
          <div style={{ backgroundColor: displayProfile.colors.background }} className="p-6 rounded-lg">
            <Title 
              level={3} 
              className={displayProfile.typography.titleSize}
              style={{ color: displayProfile.colors.text.primary, fontWeight: displayProfile.typography.titleWeight }}
            >
              Sample Page Header
            </Title>
            <Paragraph 
              className={displayProfile.typography.bodySize}
              style={{ color: displayProfile.colors.text.secondary }}
            >
              This is how your content will look with the selected profile. You can see the typography, colors, and spacing in action.
            </Paragraph>
            
            <Space className="mt-4">
              <button 
                className={`${displayProfile.spacing.button} ${displayProfile.colors.button.primary.bg} ${displayProfile.colors.button.primary.hover} ${displayProfile.colors.button.primary.text} ${displayProfile.borderRadius.medium} transition-colors font-medium ${displayProfile.typography.buttonSize}`}
              >
                Primary Button
              </button>
              <button 
                className={`${displayProfile.spacing.button} ${displayProfile.colors.button.secondary.bg} ${displayProfile.colors.button.secondary.hover} ${displayProfile.colors.button.secondary.text} ${displayProfile.borderRadius.medium} transition-colors font-medium ${displayProfile.typography.buttonSize}`}
              >
                Secondary Button
              </button>
            </Space>
          </div>
        </Card>

        <Divider>Available Style Profiles</Divider>

        {/* Profile Selection Grid */}
        <Row gutter={[24, 24]}>
          {availableProfiles.map((profile) => (
            <Col xs={24} md={12} lg={8} key={profile.id}>
              <Card
                hoverable
                className={`transition-all duration-200 ${
                  currentProfile.id === profile.id 
                    ? 'border-2 border-blue-500 shadow-lg' 
                    : 'hover:shadow-md'
                }`}
                style={{ 
                  backgroundColor: profile.colors.surface,
                  borderColor: profile.colors.border 
                }}
                actions={[
                  <Button
                    key="preview"
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(profile)}
                    disabled={previewProfile?.id === profile.id}
                  >
                    {previewProfile?.id === profile.id ? 'Previewing' : 'Preview'}
                  </Button>,
                  <Button
                    key="select"
                    type="primary"
                    icon={currentProfile.id === profile.id ? <CheckOutlined /> : <BgColorsOutlined />}
                    onClick={() => handleSelectProfile(profile.id)}
                    disabled={currentProfile.id === profile.id}
                  >
                    {currentProfile.id === profile.id ? 'Active' : 'Apply'}
                  </Button>
                ]}
              >
                <div className="text-center">
                  {/* Color Palette */}
                  <div className="flex justify-center gap-2 mb-4">
                    <div 
                      className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                      style={{ backgroundColor: profile.colors.primary }}
                      title="Primary Color"
                    />
                    <div 
                      className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                      style={{ backgroundColor: profile.colors.secondary }}
                      title="Secondary Color"
                    />
                    <div 
                      className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                      style={{ backgroundColor: profile.colors.accent }}
                      title="Accent Color"
                    />
                  </div>

                  <Title 
                    level={4} 
                    className="mb-2"
                    style={{ color: profile.colors.text.primary }}
                  >
                    {profile.name}
                  </Title>
                  <Paragraph 
                    className="text-sm mb-4"
                    style={{ color: profile.colors.text.secondary }}
                  >
                    {profile.description}
                  </Paragraph>

                  {/* Sample Elements */}
                  <div className="space-y-2">
                    <div 
                      className={`text-xs p-2 ${profile.borderRadius.small}`}
                      style={{ 
                        backgroundColor: profile.colors.background,
                        color: profile.colors.text.primary,
                        border: `1px solid ${profile.colors.border}`
                      }}
                    >
                      Sample Content Area
                    </div>
                    <button 
                      className={`text-xs ${profile.spacing.button} ${profile.colors.button.primary.bg} ${profile.colors.button.primary.text} ${profile.borderRadius.medium} transition-colors font-medium`}
                      style={{ width: '100%' }}
                    >
                      Sample Button
                    </button>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Profile Details */}
        <Divider>Profile Information</Divider>
        <Card title={`${displayProfile.name} Details`} className="mt-6">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Title level={5}>Colors</Title>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: displayProfile.colors.primary }}
                  />
                  <Text code>Primary: {displayProfile.colors.primary}</Text>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: displayProfile.colors.secondary }}
                  />
                  <Text code>Secondary: {displayProfile.colors.secondary}</Text>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: displayProfile.colors.accent }}
                  />
                  <Text code>Accent: {displayProfile.colors.accent}</Text>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <Title level={5}>Typography</Title>
              <div className="space-y-2">
                <Text>Title Size: <Text code>{displayProfile.typography.titleSize}</Text></Text><br/>
                <Text>Title Weight: <Text code>{displayProfile.typography.titleWeight}</Text></Text><br/>
                <Text>Body Size: <Text code>{displayProfile.typography.bodySize}</Text></Text><br/>
                <Text>Button Size: <Text code>{displayProfile.typography.buttonSize}</Text></Text>
              </div>
            </Col>
          </Row>
        </Card>
      </StyledContainer>
    </BasicPageLayout>
  );
}

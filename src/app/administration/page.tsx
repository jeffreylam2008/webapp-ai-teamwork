'use client';

import { Card, Col, Row, Typography } from 'antd';
import { IdcardOutlined, SettingOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';

const { Title, Paragraph } = Typography;

export default function AdministrationHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).administrationHub;

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            {
              label: bc.administration,
              href: '/administration',
              menuItems: [
                { label: bc.users, href: '/administration/users' },
                { label: bc.settings, href: '/administration/settings' },
                { label: bc.importExport, href: '/administration/master-data' },
                { label: bc.system, href: '/administration/settings/system' },
                { label: bc.profile, href: '/administration/profile' },
              ],
              current: true,
            },
          ]}
        />
      }
      title={t.title}
      description={t.description}
    >
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/users')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <UserOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.usersTitle}</Title>
                <Paragraph>{t.usersDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <SettingOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.settingsTitle}</Title>
                <Paragraph>{t.settingsDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/master-data')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <UploadOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.importTitle}</Title>
                <Paragraph>{t.importDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings/system')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <SettingOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.systemTitle}</Title>
                <Paragraph>{t.systemDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/profile')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <IdcardOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.profileTitle}</Title>
                <Paragraph>{t.profileDesc}</Paragraph>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </BasicPageLayout>
  );
}


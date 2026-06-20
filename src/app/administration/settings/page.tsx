'use client';
import { Typography, Card, Row, Col } from 'antd';
import {
  EnvironmentOutlined,
  NumberOutlined,
  CreditCardOutlined,
  CalendarOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';

const { Title, Paragraph } = Typography;

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).settingsHub;

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
              ],
            },
            { label: bc.settings, current: true }
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
              onClick={() => router.push('/administration/settings/district')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <EnvironmentOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.districtsTitle}</Title>
                <Paragraph>
                  {t.districtsDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings/prefix')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <NumberOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.prefixesTitle}</Title>
                <Paragraph>
                  {t.prefixesDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings/payment-method')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <CreditCardOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.paymentMethodsTitle}</Title>
                <Paragraph>
                  {t.paymentMethodsDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings/payment-term')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <CalendarOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.paymentTermsTitle}</Title>
                <Paragraph>
                  {t.paymentTermsDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/administration/settings/shops')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <ShopOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.shopsTitle}</Title>
                <Paragraph>
                  {t.shopsDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </BasicPageLayout>
  );
}
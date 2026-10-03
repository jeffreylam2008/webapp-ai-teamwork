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
import { usePermissions } from '@/hooks/usePermissions';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { canAccessSettingsMenu } from '@/config/transactionPermissions';

const { Title, Paragraph } = Typography;

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).settingsHub;
  const { can, loading: permissionsLoading } = usePermissions();
  const canViewSettings = canAccessSettingsMenu(can);

  const cards = [
    {
      key: 'district',
      href: '/administration/settings/district',
      icon: <EnvironmentOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.districtsTitle,
      desc: t.districtsDesc,
      visible: can('view_district'),
    },
    {
      key: 'prefix',
      href: '/administration/settings/prefix',
      icon: <NumberOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.prefixesTitle,
      desc: t.prefixesDesc,
      visible: can('view_prefix'),
    },
    {
      key: 'payment-method',
      href: '/administration/settings/payment-method',
      icon: <CreditCardOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.paymentMethodsTitle,
      desc: t.paymentMethodsDesc,
      visible: can('view_payment_method'),
    },
    {
      key: 'payment-term',
      href: '/administration/settings/payment-term',
      icon: <CalendarOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.paymentTermsTitle,
      desc: t.paymentTermsDesc,
      visible: can('view_payment_term'),
    },
    {
      key: 'shops',
      href: '/administration/settings/shops',
      icon: <ShopOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.shopsTitle,
      desc: t.shopsDesc,
      visible: can('view_shop'),
    },
  ].filter((c) => c.visible);

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
                ...(canViewSettings
                  ? [{ label: bc.settings, href: '/administration/settings' }]
                  : []),
                ...(can('view_master_data')
                  ? [{ label: bc.importExport, href: '/administration/master-data' }]
                  : []),
              ],
            },
            { label: bc.settings, current: true },
          ]}
        />
      }
      title={t.title}
      description={t.description}
    >
      {permissionsLoading ? (
        <div className="px-8 py-16 flex justify-center">
          <span className="text-gray-500">…</span>
        </div>
      ) : !canViewSettings ? (
        <div className="px-8 py-6 text-gray-600">
          {lang === 'zh-Hant' ? '您沒有權限檢視此頁面。' : 'You do not have permission to view this page.'}
        </div>
      ) : (
        <div className="px-8 py-6 bg-white">
          <Row gutter={[24, 24]}>
            {cards.map((card) => (
              <Col key={card.key} xs={24} md={8}>
                <Card
                  hoverable
                  onClick={() => router.push(card.href)}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg"
                >
                  <div className="text-center">
                    {card.icon}
                    <Title level={3}>{card.title}</Title>
                    <Paragraph>{card.desc}</Paragraph>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </BasicPageLayout>
  );
}

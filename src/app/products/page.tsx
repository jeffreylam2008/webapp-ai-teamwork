'use client';
import { Typography, Card, Row, Col, Spin } from 'antd';
import { AppstoreOutlined, TagsOutlined, ClusterOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';

const { Title, Paragraph } = Typography;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).productsHub;
  const { can, loading: permissionsLoading } = usePermissions();

  const cards = [
    {
      key: 'items',
      href: '/products/items',
      icon: <AppstoreOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />,
      title: t.cardItemsTitle,
      desc: t.cardItemsDesc,
      visible: can('view_item'),
    },
    {
      key: 'categories',
      href: '/products/categories',
      icon: <TagsOutlined style={{ fontSize: '48px', color: '#52c41a', marginBottom: '16px' }} />,
      title: t.cardCategoriesTitle,
      desc: t.cardCategoriesDesc,
      visible: can('view_category'),
    },
    {
      key: 'item-types',
      href: '/products/item-types',
      icon: <ClusterOutlined style={{ fontSize: '48px', color: '#722ed1', marginBottom: '16px' }} />,
      title: t.cardItemTypesTitle,
      desc: t.cardItemTypesDesc,
      visible: can('view_item_type'),
    },
  ].filter((c) => c.visible);

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            { label: bc.products, current: true },
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
              onClick={() => router.push('/products/items')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <AppstoreOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.cardItemsTitle}</Title>
                <Paragraph>{t.cardItemsDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/products/categories')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <TagsOutlined style={{ fontSize: '48px', color: '#52c41a', marginBottom: '16px' }} />
                <Title level={3}>{t.cardCategoriesTitle}</Title>
                <Paragraph>{t.cardCategoriesDesc}</Paragraph>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              hoverable
              onClick={() => router.push('/products/item-types')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <ClusterOutlined style={{ fontSize: '48px', color: '#722ed1', marginBottom: '16px' }} />
                <Title level={3}>{t.cardItemTypesTitle}</Title>
                <Paragraph>{t.cardItemTypesDesc}</Paragraph>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </BasicPageLayout>
  );
}

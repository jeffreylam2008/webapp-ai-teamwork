'use client';
import { Typography, Card, Row, Col } from 'antd';
import { AppstoreOutlined, TagsOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';

const { Title, Paragraph } = Typography;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).productsHub;

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: bc.home, href: '/' },
            { label: bc.products, current: true }
          ]} 
        />
      }
      title={t.title}
      description={t.description}
    >
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card 
              hoverable 
              onClick={() => router.push('/products/items')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <AppstoreOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>{t.cardItemsTitle}</Title>
                <Paragraph>
                  {t.cardItemsDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
          
          <Col xs={24} md={12}>
            <Card 
              hoverable 
              onClick={() => router.push('/products/categories')}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg"
            >
              <div className="text-center">
                <TagsOutlined style={{ fontSize: '48px', color: '#52c41a', marginBottom: '16px' }} />
                <Title level={3}>{t.cardCategoriesTitle}</Title>
                <Paragraph>
                  {t.cardCategoriesDesc}
                </Paragraph>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </BasicPageLayout>
  );
}   
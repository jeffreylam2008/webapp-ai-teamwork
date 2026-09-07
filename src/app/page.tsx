'use client';

import { Suspense, useEffect, useMemo, useState, Fragment, type ReactNode, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AppstoreOutlined,
  BarChartOutlined,
  DollarOutlined,
  FileTextOutlined,
  InboxOutlined,
  RightOutlined,
  DownOutlined,
  ShoppingOutlined,
  ShopOutlined,
  TeamOutlined,
  TruckOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Spin, Statistic, Typography } from 'antd';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import {
  canAccessWarehouseStockMenu,
} from '@/config/transactionPermissions';
import { formatCurrency } from '@/utils/formatCurrency';

const { Title, Paragraph, Text } = Typography;

type DashboardMetrics = {
  month_sales: number | null;
  invoice_count: number | null;
  supplier_count: number | null;
  customer_count: number | null;
  user_count: number | null;
  warehouse_pending: number | null;
  draft_sales_orders: number | null;
  purchase_orders_month: number | null;
};

type DashboardPermissions = {
  sales: boolean;
  warehouse: boolean;
  sales_order: boolean;
  purchase: boolean;
  sales_report: boolean;
  warehouse_report: boolean;
  invoice: boolean;
  quotation: boolean;
  grn: boolean;
  delivery_note: boolean;
  adjustment: boolean;
  stocktake: boolean;
};

type DashboardResponse = {
  success: boolean;
  period?: { start_date: string; end_date: string };
  metrics?: DashboardMetrics;
  permissions?: DashboardPermissions;
  error?: string;
};

type WorkflowLink = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  color: string;
  visible: boolean;
};

type MetricCard = {
  key: string;
  title: string;
  value: number | null;
  href: string;
  formatter?: (value: number) => string;
  valueStyle?: CSSProperties;
  visible: boolean;
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const t = getHubPagesTexts(lang).home;
  const { token, loading: authLoading } = useAuth();
  const { can, loading: permLoading } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [apiPermissions, setApiPermissions] = useState<DashboardPermissions | null>(null);
  const [periodLabel, setPeriodLabel] = useState('');

  useEffect(() => {
    if (authLoading || !token) return;

    const run = async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth('/api/dashboard/summary', token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const json = (await res.json()) as DashboardResponse;
        if (json.success && json.metrics) {
          setMetrics(json.metrics);
          setApiPermissions(json.permissions || null);
          if (json.period) {
            setPeriodLabel(`${json.period.start_date} — ${json.period.end_date}`);
          }
        } else {
          setMetrics(null);
        }
      } catch {
        setMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, token]);

  const showWarehouse = canAccessWarehouseStockMenu(can) || can('view_delivery_note');

  const metricCards: MetricCard[] = useMemo(
    () => [
      {
        key: 'sales',
        title: t.metrics.monthSales,
        value: metrics?.month_sales ?? null,
        href: can('view_sales_report') ? '/reports/sales' : '/sales/invoices',
        formatter: (v) => formatCurrency(v),
        visible:
          (apiPermissions?.sales ?? (can('view_sales_report') || can('view_invoice'))) &&
          metrics?.month_sales != null,
      },
      {
        key: 'invoices',
        title: t.metrics.invoices,
        value: metrics?.invoice_count ?? null,
        href: '/sales/invoices',
        visible: (apiPermissions?.sales ?? can('view_invoice')) && metrics?.invoice_count != null,
      },
      {
        key: 'suppliers',
        title: t.metrics.suppliers,
        value: metrics?.supplier_count ?? null,
        href: '/suppliers',
        visible: metrics?.supplier_count != null,
      },
      {
        key: 'customers',
        title: t.metrics.customers,
        value: metrics?.customer_count ?? null,
        href: '/customers',
        visible: metrics?.customer_count != null,
      },
      {
        key: 'users',
        title: t.metrics.users,
        value: metrics?.user_count ?? null,
        href: '/administration/users',
        visible: metrics?.user_count != null,
      },
      {
        key: 'warehousePending',
        title: t.metrics.warehousePending,
        value: metrics?.warehouse_pending ?? null,
        href: '/warehouse/stock',
        valueStyle:
          (metrics?.warehouse_pending ?? 0) > 0 ? { color: '#cf1322' } : { color: '#3f8600' },
        visible: showWarehouse && metrics?.warehouse_pending != null,
      },
      {
        key: 'draftSo',
        title: t.metrics.draftSalesOrders,
        value: metrics?.draft_sales_orders ?? null,
        href: '/sales/orders',
        visible: can('view_sales_order') && metrics?.draft_sales_orders != null,
      },
      {
        key: 'po',
        title: t.metrics.purchaseOrders,
        value: metrics?.purchase_orders_month ?? null,
        href: '/purchasing/purchases',
        visible: can('view_po') && metrics?.purchase_orders_month != null,
      },
    ],
    [metrics, apiPermissions, can, showWarehouse, t]
  );

  const visibleMetrics = metricCards.filter((c) => c.visible);

  const workflowGroups = useMemo(() => {
    const quotationLink: WorkflowLink = {
      key: 'quotations',
      title: t.links.quotations,
      description: t.links.quotationsDesc,
      href: '/sales/quotations',
      icon: <DollarOutlined />,
      color: '#722ed1',
      visible: can('view_quotation'),
    };
    const salesOrderLink: WorkflowLink = {
      key: 'orders',
      title: t.links.salesOrders,
      description: t.links.salesOrdersDesc,
      href: '/sales/orders',
      icon: <ShoppingOutlined />,
      color: '#13c2c2',
      visible: can('view_sales_order'),
    };
    const invoiceLink: WorkflowLink = {
      key: 'invoices',
      title: t.links.invoices,
      description: t.links.invoicesDesc,
      href: '/sales/invoices',
      icon: <FileTextOutlined />,
      color: '#1890ff',
      visible: can('view_invoice'),
    };
    const deliveryNoteLink: WorkflowLink = {
      key: 'dn',
      title: t.links.deliveryNote,
      description: t.links.deliveryNoteDesc,
      href: '/warehouse/delivery-note',
      icon: <TruckOutlined />,
      color: '#eb2f96',
      visible: can('view_delivery_note') || can('create_delivery_note'),
    };

    const salesMainLinks = [quotationLink, salesOrderLink, invoiceLink].filter((l) => l.visible);
    const salesDeliveryBranch = deliveryNoteLink.visible ? deliveryNoteLink : null;

    const purchaseOrderLink: WorkflowLink = {
      key: 'purchases',
      title: t.links.purchases,
      description: t.links.purchasesDesc,
      href: '/purchasing/purchases',
      icon: <ShopOutlined />,
      color: '#fa8c16',
      visible: can('view_po'),
    };
    const grnLink: WorkflowLink = {
      key: 'grn',
      title: t.links.grn,
      description: t.links.grnDesc,
      href: '/warehouse/stock/grn',
      icon: <InboxOutlined />,
      color: '#2f54eb',
      visible: can('view_grn') || can('create_grn'),
    };
    const warehouseStockLink: WorkflowLink = {
      key: 'stock',
      title: t.links.warehouseStock,
      description: t.links.warehouseStockDesc,
      href: '/warehouse/stock',
      icon: <InboxOutlined />,
      color: '#52c41a',
      visible: showWarehouse,
    };

    // 採購單 → 收貨單 → 倉庫庫存
    const purchasingFlowLinks: WorkflowLink[] = [];
    if (purchaseOrderLink.visible) {
      purchasingFlowLinks.push(purchaseOrderLink);
      if (grnLink.visible) {
        purchasingFlowLinks.push(grnLink);
        if (warehouseStockLink.visible) {
          purchasingFlowLinks.push(warehouseStockLink);
        }
      }
    }
    const stockInPurchasingFlow = purchasingFlowLinks.some((l) => l.key === 'stock');

    const warehouseLinks: WorkflowLink[] = [
      {
        key: 'stock',
        title: t.links.warehouseStock,
        description: t.links.warehouseStockDesc,
        href: '/warehouse/stock',
        icon: <InboxOutlined />,
        color: '#52c41a',
        visible: showWarehouse && !stockInPurchasingFlow,
      },
      // Show DN under warehouse only when it is not already branched under sales order
      {
        key: 'dn',
        title: t.links.deliveryNote,
        description: t.links.deliveryNoteDesc,
        href: '/warehouse/delivery-note',
        icon: <TruckOutlined />,
        color: '#eb2f96',
        visible:
          !salesOrderLink.visible &&
          (can('view_delivery_note') || can('create_delivery_note')),
      },
      // Show GRN under warehouse only when it is not already in the purchasing flow
      {
        key: 'grn',
        title: t.links.grn,
        description: t.links.grnDesc,
        href: '/warehouse/stock/grn',
        icon: <InboxOutlined />,
        color: '#2f54eb',
        visible:
          !purchaseOrderLink.visible &&
          (can('view_grn') || can('create_grn')),
      },
    ];

    const reportLinks: WorkflowLink[] = [
      {
        key: 'sales-report',
        title: t.links.salesReport,
        description: t.links.salesReportDesc,
        href: '/reports/sales',
        icon: <BarChartOutlined />,
        color: '#1890ff',
        visible: can('view_sales_report'),
      },
      {
        key: 'warehouse-report',
        title: t.links.warehouseReport,
        description: t.links.warehouseReportDesc,
        href: '/reports/warehouse',
        icon: <BarChartOutlined />,
        color: '#52c41a',
        visible: can('view_warehouse_report'),
      },
    ];

    const masterLinks: WorkflowLink[] = [
      {
        key: 'customers',
        title: t.links.customers,
        description: t.links.customersDesc,
        href: '/customers',
        icon: <TeamOutlined />,
        color: '#1890ff',
        visible: true,
      },
      {
        key: 'suppliers',
        title: t.links.suppliers,
        description: t.links.suppliersDesc,
        href: '/suppliers',
        icon: <UserSwitchOutlined />,
        color: '#fa8c16',
        visible: true,
      },
      {
        key: 'products',
        title: t.links.products,
        description: t.links.productsDesc,
        href: '/products/items',
        icon: <AppstoreOutlined />,
        color: '#13c2c2',
        visible: true,
      },
    ];

    const adminLinks: WorkflowLink[] = [
      {
        key: 'users',
        title: t.links.users,
        description: t.links.usersDesc,
        href: '/administration/users',
        icon: <UserOutlined />,
        color: '#595959',
        visible: true,
      },
    ];

    return {
      salesFlow: {
        title: t.workflowGroups.sales,
        mainLinks: salesMainLinks,
        /** Branch under sales order: SO ↓ Delivery note */
        deliveryFromOrders: salesOrderLink.visible ? salesDeliveryBranch : null,
      },
      purchasingFlow: {
        title: t.workflowGroups.purchasing,
        /** Purchase order → Goods received → Warehouse stock */
        links: purchasingFlowLinks,
      },
      otherGroups: [
        {
          key: 'warehouse',
          title: t.workflowGroups.warehouse,
          links: warehouseLinks.filter((l) => l.visible),
        },
        {
          key: 'reports',
          title: t.workflowGroups.reports,
          links: reportLinks.filter((l) => l.visible),
        },
        {
          key: 'master',
          title: t.workflowGroups.masterData,
          links: masterLinks.filter((l) => l.visible),
        },
        {
          key: 'admin',
          title: t.workflowGroups.administration,
          links: adminLinks.filter((l) => l.visible),
        },
      ].filter((g) => g.links.length > 0),
    };
  }, [can, showWarehouse, t]);

  const renderWorkflowCard = (link: WorkflowLink) => (
    <Card
      hoverable
      className="cursor-pointer h-full w-full transition-all duration-200 hover:shadow-md"
      onClick={() => router.push(link.href)}
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex items-center justify-center rounded-lg shrink-0"
          style={{
            width: 44,
            height: 44,
            background: `${link.color}14`,
            color: link.color,
            fontSize: 22,
          }}
        >
          {link.icon}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 mb-1">{link.title}</div>
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }} ellipsis={{ rows: 2 }}>
            {link.description}
          </Paragraph>
        </div>
      </div>
    </Card>
  );

  /** Same breakpoints as warehouse stock cards (倉庫庫存). */
  const workflowCardColProps = { xs: 24 as const, sm: 12 as const, lg: 8 as const, xl: 6 as const };

  const renderFlowArrow = (direction: 'right' | 'down' = 'right') => (
    <div
      className={`flex items-center justify-center shrink-0 text-gray-400 ${
        direction === 'down' ? 'py-1 w-full' : 'py-1 sm:py-0 sm:px-1 sm:h-full sm:min-h-[72px]'
      }`}
      aria-hidden
    >
      {direction === 'down' ? (
        <DownOutlined className="text-lg" />
      ) : (
        <RightOutlined className="rotate-90 sm:rotate-0 text-lg" />
      )}
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={[{ label: bc.home, current: true }]} />}
      title={t.title}
      description={t.description}
    >
      <Spin spinning={loading || authLoading || permLoading}>
        <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-8">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <Title level={4} style={{ margin: 0 }}>
                {t.overview}
              </Title>
              {periodLabel ? (
                <Text type="secondary">
                  {t.periodThisMonth}: {periodLabel}
                </Text>
              ) : null}
            </div>

            {visibleMetrics.length === 0 && !loading ? (
              <Card size="small">
                <Text type="secondary">{t.failedLoad}</Text>
              </Card>
            ) : (
              <Row gutter={[12, 12]}>
                {visibleMetrics.map((card) => (
                  <Col key={card.key} xs={24} sm={12} lg={6}>
                    <Card
                      size="small"
                      hoverable
                      className="cursor-pointer h-full"
                      onClick={() => router.push(card.href)}
                    >
                      <Statistic
                        title={card.title}
                        value={card.value ?? 0}
                        formatter={
                          card.formatter
                            ? (value) => card.formatter!(Number(value))
                            : undefined
                        }
                        valueStyle={card.valueStyle}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </section>

          <section>
            <Title level={4} style={{ marginBottom: 16 }}>
              {t.workflow}
            </Title>
            <div className="space-y-6">
              {(workflowGroups.salesFlow.mainLinks.length > 0 ||
                workflowGroups.salesFlow.deliveryFromOrders) && (
                <div>
                  <Text strong className="block mb-3 text-gray-700">
                    {workflowGroups.salesFlow.title}
                  </Text>
                  <Row gutter={[16, 16]} align="top">
                    {workflowGroups.salesFlow.mainLinks.map((link, index) => {
                      const showDeliveryBranch =
                        link.key === 'orders' && !!workflowGroups.salesFlow.deliveryFromOrders;
                      return (
                        <Fragment key={link.key}>
                          <Col {...workflowCardColProps}>
                            <div className="flex flex-col h-full">
                              {renderWorkflowCard(link)}
                              {showDeliveryBranch ? (
                                <div className="flex flex-col items-center mt-2">
                                  {renderFlowArrow('down')}
                                  <div className="w-full">
                                    {renderWorkflowCard(workflowGroups.salesFlow.deliveryFromOrders!)}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </Col>
                          {index < workflowGroups.salesFlow.mainLinks.length - 1 ? (
                            <Col
                              xs={24}
                              sm={24}
                              lg={1}
                              xl={1}
                              className="flex items-center justify-center !max-w-none"
                              flex="none"
                            >
                              {renderFlowArrow('right')}
                            </Col>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </Row>
                </div>
              )}

              {workflowGroups.purchasingFlow.links.length > 0 && (
                <div>
                  <Text strong className="block mb-3 text-gray-700">
                    {workflowGroups.purchasingFlow.title}
                  </Text>
                  <Row gutter={[16, 16]} align="middle">
                    {workflowGroups.purchasingFlow.links.map((link, index) => (
                      <Fragment key={link.key}>
                        <Col {...workflowCardColProps}>{renderWorkflowCard(link)}</Col>
                        {index < workflowGroups.purchasingFlow.links.length - 1 ? (
                          <Col
                            xs={24}
                            sm={24}
                            lg={1}
                            xl={1}
                            className="flex items-center justify-center !max-w-none"
                            flex="none"
                          >
                            {renderFlowArrow('right')}
                          </Col>
                        ) : null}
                      </Fragment>
                    ))}
                  </Row>
                </div>
              )}

              {workflowGroups.otherGroups.map((group) => (
                <div key={group.key}>
                  <Text strong className="block mb-3 text-gray-700">
                    {group.title}
                  </Text>
                  <Row gutter={[16, 16]}>
                    {group.links.map((link) => (
                      <Col key={link.key} {...workflowCardColProps}>
                        {renderWorkflowCard(link)}
                      </Col>
                    ))}
                  </Row>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Spin>
    </BasicPageLayout>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-16 flex justify-center">
          <Spin size="large" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

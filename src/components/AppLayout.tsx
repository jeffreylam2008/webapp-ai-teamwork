'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isDebugEnabled } from "@/config/app-config";
import { Layout, Menu, Button, Dropdown, Avatar, Space, ConfigProvider, App } from 'antd';
import type { MenuProps } from 'antd';
import { 
  HomeOutlined, 
  AppstoreOutlined, 
  FolderOutlined, 
  FolderOpenOutlined,
  CreditCardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  BugOutlined,
  TeamOutlined,
  ShopOutlined,
  UserSwitchOutlined,
  InboxOutlined,
  TruckOutlined,
  DollarOutlined,
  ShoppingOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import SystemLogo from '@/components/SystemLogo';
import { fetchSystemBranding, pickSystemLogo } from '@/lib/systemBranding';
import { shopLogoBase64ToDataUrl } from '@/lib/itemImageDisplay';
import { getMenuLabel } from '@/lib/i18n/menu';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAntdLocale } from '@/lib/i18n/antdLocale';
import { AppSpinIndicator } from '@/components/AppSpinIndicator';
import PageTransitionOverlay from '@/components/PageTransitionOverlay';
import PageLoadingCenter from '@/components/PageLoadingCenter';
import menuData from "@/data/base-menu.json";
import { useAuth } from '@/contexts/AuthContext';
import { useAppLanguage } from '@/contexts/LanguageContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { useCurrentWarehouse } from '@/hooks/useCurrentWarehouse';
import {
  MENU_PATH_VIEW_PERMISSION,
  canAccessWarehouseStockMenu,
} from '@/config/transactionPermissions';
import {
  getMenuHrefsBlockedByDisabledPlugins,
  PLUGIN_ENABLED_CHANGED_EVENT,
  readPluginEnabledMap,
  type PluginEnabledMap,
} from '@install/plugins';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 256;
/** iPad portrait and smaller tablets — overlay drawer instead of inline sider */
const COMPACT_LAYOUT_MQ = '(max-width: 1024px)';
const APP_FONT_FAMILY = 'var(--font-geist-sans), Arial, Helvetica, sans-serif';

type MenuDataItem = {
  key: string;
  label: string;
  icon?: string;
  href?: string;
  order?: number;
  submenu?: MenuDataItem[];
};

function filterMenuByPermission(
  items: MenuDataItem[],
  can: (key: string) => boolean,
  pathPerm: Record<string, string>,
  blockedHrefs?: Set<string>,
  options?: { isAdministrator?: boolean }
): MenuDataItem[] {
  const isAdministrator = options?.isAdministrator === true;
  return items
    .map((item) => {
      if (item.submenu) {
        const filteredSub = filterMenuByPermission(
          item.submenu,
          can,
          pathPerm,
          blockedHrefs,
          options
        );
        // Non-admin: Users group with only the user-list left → show Users as a leaf
        if (
          filteredSub.length === 1 &&
          item.href &&
          filteredSub[0].href === item.href
        ) {
          const { submenu: _submenu, ...leaf } = item;
          return leaf;
        }
        if (filteredSub.length === 0) {
          if (item.href) {
            const { submenu: _submenu, ...leaf } = item;
            return leaf;
          }
          return null;
        }
        return { ...item, submenu: filteredSub };
      }
      if (item.href) {
        if (blockedHrefs?.has(item.href)) return null;
        if (item.href === '/administration/roles' && !isAdministrator) return null;
        if (item.href === '/warehouse/stock') {
          if (!canAccessWarehouseStockMenu(can)) return null;
        } else {
          const perm = pathPerm[item.href];
          if (perm && !can(perm)) return null;
        }
      }
      return item;
    })
    .filter((x): x is MenuDataItem => x != null);
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function MinimalChrome({ children }: { children: React.ReactNode }) {
  const { language } = useAppLanguage();
  const antdLocale = useMemo(() => getAntdLocale(language), [language]);

  return (
    <ConfigProvider
      locale={antdLocale}
      spin={{ indicator: <AppSpinIndicator /> }}
      theme={{
        token: {
          fontFamily: APP_FONT_FAMILY,
          borderRadius: 6,
        },
      }}
    >
      <App message={{ top: 16 }}>{children}</App>
    </ConfigProvider>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout, token, isAuthenticated, loading: authLoading } = useAuth();
  const { language: appLanguage, ready: languageReady } = useAppLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const { can, isAdministrator, loading: permissionsLoading } = usePermissions();
  const [mounted, setMounted] = useState(false);

  // Check if current page is login page
  const isLoginPage = pathname === '/login';
  // Print preview: no sidebar or header (new window shows only the print template)
  const isPrintPreviewPage = pathname.includes('/print/');
  // Install / plugin lab: full page, no app chrome (open by URL only)
  const isInstallPage = pathname === '/install' || pathname.startsWith('/install/');
  // Session cleared or verify failed (e.g. expired token): no sidebar/header while redirecting to login
  const isUnauthenticatedSettled = !isAuthenticated && !authLoading;
  
  // IMPORTANT: keep initial render deterministic to avoid hydration mismatch.
  // We'll load the persisted sidebar state from localStorage after mount.
  const [collapsed, setCollapsed] = useState(true);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [pageNavigating, setPageNavigating] = useState(false);
  const [systemLogo, setSystemLogo] = useState<string>(pickSystemLogo({}));
  const resizerRef = useRef<HTMLDivElement>(null);
  const isCompactLayoutRef = useRef(false);
  const bc = useMemo(() => getBreadcrumbLabels(appLanguage), [appLanguage]);
  const antdLocale = useMemo(() => getAntdLocale(appLanguage), [appLanguage]);
  const isWarehouseSection = pathname.startsWith('/warehouse');
  const currentWarehouse = useCurrentWarehouse(isWarehouseSection);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pageNavigating) return;
    const id = window.setTimeout(() => setPageNavigating(false), 150);
    return () => window.clearTimeout(id);
  }, [pathname, pageNavigating]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(COMPACT_LAYOUT_MQ);
    const apply = () => {
      const compact = mq.matches;
      isCompactLayoutRef.current = compact;
      setIsCompactLayout(compact);
      if (compact) {
        setCollapsed(true);
        setOpenKeys([]);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Load system logo from t_systems; prefer current shop logo_pic when available
  // Note: skip on /login and /print pages to avoid duplicate branding calls
  useEffect(() => {
    if (isLoginPage || isPrintPreviewPage || isInstallPage) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchSystemBranding();
        const shopCode = String(user?.selected_shopcode || user?.default_shopcode || '').trim();
        if (token && shopCode) {
          try {
            const logoRes = await fetchWithAuth(
              `/api/shops/${encodeURIComponent(shopCode)}/logo`,
              token,
              { cache: 'no-store' }
            );
            const logoResult = await logoRes.json();
            const pic =
              logoResult?.success && typeof logoResult.data?.logo_pic === 'string'
                ? logoResult.data.logo_pic.trim()
                : '';
            const dataUrl = shopLogoBase64ToDataUrl(pic);
            if (!cancelled && dataUrl) {
              setSystemLogo(dataUrl);
              return;
            }
          } catch {
            // fall through to system branding
          }
        }
        if (!cancelled) setSystemLogo(pickSystemLogo(data));
      } catch {
        // keep default
      }
    };
    void load();

    const onShopLogoChanged = () => {
      void load();
    };
    window.addEventListener('app-shop-logo-changed', onShopLogoChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('app-shop-logo-changed', onShopLogoChanged);
    };
  }, [isLoginPage, isPrintPreviewPage, isInstallPage, token, user?.selected_shopcode, user?.default_shopcode]);

  const [pluginEnabledMap, setPluginEnabledMap] = useState<PluginEnabledMap>({});

  useEffect(() => {
    setPluginEnabledMap(readPluginEnabledMap());
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<PluginEnabledMap>).detail;
      if (detail && typeof detail === 'object') {
        setPluginEnabledMap({ ...detail });
      } else {
        setPluginEnabledMap(readPluginEnabledMap());
      }
    };
    window.addEventListener(PLUGIN_ENABLED_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLUGIN_ENABLED_CHANGED_EVENT, onChanged);
  }, []);

  // Sort menu data by order
  const sortedMenuData = React.useMemo(() => {
    return (menuData as MenuDataItem[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, []);

  // Filter menu by user permissions + disabled plugins
  const filteredMenuData = React.useMemo(() => {
    const blocked = getMenuHrefsBlockedByDisabledPlugins(pluginEnabledMap);
    if (permissionsLoading) {
      return filterMenuByPermission(sortedMenuData, () => true, {}, blocked, {
        isAdministrator: false,
      });
    }
    return filterMenuByPermission(sortedMenuData, can, MENU_PATH_VIEW_PERMISSION, blocked, {
      isAdministrator,
    });
  }, [sortedMenuData, permissionsLoading, can, isAdministrator, pluginEnabledMap]);

  // Load saved collapsed state from localStorage (run once on mount)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia(COMPACT_LAYOUT_MQ).matches) {
      setCollapsed(true);
      setOpenKeys([]);
      return;
    }
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    if (savedCollapsed !== null) {
      const isCollapsed = safeParseJson<boolean>(savedCollapsed, true);
      setCollapsed(isCollapsed);
      if (isCollapsed) {
        setOpenKeys([]);
      } else {
        setOpenKeys(getOpenKeys());
      }
    } else {
      setCollapsed(true);
      setOpenKeys([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debug effect to monitor state changes
  // useEffect(() => {
  //   console.log('Sidebar state changed:', { collapsed, openKeys, timestamp: new Date().toISOString() });
  // }, [collapsed, openKeys]);

  // Helper: return all parent keys so the current page's submenu(s) stay expanded
  const getOpenKeys = useCallback(() => {
    if (pathname === '/') return [];

    for (const item of filteredMenuData) {
      if (!item.submenu) continue;
      for (const sub of item.submenu) {
        // Nested groups (e.g. Administration → Users → Roles): check children first.
        // Users has both href and submenu; matching href first would skip expanding "users".
        if ('submenu' in sub && sub.submenu && sub.submenu.length > 0) {
          for (const subSub of sub.submenu) {
            if (
              subSub.href === pathname ||
              (subSub.href && pathname.startsWith(subSub.href + '/'))
            ) {
              return [item.key, sub.key];
            }
          }
          if (sub.href === pathname || (sub.href && pathname.startsWith(sub.href + '/'))) {
            return [item.key, sub.key];
          }
          continue;
        }
        if (sub.href === pathname || (sub.href && pathname.startsWith(sub.href + '/'))) {
          return [item.key];
        }
      }
    }
    return [];
  }, [pathname, filteredMenuData]);

  // When pathname changes on desktop, expand sidebar; on tablet keep drawer closed
  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;
    if (isCompactLayoutRef.current) {
      setCollapsed(true);
      setOpenKeys([]);
      return;
    }
    setCollapsed(false);
    localStorage.setItem('sidebarCollapsed', 'false');
    setOpenKeys((prev) => Array.from(new Set([...getOpenKeys(), ...prev])));
  }, [pathname, getOpenKeys]);

  // When collapsed state changes, clear or set openKeys
  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
    } else {
      setOpenKeys(getOpenKeys());
    }
  }, [collapsed, getOpenKeys]);

  // Helper: map icon name from menu JSON to Ant Design icon component
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'HomeOutlined': return <HomeOutlined />;
      case 'UserOutlined': return <UserOutlined />;
      case 'TeamOutlined': return <TeamOutlined />;
      case 'ShopOutlined': return <ShopOutlined />;
      case 'UserSwitchOutlined': return <UserSwitchOutlined />;
      case 'AppstoreOutlined': return <AppstoreOutlined />;
      case 'InboxOutlined': return <InboxOutlined />;
      case 'TruckOutlined': return <TruckOutlined />;
      case 'FolderOutlined': return <FolderOutlined />;
      case 'FolderOpenOutlined': return <FolderOpenOutlined />;
      case 'CreditCardOutlined': return <CreditCardOutlined />;
      case 'SettingOutlined': return <SettingOutlined />;
      case 'DollarOutlined': return <DollarOutlined />;
      case 'ShoppingOutlined': return <ShoppingOutlined />;
      case 'BarChartOutlined': return <BarChartOutlined />;
      default: return <HomeOutlined />;
    }
  };

  // Map every menu key to href (3rd level uses simple key e.g. "system"; keys are unique in our menu)
  const keyToHref = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of filteredMenuData) {
      if (item.href) map[item.key] = item.href;
      if (item.submenu) {
        for (const sub of item.submenu) {
          if (sub.href) map[sub.key] = sub.href;
          if ('submenu' in sub && sub.submenu) {
            for (const subSub of sub.submenu) {
              if (subSub.href) map[subSub.key] = subSub.href;
            }
          }
        }
      }
    }
    return map;
  }, [filteredMenuData]);

  // Leaf match: pathname is this page or a child (for items without children)
  const isPathMatch = (href: string | undefined) =>
    href && (pathname === href || pathname.startsWith(href + '/'));

  // Convert menu data to Ant Design format; force selected class on leaf item only (not parent)
  const menuItems = React.useMemo<MenuProps['items']>(() => {
    return filteredMenuData.map((item) => {
      if (item.submenu) {
        return {
          key: item.key,
          icon: getIcon(item.icon ?? 'HomeOutlined'),
          label: getMenuLabel(appLanguage, item.key, item.label),
          children: item.submenu.map((sub) => {
            if ('submenu' in sub && sub.submenu) {
              return {
                key: sub.key,
                label: getMenuLabel(appLanguage, sub.key, sub.label),
                children: sub.submenu.map((subSub) => {
                  const selected = isPathMatch(subSub.href);
                  return {
                    key: subSub.key,
                    label: getMenuLabel(appLanguage, subSub.key, subSub.label),
                    ...(selected && {
                      className: 'ant-menu-item-selected',
                      style: { backgroundColor: 'var(--ant-color-primary-bg-hover, #e6f4ff)' },
                    }),
                  };
                }),
              };
            }
            const selected = isPathMatch(sub.href);
            return {
              key: sub.key,
              label: getMenuLabel(appLanguage, sub.key, sub.label),
              ...(selected && {
                className: 'ant-menu-item-selected',
                style: { backgroundColor: 'var(--ant-color-primary-bg-hover, #e6f4ff)' },
              }),
            };
          }),
        };
      }
      const selected = isPathMatch(item.href);
      return {
        key: item.key,
        icon: getIcon(item.icon ?? 'HomeOutlined'),
        label: getMenuLabel(appLanguage, item.key, item.label),
        ...(selected && {
          className: 'ant-menu-item-selected',
          style: { backgroundColor: 'var(--ant-color-primary-bg-hover, #e6f4ff)' },
        }),
      };
    });
  }, [filteredMenuData, pathname, appLanguage]);

  // Paths where leave-page / discard warning should show when navigating away via side menu
  const isCreatePageWithLeaveWarning =
    pathname.startsWith('/sales/invoices/create/') ||
    pathname.startsWith('/sales/monthly-invoices/create/') ||
    pathname.startsWith('/sales/quotations/create/') ||
    pathname.startsWith('/sales/orders/create/') ||
    pathname.startsWith('/purchasing/purchases/create/') ||
    pathname === '/warehouse/delivery-note' ||
    pathname.startsWith('/warehouse/stock/grn') ||
    pathname === '/warehouse/adjustment' ||
    pathname === '/warehouse/stocktake';

  const handleMenuClick = ({ key }: { key: string }) => {
    const href = keyToHref[key];
    if (!href) return;
    // If we're on a create page with leave warning, ask the page to show the discard modal and navigate on confirm
    if (isCreatePageWithLeaveWarning && href !== pathname) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-navigate-request', { detail: { href } }));
      }
      return;
    }
    if (href !== pathname) {
      setPageNavigating(true);
    }
    router.push(href);
    if (isCompactLayoutRef.current) {
      setCollapsed(true);
      setOpenKeys([]);
    }
  };

  const closeCompactDrawer = useCallback(() => {
    setCollapsed(true);
    setOpenKeys([]);
  }, []);

  const handleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);

    if (!isCompactLayoutRef.current) {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(newCollapsed));
    }

    if (newCollapsed) {
      setOpenKeys([]);
    } else {
      setOpenKeys(getOpenKeys());
    }
  };

  // Let user collapse/expand submenus (e.g. Sales); pathname effect re-opens parents only on navigation
  const onOpenChange: MenuProps['onOpenChange'] = (newOpenKeys) => {
    if (collapsed) return;
    setOpenKeys(newOpenKeys);
  };

  // Helper: get the menu key for current pathname. 3rd level uses simple key (subSub.key).
  const getSelectedKeys = () => {
    if (pathname === '/') return ['home'];

    for (const item of filteredMenuData) {
      if (item.href === pathname) return [item.key];
      if (item.href && pathname.startsWith(item.href + '/') && !item.submenu) {
        return [item.key];
      }

      if (item.submenu) {
        for (const sub of item.submenu) {
          if ('submenu' in sub && sub.submenu && sub.submenu.length > 0) {
            for (const subSub of sub.submenu) {
              if (
                subSub.href === pathname ||
                (subSub.href && pathname.startsWith(subSub.href + '/'))
              ) {
                return [subSub.key];
              }
            }
            // Group hub page (e.g. Users href) → select the child with the same href if any
            if (sub.href === pathname || (sub.href && pathname.startsWith(sub.href + '/'))) {
              const sameHrefChild = sub.submenu.find((ss) => ss.href === sub.href);
              if (sameHrefChild) return [sameHrefChild.key];
              return [sub.key];
            }
            continue;
          }
          if (sub.href === pathname) return [sub.key];
          if (sub.href && pathname.startsWith(sub.href + '/')) return [sub.key];
        }
      }
    }
    return [];
  };

  // Resizing handlers
  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const stopResizing = () => {
    setIsResizing(false);
  };

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && !collapsed) {
      const newWidth = e.clientX;
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing, collapsed]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize]);


  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout();
    } else if (key === 'profile') {
      router.push('/administration/profile');
    } else if (key === 'settings') {
      router.push('/administration/settings/system');
    }
  };

  const userMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: bc.profile,
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: bc.settings,
      },
      {
        type: 'divider' as const,
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: bc.logout,
        danger: true,
      },
    ],
    [bc]
  );

  // Login: no app chrome
  if (isLoginPage) {
    return <MinimalChrome>{children}</MinimalChrome>;
  }

  // Install tools: full page without sidebar or header
  if (isInstallPage) {
    return (
      <MinimalChrome>
        <ProtectedRoute>{children}</ProtectedRoute>
      </MinimalChrome>
    );
  }

  // Print popup: preview window (toolbar) or bare window (?bare=1, template only + auto print)
  if (isPrintPreviewPage) {
    return <MinimalChrome>{children}</MinimalChrome>;
  }

  // Expired or logged-out session on app routes (e.g. "/"): clear page, no sidebar/header, until login
  if (isUnauthenticatedSettled) {
    return (
      <MinimalChrome>
        <ProtectedRoute>{children}</ProtectedRoute>
      </MinimalChrome>
    );
  }

  // Initial auth check: show spinner instead of sidebar flash / "Loading..." text
  if (authLoading) {
    return (
      <MinimalChrome>
        <PageLoadingCenter minHeight={480} />
      </MinimalChrome>
    );
  }

  const compactDrawerOpen = isCompactLayout && !collapsed;
  const siderCollapsedWidth = isCompactLayout ? 0 : 80;
  const siderExpandedWidth = isCompactLayout
    ? Math.min(DEFAULT_SIDEBAR_WIDTH, typeof window !== 'undefined' ? Math.min(320, window.innerWidth - 48) : DEFAULT_SIDEBAR_WIDTH)
    : sidebarWidth;

  // Regular layout with sidebar and header
  return (
    <ConfigProvider
      locale={antdLocale}
      spin={{ indicator: <AppSpinIndicator /> }}
      theme={{
        token: {
          fontFamily: APP_FONT_FAMILY,
          borderRadius: 6,
        },
      }}
    >
      <App message={{ top: 16 }}>
        <Layout className={`app-shell${isCompactLayout ? ' app-shell--compact' : ''}`} style={{ minHeight: '100vh' }}>
          {compactDrawerOpen && (
            <button
              type="button"
              className="app-sider-mask"
              aria-label="Close menu"
              onClick={closeCompactDrawer}
            />
          )}
          <Layout.Sider
            trigger={null}
            collapsible
            collapsed={collapsed}
            collapsedWidth={siderCollapsedWidth}
            width={siderExpandedWidth}
            className={`app-sider${compactDrawerOpen ? ' app-sider--drawer' : ''}`}
            style={{
              background: '#fff',
              borderRight: collapsed && isCompactLayout ? 'none' : '1px solid #f0f0f0',
              position: compactDrawerOpen ? 'fixed' : 'relative',
              left: compactDrawerOpen ? 0 : undefined,
              top: compactDrawerOpen ? 0 : undefined,
              bottom: compactDrawerOpen ? 0 : undefined,
              zIndex: compactDrawerOpen ? 1100 : undefined,
              height: compactDrawerOpen ? '100vh' : undefined,
              overflow: 'auto',
              transition: 'width 0.2s ease',
            }}
          >
            <div
              style={{
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '20px',
                color: '#1890ff',
                flexShrink: 0,
              }}
            >
              <SystemLogo logo={systemLogo} iconStyle={{ fontSize: 24 }} imageSize={32} />
            </div>
            {mounted &&
              (collapsed ? (
                <Menu
                  key="menu-collapsed"
                  mode="inline"
                  selectedKeys={getSelectedKeys()}
                  openKeys={[]}
                  onOpenChange={undefined}
                  onClick={handleMenuClick}
                  style={{ borderRight: 0 }}
                  items={menuItems}
                  defaultOpenKeys={[]}
                  forceSubMenuRender={false}
                  inlineCollapsed={true}
                  expandIcon={null}
                />
              ) : (
                <Menu
                  key="menu-expanded"
                  mode="inline"
                  selectedKeys={getSelectedKeys()}
                  openKeys={openKeys}
                  onOpenChange={onOpenChange}
                  onClick={handleMenuClick}
                  style={{ borderRight: 0 }}
                  items={menuItems}
                  forceSubMenuRender={false}
                  inlineCollapsed={false}
                />
              ))}

            {!collapsed && !isCompactLayout && (
              <div
                ref={resizerRef}
                className={`resizer ${isResizing ? 'resizing' : ''}`}
                onMouseDown={startResizing}
              />
            )}
          </Layout.Sider>
          <Layout style={{ minWidth: 0, flex: 1 }}>
            <Layout.Header className="app-header">
              <Button
                type="primary"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={handleCollapse}
                className="app-header__menu-btn"
                title={collapsed ? bc.expandSidebar : bc.collapseSidebar}
              />
              {user && (
                <Space size="middle" className="app-header__shop">
                  <span className="app-header__shop-chip" title={bc.currentShopHint}>
                    <ShopOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
                    <span className="app-header__shop-text">
                      <strong>{user.selected_shopcode || user.default_shopcode}</strong>
                      {user.selected_shopname && (
                        <span className="app-header__shop-name">– {user.selected_shopname}</span>
                      )}
                    </span>
                  </span>
                  {isWarehouseSection && (
                    <span
                      className="app-header__shop-chip app-header__shop-chip--warehouse"
                      title={bc.currentWarehouseHint}
                    >
                      <InboxOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
                      <span className="app-header__shop-text">
                        <strong>{bc.warehouseChipPrefix}</strong>
                        {currentWarehouse.loading ? (
                          <span className="app-header__shop-name">…</span>
                        ) : currentWarehouse.label ? (
                          <span className="app-header__shop-name">– {currentWarehouse.label}</span>
                        ) : (
                          <span className="app-header__shop-name">– —</span>
                        )}
                      </span>
                    </span>
                  )}
                </Space>
              )}
              <Space className="app-header__actions">
                {isDebugEnabled() && (
                  <Button
                    type="text"
                    icon={<BugOutlined />}
                    onClick={() => router.push('/debug')}
                    style={{ color: pathname === '/debug' ? '#1890ff' : undefined }}
                    className="app-header__debug"
                  >
                    <span className="app-header__debug-label">{bc.debug}</span>
                  </Button>
                )}
                <Dropdown
                  menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
                  placement="bottomRight"
                  arrow
                >
                  <Button type="text" className="app-header__user-btn">
                    <Avatar icon={<UserOutlined />} />
                    <span className="app-header__username">{user?.username || bc.guest}</span>
                  </Button>
                </Dropdown>
              </Space>
            </Layout.Header>
            <Layout.Content className="app-content" style={{ position: 'relative' }}>
              <PageTransitionOverlay
                visible={pageNavigating || permissionsLoading || !languageReady}
              />
              <ProtectedRoute>
                {languageReady ? children : null}
              </ProtectedRoute>
            </Layout.Content>
          </Layout>
        </Layout>
      </App>
    </ConfigProvider>
  );
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LayoutContent>{children}</LayoutContent>;
}
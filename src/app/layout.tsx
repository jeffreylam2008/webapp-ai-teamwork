'use client';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./resizable.css";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Locale } from 'antd/es/locale';
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
  ShoppingOutlined
} from '@ant-design/icons';
import SystemLogo from '@/components/SystemLogo';
import { fetchSystemBranding, pickSidebarLogo } from '@/lib/systemBranding';
import { DEFAULT_APP_LANGUAGE, resolveAppLanguage, type AppLanguage } from '@/lib/i18n/language';
import { getMenuLabel } from '@/lib/i18n/menu';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { antdLocaleEnUS, getAntdLocale } from '@/lib/i18n/antdLocale';
import { AppSpinIndicator } from '@/components/AppSpinIndicator';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 256;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Import menu data from JSON files
import menuData from "@/data/base-menu.json";
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import {
  MENU_PATH_VIEW_PERMISSION,
  canAccessWarehouseStockMenu,
} from '@/config/transactionPermissions';

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
  pathPerm: Record<string, string>
): MenuDataItem[] {
  return items
    .map((item) => {
      if (item.submenu) {
        const filteredSub = filterMenuByPermission(item.submenu, can, pathPerm);
        if (filteredSub.length === 0) return null;
        return { ...item, submenu: filteredSub };
      }
      if (item.href) {
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
  const [antdLocale, setAntdLocale] = useState<Locale>(antdLocaleEnUS);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = sessionStorage.getItem('__app_language');
        setAntdLocale(getAntdLocale(resolveAppLanguage(raw)));
      } catch {
        setAntdLocale(antdLocaleEnUS);
      }
    };
    sync();
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<AppLanguage>).detail;
      if (d) setAntdLocale(getAntdLocale(d));
    };
    window.addEventListener('app-language-changed', onChanged);
    return () => window.removeEventListener('app-language-changed', onChanged);
  }, []);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ConfigProvider
          locale={antdLocale}
          spin={{ indicator: <AppSpinIndicator /> }}
          theme={{
            token: {
              fontFamily: geistSans.style.fontFamily,
              borderRadius: 6,
            },
          }}
        >
          <App message={{ top: 16 }}>{children}</App>
        </ConfigProvider>
      </body>
    </html>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout, token, isAuthenticated, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { can, loading: permissionsLoading } = usePermissions();
  const [mounted, setMounted] = useState(false);

  // Check if current page is login page
  const isLoginPage = pathname === '/login';
  // Print preview: no sidebar or header (new window shows only the print template)
  const isPrintPreviewPage = pathname.includes('/print/');
  // Session cleared or verify failed (e.g. expired token): no sidebar/header while redirecting to login
  const isUnauthenticatedSettled = !isAuthenticated && !authLoading;
  
  // IMPORTANT: keep initial render deterministic to avoid hydration mismatch.
  // We'll load the persisted sidebar state from localStorage after mount.
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const resizerRef = useRef<HTMLDivElement>(null);
  const bc = useMemo(() => getBreadcrumbLabels(appLanguage), [appLanguage]);
  const antdLocale = useMemo(() => getAntdLocale(appLanguage), [appLanguage]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load system logo from t_systems (sidebar header; no name in sidebar)
  // Note: skip on /login and /print pages to avoid duplicate branding calls
  useEffect(() => {
    if (isLoginPage || isPrintPreviewPage) return;
    const load = async () => {
      try {
        const data = await fetchSystemBranding();
        setSystemLogo(pickSidebarLogo(data));
      } catch {
        // keep default
      }
    };
    load();
  }, [isLoginPage, isPrintPreviewPage]);

  // Load app language from global system setting (t_systems.language)
  useEffect(() => {
    if (isLoginPage || isPrintPreviewPage) return;
    if (!token) return;

    const load = async () => {
      try {
        const res = await fetchWithAuth('/api/system/language', token, { cache: 'no-store' });
        const result = await res.json();
        if (result?.success) {
          const next = resolveAppLanguage(result.data?.language);
          setAppLanguage(next);
          sessionStorage.setItem('__app_language', next);
        }
      } catch {
        // Keep existing value.
      }
    };

    void load();
  }, [isLoginPage, isPrintPreviewPage, token]);

  // When language is changed elsewhere (e.g. Administration → System), refresh sidebar labels
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string | undefined>).detail;
      const next = resolveAppLanguage(detail);
      setAppLanguage(next);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('__app_language', next);
      }
    };
    window.addEventListener('app-language-changed', handler);
    return () => window.removeEventListener('app-language-changed', handler);
  }, []);

  // Sort menu data by order
  const sortedMenuData = React.useMemo(() => {
    return (menuData as MenuDataItem[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, []);

  // Filter menu by user permissions (limited access: hide links user cannot view)
  const filteredMenuData = React.useMemo(() => {
    if (permissionsLoading) return sortedMenuData;
    return filterMenuByPermission(sortedMenuData, can, MENU_PATH_VIEW_PERMISSION);
  }, [sortedMenuData, permissionsLoading, can]);

  // Load saved collapsed state from localStorage (run once on mount)
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    if (savedCollapsed !== null) {
      const isCollapsed = safeParseJson<boolean>(savedCollapsed, true);
      setCollapsed(isCollapsed);
      // When expanded, set openKeys so third-level selected item stays expanded (Ant Design sub-menu)
      if (isCollapsed) {
        setOpenKeys([]);
      } else {
        setOpenKeys(getOpenKeys());
      }
    } else {
      // Default state: collapsed with no open menus
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
      if (item.submenu) {
        for (const sub of item.submenu) {
          if (sub.href === pathname || (sub.href && pathname.startsWith(sub.href + '/'))) {
            return [item.key];
          }
          if ('submenu' in sub && sub.submenu) {
            for (const subSub of sub.submenu) {
              if (subSub.href === pathname || (subSub.href && pathname.startsWith(subSub.href + '/'))) {
                return [item.key, sub.key];
              }
            }
          }
        }
      }
    }
    return [];
  }, [pathname, filteredMenuData]);

  // When pathname changes, expand sidebar and add new page's parents to openKeys (don't collapse others)
  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;
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
    router.push(href);
  };

  const handleCollapse = () => {
    console.log('Collapse button clicked, current state:', collapsed);
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    
    // Save to localStorage
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newCollapsed));
    
    if (newCollapsed) {
      // When collapsing, close all menus
      setOpenKeys([]);
    } else {
      // When expanding, open submenus so the current (e.g. third-level) selection stays visible
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
      if (item.href && pathname.startsWith(item.href + '/')) return [item.key];

      if (item.submenu) {
        for (const sub of item.submenu) {
          if (sub.href === pathname) return [sub.key];
          if (sub.href && pathname.startsWith(sub.href + '/')) {
            if ('submenu' in sub && sub.submenu) {
              for (const subSub of sub.submenu) {
                if (subSub.href === pathname || pathname.startsWith(subSub.href + '/')) {
                  return [subSub.key];
                }
              }
            }
            return [sub.key];
          }
          if ('submenu' in sub && sub.submenu) {
            for (const subSub of sub.submenu) {
              if (subSub.href === pathname || pathname.startsWith(subSub.href + '/')) {
                return [subSub.key];
              }
            }
          }
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

  // Regular layout with sidebar and header
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ConfigProvider
          locale={antdLocale}
          theme={{
            token: {
              fontFamily: geistSans.style.fontFamily,
              borderRadius: 6,
            },
          }}
        >
          <App message={{ top: 16 }}>
            <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider 
              trigger={null} 
              collapsible 
              collapsed={collapsed}
              width={collapsed ? 80 : sidebarWidth}
              style={{
                background: '#fff',
                borderRight: '1px solid #f0f0f0',
                position: 'relative',
                transition: 'width 0.2s ease',
              }}
            >
              <div style={{ 
                height: '64px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '20px',
                color: '#1890ff'
              }}>
                <SystemLogo logo={systemLogo} iconStyle={{ fontSize: 24 }} imageSize={32} />
              </div>
              {mounted &&
                (collapsed ? (
                  // Collapsed menu - no submenus can be open
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
                  // Expanded menu - can have open submenus
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

              {!collapsed && (
                <div
                  ref={resizerRef}
                  className={`resizer ${isResizing ? 'resizing' : ''}`}
                  onMouseDown={startResizing}
                />
              )}
            </Layout.Sider>
            <Layout>
              <Layout.Header style={{ 
                padding: '0 16px', 
                background: '#fff', 
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <Button
                  type="primary"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={handleCollapse}
                  style={{
                    fontSize: '16px',
                    width: 64,
                    height: 64,
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    backgroundColor: '#1890ff',
                    color: 'white',
                  }}
                  title={collapsed ? bc.expandSidebar : bc.collapseSidebar}
                />
                {user && (
                  <Space size="middle" style={{ marginLeft: 24 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: '#f5f5f5',
                        borderRadius: 6,
                        fontSize: 14,
                        color: '#262626',
                      }}
                      title={bc.currentShopHint}
                    >
                      <ShopOutlined style={{ color: '#1890ff' }} />
                      <span>
                        <strong>{user.selected_shopcode || user.default_shopcode}</strong>
                        {user.selected_shopname && (
                          <span style={{ marginLeft: 6, color: '#595959' }}>
                            – {user.selected_shopname}
                          </span>
                        )}
                      </span>
                    </span>
                  </Space>
                )}
                <Space style={{ marginLeft: 'auto' }}>
                  {isDebugEnabled() && (
                    <Button 
                      type="text" 
                      icon={<BugOutlined />}
                      onClick={() => router.push('/debug')}
                      style={{ color: pathname === '/debug' ? '#1890ff' : undefined }}
                    >
                      {bc.debug}
                    </Button>
                  )}
                  <Dropdown
                    menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
                    placement="bottomRight"
                    arrow
                  >
                    <Button type="text" style={{ height: 64, padding: '0 16px' }}>
                      <Avatar icon={<UserOutlined />} />
                      <span style={{ marginLeft: 8 }}>{user?.username || bc.guest}</span>
                    </Button>
                  </Dropdown>
                </Space>
              </Layout.Header>
              <Layout.Content style={{ 
                margin: 0,
                padding: 0,
                background: '#fff',
                minHeight: 280,
              }}>
                <ProtectedRoute>
                  {children}
                </ProtectedRoute>
              </Layout.Content>
            </Layout>
          </Layout>
          </App>
        </ConfigProvider>
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <LayoutContent>{children}</LayoutContent>
    </AuthProvider>
  );
}
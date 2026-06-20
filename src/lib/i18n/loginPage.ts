import type { AppLanguage } from './language';

export type LoginPageTexts = {
  defaultSystemName: string;
  loading: string;
  signInSubtitle: string;
  loginFailed: string;
  usernameRequired: string;
  usernamePlaceholder: string;
  passwordRequired: string;
  passwordPlaceholder: string;
  shopRequired: string;
  shopPlaceholder: string;
  signingIn: string;
  signIn: string;
  footer: (year: string, name: string) => string;
  failedLoadShops: string;
  loginFailedGeneric: string;
};

const EN: LoginPageTexts = {
  defaultSystemName: 'ERP System',
  loading: 'Loading...',
  signInSubtitle: 'Sign in to your account',
  loginFailed: 'Login Failed',
  usernameRequired: 'Please enter your username',
  usernamePlaceholder: 'Username',
  passwordRequired: 'Please enter your password',
  passwordPlaceholder: 'Password',
  shopRequired: 'Please select a shop',
  shopPlaceholder: 'Select Shop',
  signingIn: 'Signing in...',
  signIn: 'Sign In',
  footer: (year, name) => `© ${year} ${name}. All rights reserved.`,
  failedLoadShops: 'Failed to load shops',
  loginFailedGeneric: 'Login failed. Please check your credentials.',
};

const ZH_HANT: LoginPageTexts = {
  defaultSystemName: 'ERP 系統',
  loading: '載入中...',
  signInSubtitle: '登入您的帳號',
  loginFailed: '登入失敗',
  usernameRequired: '請輸入使用者名稱',
  usernamePlaceholder: '使用者名稱',
  passwordRequired: '請輸入密碼',
  passwordPlaceholder: '密碼',
  shopRequired: '請選擇店舖',
  shopPlaceholder: '選擇店舖',
  signingIn: '登入中...',
  signIn: '登入',
  footer: (year, name) => `© ${year} ${name}。版權所有。`,
  failedLoadShops: '無法載入店舖',
  loginFailedGeneric: '登入失敗，請確認帳號密碼。',
};

export function getLoginPageTexts(lang: AppLanguage): LoginPageTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}

import type { AppLanguage } from './language';

type CommonLanguageTexts = {
  discardModal: {
    title: string;
    ok: string;
    cancel: string;
    line1: string;
    line2: string;
  };
};

const EN: CommonLanguageTexts = {
  discardModal: {
    title: 'Leave Page & Discard Transaction',
    ok: 'Yes, Leave & Discard',
    cancel: 'Stay on Page',
    line1: 'You are about to leave page.',
    line2: 'This will discard the transaction',
  },
};

const ZH_HANT: CommonLanguageTexts = {
  discardModal: {
    title: '離開頁面並放棄交易',
    ok: '是，離開並放棄',
    cancel: '留在此頁',
    line1: '你將離開此頁面。',
    line2: '這會放棄交易',
  },
};

export function getCommonLanguageTexts(lang: AppLanguage): CommonLanguageTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}


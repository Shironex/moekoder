import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import { isSupportedLanguage, pickInitialLanguage } from '@moekoder/shared';
import i18n, { NAMESPACES } from './i18n';

// Static imports of every locale namespace so the parity test fails loudly
// (at type-check time too) if a namespace file is renamed or removed.
import * as enAbout from '@/locales/en/about.json';
import * as enCommon from '@/locales/en/common.json';
import * as enCrash from '@/locales/en/crash.json';
import * as enDone from '@/locales/en/done.json';
import * as enEncoding from '@/locales/en/encoding.json';
import * as enExtract from '@/locales/en/extract.json';
import * as enIdle from '@/locales/en/idle.json';
import * as enOnboarding from '@/locales/en/onboarding.json';
import * as enQueue from '@/locales/en/queue.json';
import * as enSettings from '@/locales/en/settings.json';
import * as enSidebar from '@/locales/en/sidebar.json';
import * as enSplash from '@/locales/en/splash.json';
import * as enTitlebar from '@/locales/en/titlebar.json';
import * as enUpdater from '@/locales/en/updater.json';

import * as plAbout from '@/locales/pl/about.json';
import * as plCommon from '@/locales/pl/common.json';
import * as plCrash from '@/locales/pl/crash.json';
import * as plDone from '@/locales/pl/done.json';
import * as plEncoding from '@/locales/pl/encoding.json';
import * as plExtract from '@/locales/pl/extract.json';
import * as plIdle from '@/locales/pl/idle.json';
import * as plOnboarding from '@/locales/pl/onboarding.json';
import * as plQueue from '@/locales/pl/queue.json';
import * as plSettings from '@/locales/pl/settings.json';
import * as plSidebar from '@/locales/pl/sidebar.json';
import * as plSplash from '@/locales/pl/splash.json';
import * as plTitlebar from '@/locales/pl/titlebar.json';
import * as plUpdater from '@/locales/pl/updater.json';

type Dict = Record<string, unknown>;
const strip = (m: unknown): Dict => {
  const obj = m as Dict & { default?: Dict };
  return (obj.default ?? obj) as Dict;
};

const EN: Record<string, Dict> = {
  about: strip(enAbout),
  common: strip(enCommon),
  crash: strip(enCrash),
  done: strip(enDone),
  encoding: strip(enEncoding),
  extract: strip(enExtract),
  idle: strip(enIdle),
  onboarding: strip(enOnboarding),
  queue: strip(enQueue),
  settings: strip(enSettings),
  sidebar: strip(enSidebar),
  splash: strip(enSplash),
  titlebar: strip(enTitlebar),
  updater: strip(enUpdater),
};
const PL: Record<string, Dict> = {
  about: strip(plAbout),
  common: strip(plCommon),
  crash: strip(plCrash),
  done: strip(plDone),
  encoding: strip(plEncoding),
  extract: strip(plExtract),
  idle: strip(plIdle),
  onboarding: strip(plOnboarding),
  queue: strip(plQueue),
  settings: strip(plSettings),
  sidebar: strip(plSidebar),
  splash: strip(plSplash),
  titlebar: strip(plTitlebar),
  updater: strip(plUpdater),
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Flatten a (possibly nested) translation object into the set of *base* keys,
 * stripping i18next plural suffixes. English carries `one`/`other`; Polish
 * carries `one`/`few`/`many`/`other` for the same logical key — so comparing
 * base keys catches a genuinely missing translation without flagging the
 * legitimate per-language difference in plural-form count.
 */
function baseKeys(obj: Dict, prefix = '', out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const base = k.replace(PLURAL_SUFFIX, '');
    const path = prefix ? `${prefix}.${base}` : base;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      baseKeys(v as Dict, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

describe('isSupportedLanguage', () => {
  it('accepts shipped codes', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('pl')).toBe(true);
  });
  it('rejects everything else', () => {
    for (const v of ['de', 'EN', '', null, undefined, 0, {}]) {
      expect(isSupportedLanguage(v)).toBe(false);
    }
  });
});

describe('pickInitialLanguage', () => {
  it('prefers a valid stored choice over OS locale', () => {
    expect(pickInitialLanguage('pl', 'en-US')).toBe('pl');
    expect(pickInitialLanguage('en', 'pl-PL')).toBe('en');
  });
  it('auto-detects Polish from the navigator locale when nothing is stored', () => {
    expect(pickInitialLanguage(null, 'pl')).toBe('pl');
    expect(pickInitialLanguage(null, 'pl-PL')).toBe('pl');
    expect(pickInitialLanguage(undefined, 'PL')).toBe('pl');
  });
  it('falls back to English for non-Polish or absent locales', () => {
    expect(pickInitialLanguage(null, 'en-US')).toBe('en');
    expect(pickInitialLanguage(null, 'de-DE')).toBe('en');
    expect(pickInitialLanguage(null, undefined)).toBe('en');
    expect(pickInitialLanguage('garbage', null)).toBe('en');
  });
});

describe('locale key parity', () => {
  it('registers an en + pl resource for every declared namespace', () => {
    for (const ns of NAMESPACES) {
      expect(EN[ns], `missing en/${ns}.json`).toBeDefined();
      expect(PL[ns], `missing pl/${ns}.json`).toBeDefined();
    }
  });

  it.each(NAMESPACES)('en and pl agree on base keys for "%s"', ns => {
    const en = baseKeys(EN[ns]);
    const pl = baseKeys(PL[ns]);
    const missingInPl = [...en].filter(k => !pl.has(k));
    const missingInEn = [...pl].filter(k => !en.has(k));
    expect(missingInPl, `keys in en/${ns} missing from pl/${ns}`).toEqual([]);
    expect(missingInEn, `keys in pl/${ns} missing from en/${ns}`).toEqual([]);
  });
});

describe('configured i18n instance serves Polish from bundled resources', () => {
  it('registers an en + pl resource bundle for every namespace', () => {
    for (const ns of NAMESPACES) {
      expect(i18n.hasResourceBundle('en', ns), `en/${ns} not registered`).toBe(true);
      expect(i18n.hasResourceBundle('pl', ns), `pl/${ns} not registered`).toBe(true);
    }
  });

  it('resolves Polish vs English for representative keys', () => {
    const pl = (ns: string) => i18n.getFixedT('pl', ns);
    const en = (ns: string) => i18n.getFixedT('en', ns);
    expect(pl('titlebar')('settings')).toBe('Ustawienia');
    expect(pl('titlebar')('close')).toBe('Zamknij');
    expect(pl('common')('cancel')).toBe('Anuluj');
    expect(pl('common')('route.single')).toBe('Pojedynczy plik');
    // English still resolves through the same instance.
    expect(en('titlebar')('settings')).toBe('Settings');
    expect(en('common')('route.single')).toBe('Single file');
  });
});

describe('Polish pluralization (i18next config contract)', () => {
  it('selects one/few/many forms by count', async () => {
    const inst = i18next.createInstance();
    await inst.init({
      lng: 'pl',
      fallbackLng: 'en',
      resources: {
        pl: {
          translation: {
            files_one: '{{count}} plik',
            files_few: '{{count}} pliki',
            files_many: '{{count}} plików',
          },
        },
      },
      interpolation: { escapeValue: false },
    });
    expect(inst.t('files', { count: 1 })).toBe('1 plik');
    expect(inst.t('files', { count: 3 })).toBe('3 pliki');
    expect(inst.t('files', { count: 5 })).toBe('5 plików');
    expect(inst.t('files', { count: 22 })).toBe('22 pliki');
    expect(inst.t('files', { count: 25 })).toBe('25 plików');
  });
});

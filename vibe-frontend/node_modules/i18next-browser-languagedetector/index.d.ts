import * as i18next from 'i18next';

interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
}

export interface DetectorOptions {
  /**
   * order and from where user language should be detected
   */
  order?: Array<
    'querystring' | 'cookie' | 'sessionStorage' | 'localStorage' | 'navigator' | 'htmlTag' | string
  >;

  /**
   * keys or params to lookup language from
   */
  lookupQuerystring?: string;
  lookupCookie?: string;
  lookupSessionStorage?: string;
  lookupLocalStorage?: string;
  lookupFromPathIndex?: number;
  lookupFromSubdomainIndex?: number;

  /**
   * cache user language on
   */
  caches?: string[];

  /**
   * languages to not persist (cookie, localStorage)
   */
  excludeCacheFor?: string[];

  /**
   * optional expire for set cookie
   * @default 10
   */
  cookieMinutes?: number;

  /**
   * optional domain for set cookie
   */
  cookieDomain?: string;

  /**
   * optional cookie options
   */
  cookieOptions?: CookieOptions

  /**
   * optional htmlTag with lang attribute
   * @default document.documentElement
   */
  htmlTag?: HTMLElement | null;

  /**
   * optional conversion function to use to modify the detected language code
   */
  convertDetectedLanguage?: 'Iso15897' | ((lng: string) => string);
}

export interface CustomDetector {
  name: string;
  cacheUserLanguage?(lng: string, options: DetectorOptions): void;
  lookup(options: DetectorOptions): string | string[] | undefined;
}

export default class I18nextBrowserLanguageDetector implements i18next.LanguageDetectorModule {
  constructor(services?: any, options?: DetectorOptions);
  /**
   * Adds detector.
   */
  addDetector(detector: CustomDetector): I18nextBrowserLanguageDetector;

  /**
   * Initializes detector.
   */
  init(services?: any, options?: DetectorOptions): void;

  detect(detectionOrder?: DetectorOptions['order']): string | string[] | undefined;

  cacheUserLanguage(lng: string, caches?: string[]): void;

  type: 'languageDetector';
  detectors: { [key: string]: any };
  services: any;
  i18nOptions: any;
}

declare module 'i18next' {
  interface CustomPluginOptions {
    detection?: DetectorOptions;
  }
}

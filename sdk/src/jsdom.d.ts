/** Minimal typings so the SDK package can typecheck without a jsdom types dependency. */
declare module 'jsdom' {
  interface DOMWindow {
    document: Document;
    navigator: Navigator;
    localStorage: Storage;
    location: Location;
    console: Console;
    fetch: typeof fetch;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    Element: typeof Element;
    HTMLScriptElement: typeof HTMLScriptElement;
    eval(code: string): unknown;
    close(): void;
  }

  export class JSDOM {
    window: DOMWindow;
    constructor(html?: string, options?: {
      url?: string;
      runScripts?: 'dangerously' | 'outside-only';
      beforeParse?: (window: DOMWindow) => void;
    });
  }
}

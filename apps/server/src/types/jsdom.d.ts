// ABOUTME: The slice of jsdom the server uses, declared here on purpose: the
// ABOUTME: published @types/jsdom pulls the DOM lib into every package of the monorepo.
declare module 'jsdom' {
  interface JsdomElementList {
    readonly length: number;
  }

  interface JsdomDocument {
    readonly documentElement: { readonly localName: string };
    getElementsByTagName(name: string): JsdomElementList;
  }

  interface JsdomSerializer {
    serializeToString(node: unknown): string;
  }

  export interface DOMWindow {
    readonly document: JsdomDocument;
    readonly XMLSerializer: new () => JsdomSerializer;
  }

  export interface ConstructorOptions {
    contentType?: string;
  }

  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: DOMWindow;
  }
}

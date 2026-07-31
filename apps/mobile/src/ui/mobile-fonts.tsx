import antonioFont from '../../assets/fonts/antonio.ttf';
import satoshiFont from '../../assets/fonts/satoshi-variable.woff2';
import satoshiItalicFont from '../../assets/fonts/satoshi-variable-italic.woff2';

// The shared UI's <AppAssets> references fonts via `local://fonts/...`, a scheme
// the React Native WebView cannot resolve (unlike the Electron desktop app, which
// registers a `local` protocol handler). Re-declare the same families using
// Vite-inlined `data:` URIs so the fonts load inside the WebView. This component
// is rendered after <App>, so these @font-face rules win over the local:// ones.
export const MobileFonts = () => (
  <style>{`
    @font-face {
      font-family: "satoshi";
      src: url('${satoshiFont}') format("woff2-variations"),
           url('${satoshiFont}') format("woff2");
      font-weight: 300 900;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "satoshi";
      src: url('${satoshiItalicFont}') format("woff2-variations"),
           url('${satoshiItalicFont}') format("woff2");
      font-weight: 300 900;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: 'antonio';
      src: url('${antonioFont}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  `}</style>
);

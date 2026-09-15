import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve('assets');
const IMAGES_DIR = path.resolve(ASSETS_DIR, 'images');

const EMOJIS_DIR = path.resolve(ASSETS_DIR, 'emojis');
const EMOJIS_DB_PATH = path.resolve(EMOJIS_DIR, 'emojis.db');
const EMOJIS_MIN_DB_PATH = path.resolve(EMOJIS_DIR, 'emojis.min.db');
const EMOJI_SVG_PATH = path.resolve(EMOJIS_DIR, 'emojis.svg');

const ICONS_DIR = path.resolve(ASSETS_DIR, 'icons');
const ICONS_DB_PATH = path.resolve(ICONS_DIR, 'icons.db');
const ICONS_MIN_DB_PATH = path.resolve(ICONS_DIR, 'icons.min.db');
const ICONS_SVG_PATH = path.resolve(ICONS_DIR, 'icons.svg');

const SATOSHI_FONT_NAME = 'satoshi-variable.woff2';
const SATOSHI_ITALIC_FONT_NAME = 'satoshi-variable-italic.woff2';
const ANTONIO_FONT_NAME = 'antonio.ttf';
const FONTS_DIR = path.resolve(ASSETS_DIR, 'fonts');
const FONTS_SATOSHI_PATH = path.resolve(FONTS_DIR, SATOSHI_FONT_NAME);
const FONTS_SATOSHI_ITALIC_PATH = path.resolve(
  FONTS_DIR,
  SATOSHI_ITALIC_FONT_NAME
);
const FONTS_ANTONIO_PATH = path.resolve(FONTS_DIR, ANTONIO_FONT_NAME);

const DESKTOP_ASSETS_DIR = path.resolve('apps', 'desktop', 'assets');
const WEB_PUBLIC_DIR = path.resolve('apps', 'web', 'public');
const WEB_ASSETS_DIR = path.resolve(WEB_PUBLIC_DIR, 'assets');
const MOBILE_ASSETS_DIR = path.resolve('apps', 'mobile', 'assets');

const copyFile = (source: string, target: string | string[]) => {
  if (!fs.existsSync(source)) {
    return;
  }

  const targets = Array.isArray(target) ? target : [target];

  targets.forEach((target) => {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(source, target);
  });
};

const execute = () => {
  copyFile(EMOJIS_DB_PATH, path.resolve(DESKTOP_ASSETS_DIR, 'emojis.db'));
  copyFile(EMOJIS_DB_PATH, path.resolve(MOBILE_ASSETS_DIR, 'emojis.db'));
  copyFile(EMOJIS_MIN_DB_PATH, path.resolve(WEB_ASSETS_DIR, 'emojis.db'));
  copyFile(EMOJI_SVG_PATH, path.resolve(WEB_ASSETS_DIR, 'emojis.svg'));

  copyFile(ICONS_DB_PATH, path.resolve(DESKTOP_ASSETS_DIR, 'icons.db'));
  copyFile(ICONS_DB_PATH, path.resolve(MOBILE_ASSETS_DIR, 'icons.db'));
  copyFile(ICONS_MIN_DB_PATH, path.resolve(WEB_ASSETS_DIR, 'icons.db'));
  copyFile(ICONS_SVG_PATH, path.resolve(WEB_ASSETS_DIR, 'icons.svg'));

  copyFile(FONTS_SATOSHI_PATH, [
    path.resolve(DESKTOP_ASSETS_DIR, 'fonts', SATOSHI_FONT_NAME),
    path.resolve(WEB_ASSETS_DIR, 'fonts', SATOSHI_FONT_NAME),
    path.resolve(MOBILE_ASSETS_DIR, 'fonts', SATOSHI_FONT_NAME),
  ]);

  copyFile(FONTS_SATOSHI_ITALIC_PATH, [
    path.resolve(DESKTOP_ASSETS_DIR, 'fonts', SATOSHI_ITALIC_FONT_NAME),
    path.resolve(WEB_ASSETS_DIR, 'fonts', SATOSHI_ITALIC_FONT_NAME),
    path.resolve(MOBILE_ASSETS_DIR, 'fonts', SATOSHI_ITALIC_FONT_NAME),
  ]);

  copyFile(FONTS_ANTONIO_PATH, [
    path.resolve(DESKTOP_ASSETS_DIR, 'fonts', ANTONIO_FONT_NAME),
    path.resolve(WEB_ASSETS_DIR, 'fonts', ANTONIO_FONT_NAME),
    path.resolve(MOBILE_ASSETS_DIR, 'fonts', ANTONIO_FONT_NAME),
  ]);

  copyFile(
    path.resolve(IMAGES_DIR, 'arribada-favicon.ico'),
    path.resolve(WEB_PUBLIC_DIR, 'favicon.ico')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'arribada-icon-180.png'),
    path.resolve(WEB_ASSETS_DIR, 'arribada-icon-180.png')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'arribada-icon-192.png'),
    path.resolve(WEB_ASSETS_DIR, 'arribada-icon-192.png')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'arribada-icon-512.png'),
    path.resolve(WEB_ASSETS_DIR, 'arribada-icon-512.png')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'arribada-mark.svg'),
    path.resolve(WEB_ASSETS_DIR, 'arribada-mark.svg')
  );

  // Install icons, all traced from the official logo: the any-purpose tile,
  // the full-bleed maskable variant Android and Windows crop to their own
  // shape, and the square iOS rounds by itself.
  for (const name of [
    'arribada-app-180.png',
    'arribada-app-192.png',
    'arribada-app-512.png',
    'arribada-app-maskable-512.png',
  ]) {
    copyFile(
      path.resolve(IMAGES_DIR, name),
      path.resolve(WEB_ASSETS_DIR, name)
    );
  }

  copyFile(
    path.resolve(IMAGES_DIR, 'colanode-logo.png'),
    path.resolve(DESKTOP_ASSETS_DIR, 'colanode-logo.png')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'colanode-logo.ico'),
    path.resolve(DESKTOP_ASSETS_DIR, 'colanode-logo.ico')
  );

  copyFile(
    path.resolve(IMAGES_DIR, 'colanode-logo.icns'),
    path.resolve(DESKTOP_ASSETS_DIR, 'colanode-logo.icns')
  );

  // The desktop app's own icon: .ico for the Windows exe and installer,
  // .icns for macOS, .png for Linux and for the window itself. The sources
  // are arribada-desktop.* because assets/images/arribada-logo.png is
  // already the brand logo; the app still finds them as arribada-logo.*.
  for (const extension of ['png', 'ico', 'icns']) {
    copyFile(
      path.resolve(IMAGES_DIR, `arribada-desktop.${extension}`),
      path.resolve(DESKTOP_ASSETS_DIR, `arribada-logo.${extension}`)
    );
  }
};

execute();

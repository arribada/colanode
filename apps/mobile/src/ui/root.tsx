// A workaround to make the globals.css file work in the mobile app
import '../../../../packages/ui/src/styles/globals.css';

import { App } from '@colanode/ui';

import { MobileFonts } from './mobile-fonts';

export const Root = () => {
  return (
    <>
      <App type="mobile" />
      <MobileFonts />
    </>
  );
};

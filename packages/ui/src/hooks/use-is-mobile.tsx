import { useEffect, useMemo, useState } from 'react';

import { useApp } from '@colanode/ui/contexts/app';

const mobileDeviceRegex =
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i;

// Matches Tailwind's default `md` breakpoint (md: activates at >=768px) so
// this hook and `md:` utility classes agree on where "mobile" starts.
const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

// Narrow browser windows (resizing a desktop browser, DevTools device
// emulation, split-screen tablets, ...) should get the same mobile layout
// (sidebar drawer, stacked forms, action sheets) as an actual phone -- the
// original user-agent check alone never fires for those. Reactive via
// matchMedia so drag-resizing the window flips layouts live.
const useIsNarrowViewport = (): boolean => {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = () => setIsNarrow(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isNarrow;
};

export const useIsMobile = (): boolean => {
  const app = useApp();
  const isNarrowViewport = useIsNarrowViewport();

  if (app.type === 'mobile') {
    return true;
  }

  const isMobileUserAgent = useMemo(() => {
    return mobileDeviceRegex.test(navigator.userAgent);
  }, []);

  return isMobileUserAgent || isNarrowViewport;
};

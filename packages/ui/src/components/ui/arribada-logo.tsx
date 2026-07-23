import {
  arribadaWordmarkDark,
  arribadaWordmarkLight,
} from '@colanode/ui/assets/arribada';
import { cn } from '@colanode/ui/lib/utils';

// Arribada brand mark: the "A" glyph with the five-step green pixel strip.
// Vectorized from the official 60x60 icon (assets/images/arribada-icon.png)
// so it stays crisp at any size. The glyph uses currentColor so it adapts to
// light/dark surfaces; the green strip keeps its brand colors.
type ArribadaMarkProps = React.SVGAttributes<SVGElement>;

export const ArribadaMark = (props: ArribadaMarkProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="6 6 48 48"
      width="48"
      height="48"
      {...props}
    >
      <g fill="currentColor">
        <polygon points="25.5,8 31.8,8 18.3,40 12,40" />
        <polygon points="27.2,8 34.5,8 48,40 40.7,40" />
        <polygon points="28.4,27 42.5,27 44.6,32 26.3,32" />
      </g>
      <rect x="10" y="45" width="8" height="8" fill="#DEF2E1" />
      <rect x="18" y="45" width="8" height="8" fill="#BDE5C3" />
      <rect x="26" y="45" width="8" height="8" fill="#9CD9A6" />
      <rect x="34" y="45" width="8" height="8" fill="#7BCC88" />
      <rect x="42" y="45" width="8" height="8" fill="#5ABF6A" />
    </svg>
  );
};

// The full "ARRIBADA initiative" wordmark. Ships as inlined data URIs (like
// the mobile fonts) so it renders identically on web, desktop and mobile
// without asset-pipeline configuration. A light-gray recolor is swapped in on
// dark surfaces where the original dark-gray text would lack contrast.
type ArribadaWordmarkProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt'
>;

export const ArribadaWordmark = ({
  className,
  ...props
}: ArribadaWordmarkProps) => {
  return (
    <>
      <img
        src={arribadaWordmarkLight}
        alt="Arribada Initiative"
        className={cn('dark:hidden', className)}
        {...props}
      />
      <img
        src={arribadaWordmarkDark}
        alt="Arribada Initiative"
        className={cn('hidden dark:block', className)}
        {...props}
      />
    </>
  );
};

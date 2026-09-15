import { Toaster as Sonner, ToasterProps } from 'sonner';

import { useTheme } from '@colanode/ui/contexts/theme';

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme();

  return (
    <Sonner
      theme={theme.mode}
      className="toaster group"
      toastOptions={{
        classNames: {
          // Sonner paints titles and descriptions in its own fixed greys, which
          // went near-black on the brand navy of the dark theme. Follow the
          // popover's foreground, like the rest of the toast.
          title: '!text-popover-foreground',
          description: '!text-popover-foreground/80',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };

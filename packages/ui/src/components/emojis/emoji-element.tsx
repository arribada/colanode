import { ShieldQuestionMark } from 'lucide-react';
import { ReactNode } from 'react';

import { useApp } from '@colanode/ui/contexts/app';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { cn } from '@colanode/ui/lib/utils';

interface EmojiElementProps {
  id: string;
  className?: string;
  name?: string;
  onClick?: () => void;
}

interface EmojiElementContainerProps {
  className?: string;
  name?: string;
  onClick?: () => void;
  children: ReactNode;
}

const EmojiElementContainer = ({
  className,
  name,
  onClick,
  children,
}: EmojiElementContainerProps) => {
  if (onClick) {
    return (
      <button
        type="button"
        className={cn('emoji-element', className)}
        onClick={onClick}
        aria-label={name}
      >
        {children}
      </button>
    );
  }

  return <div className={cn('emoji-element', className)}>{children}</div>;
};

const EmojiElementWeb = ({
  id,
  className,
  name,
  onClick,
}: EmojiElementProps) => {
  return (
    <EmojiElementContainer
      className={className}
      name={name ?? id}
      onClick={onClick}
    >
      <svg>
        <use href={`/assets/emojis.svg#${id}`} />
      </svg>
    </EmojiElementContainer>
  );
};

const EmojiElementDesktop = ({
  id,
  className,
  name,
  onClick,
}: EmojiElementProps) => {
  const svgQuery = useQuery({
    type: 'emoji.svg.get',
    id,
  });

  if (svgQuery.isLoading) {
    return null;
  }

  const svg = svgQuery.data;
  if (!svg) {
    return (
      <EmojiElementContainer
        className={className}
        name={name ?? id}
        onClick={onClick}
      >
        <ShieldQuestionMark />
      </EmojiElementContainer>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={cn('emoji-element', className)}
        onClick={onClick}
        aria-label={name ?? id}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div
      className={cn('emoji-element', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export const EmojiElement = ({
  id,
  className,
  name,
  onClick,
}: EmojiElementProps) => {
  const app = useApp();

  if (app.type === 'web') {
    return (
      <EmojiElementWeb
        id={id}
        className={className}
        name={name}
        onClick={onClick}
      />
    );
  }

  return (
    <EmojiElementDesktop
      id={id}
      className={className}
      name={name}
      onClick={onClick}
    />
  );
};

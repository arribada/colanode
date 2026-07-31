import { cn } from '@colanode/ui/lib/utils';

interface MarkButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId: string;
}

export const MarkButton = ({
  isActive,
  onClick,
  icon: Icon,
  label,
  testId,
}: MarkButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      data-testid={testId}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md cursor-pointer hover:bg-input',
        isActive && 'bg-input'
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </button>
  );
};

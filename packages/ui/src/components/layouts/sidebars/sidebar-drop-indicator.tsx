// ABOUTME: The thin line drawn along the top/bottom edge of a sidebar row while
// ABOUTME: a drag would drop there, showing where the node lands in the order.
export const SidebarDropIndicator = ({
  edge,
}: {
  edge: 'before' | 'after' | null;
}) => {
  if (!edge) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={
        edge === 'before'
          ? 'pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-sidebar-ring'
          : 'pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-sidebar-ring'
      }
    />
  );
};

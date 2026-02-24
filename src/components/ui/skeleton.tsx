import { cn } from '@libutils';

function Skeleton({
  className,
  ...props
} React.HTMLAttributesHTMLDivElement) {
  return (
    div
      className={cn('animate-pulse rounded-md bg-primary10', className)}
      {...props}
    
  );
}

export { Skeleton };

/**
 * Compact paper-plane mark used inside the login button while `isLoading` is true.
 */
export function PaperplaneButtonSpinner(): JSX.Element {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 animate-spin text-white"
      style={{ animationDuration: '0.85s' }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3.5 12.5L20.5 4L12 20.5L10 14L3.5 12.5Z"
          fill="currentColor"
          fillOpacity="0.95"
        />
        <path d="M3.5 12.5L10 14L12 12L3.5 12.5Z" fill="currentColor" fillOpacity="0.55" />
      </svg>
    </span>
  );
}

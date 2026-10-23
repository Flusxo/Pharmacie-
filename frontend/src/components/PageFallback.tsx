/** Shown for a moment while a page's code loads: the header, menu and footer are already there. */
export function PageFallback() {
  return (
    <div className="page-fallback" role="status" aria-busy="true" data-testid="page-fallback">
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
    </div>
  );
}

export function Header({ back }: { back?: boolean }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <a href="#/" className="app-brand">
          节奏雷达
        </a>
        <span className="app-brand-subtitle">Pace Radar</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-4">
          {back && (
            <a href="#/" className="app-back-link">
              <span className="sm:hidden">← 返回</span>
              <span className="hidden sm:inline">← 返回概览</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

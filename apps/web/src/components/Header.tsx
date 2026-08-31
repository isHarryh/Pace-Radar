export function Header({ back }: { back?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
        <a href="#/" className="shrink-0 text-base font-semibold text-brand sm:text-lg">
          节奏雷达
        </a>
        <span className="hidden text-sm text-muted sm:inline">Pace Radar</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-4">
          {back && (
            <a
              href="#/"
              className="inline-flex min-h-9 items-center rounded-full bg-bg px-3 py-1.5 text-sm font-medium text-ink hover:bg-line sm:bg-transparent sm:px-0 sm:py-0 sm:font-normal sm:text-brand sm:hover:text-brand-hover"
            >
              <span className="sm:hidden">← 返回</span>
              <span className="hidden sm:inline">← 返回概览</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
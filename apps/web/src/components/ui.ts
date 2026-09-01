export const pageShell = 'mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7';
export const pageShellNarrow = 'mx-auto w-full max-w-md px-4 py-8 sm:px-6 sm:py-12';
export const surface = 'overflow-hidden rounded-lg border border-line bg-white shadow-sm';
export const surfaceHeader = 'border-b border-line/60 bg-bg/40 px-4 py-3';
export const surfaceBody = 'p-4';
export const surfaceFooter = 'flex flex-col gap-3 border-t border-line/60 bg-bg/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between';
export const surfaceFormFooter = 'border-t border-line/60 bg-bg/30 p-3 sm:p-4';
export const surfaceContent = 'p-3 sm:p-4';
export const inputBase =
  'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition ' +
  'placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';
export const btnPrimary =
  'inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition ' +
  'hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost =
  'inline-flex h-10 items-center justify-center rounded-lg bg-bg px-4 text-sm font-medium text-ink transition ' +
  'hover:bg-line disabled:cursor-not-allowed disabled:opacity-40';
export const btnPrimarySm =
  'inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-xs font-medium text-white shadow-sm transition ' +
  'hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40';
export const btnSmall = 'inline-flex h-8 items-center justify-center rounded-md bg-bg px-2.5 text-xs font-medium text-ink transition hover:bg-line disabled:cursor-not-allowed disabled:opacity-40';
export const btnSmallDanger = 'inline-flex h-8 items-center justify-center rounded-md bg-white px-2.5 text-xs font-medium text-muted ring-1 ring-line transition hover:bg-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-40';
export const fieldLabel = 'flex flex-col gap-1.5 text-xs font-medium text-ink';
export const errorMessage = 'rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger';
export const badgeBase = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none';
export const badgeTone = {
  brand: 'bg-brand/10 text-brand',
  watch: 'bg-watch/10 text-watch',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-line text-muted',
} as const;
export const avatarBase = 'inline-block shrink-0 overflow-hidden rounded-full bg-line text-center font-medium text-muted';
export const tableScroll = 'overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden';
export const tableBase = 'w-full text-sm';

export function tabClass(active: boolean): string {
  return [
    'inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
    active ? 'bg-brand text-white shadow-sm' : 'bg-bg text-muted hover:bg-line hover:text-ink',
  ].join(' ');
}

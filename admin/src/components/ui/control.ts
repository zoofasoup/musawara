// The one look for every text-like form control (Input, Textarea, NativeSelect). Change it here, not per page.
// 44px tall on phones for a comfortable touch target, 40px from tablet width up.
export const controlCls =
  "min-h-11 w-full min-w-0 rounded-xl border border-border2 bg-surface px-3 text-sm text-ink outline-none transition-colors " +
  "placeholder:text-muted focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-crit aria-invalid:ring-crit/20 md:min-h-10";

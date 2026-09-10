/** Classname helper — kept separate so ui.tsx only exports components (fast refresh). */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

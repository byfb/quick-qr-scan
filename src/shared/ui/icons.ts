export function icon(name: "copy" | "open" | "trash" | "list" | "close"): string {
  const paths: Record<typeof name, string> = {
    copy: '<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>',
    open: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/><path d="M15 3h6v6"/><path d="M5 5h5"/><path d="M5 5v14h14v-5"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

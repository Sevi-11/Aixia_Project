// Shared by the citation pills, the inline [n] markers and the sources panel,
// so all three name a chunk the same way.
export function sourceLabel(source) {
  const name = source?.original_filename || "source";
  // page comes off the PDF loader 0-based; readers count from 1.
  return Number.isInteger(source?.page) ? `${name} · p.${source.page + 1}` : name;
}

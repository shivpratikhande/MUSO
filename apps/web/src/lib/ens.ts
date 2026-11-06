/** MUSO username → ENS label, the same rule the API uses: `.` and `_` become `-`. */
export function ensLabel(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[._]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

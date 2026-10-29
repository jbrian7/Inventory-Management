export function isPublicTotePath(pathname: string) {
  return /^\/t\/[^/]+$/.test(pathname);
}

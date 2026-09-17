/** Routes that skip morning/shutdown/missed-log locks so a friend can use them without Dojo. */
export function isLiteAppRoute(pathname: string): boolean {
  return (
    pathname === '/contracts' ||
    pathname.startsWith('/contracts/') ||
    pathname === '/dojo' ||
    pathname.startsWith('/dojo/')
  )
}

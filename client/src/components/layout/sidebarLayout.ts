/**
 * The "collapsed" setting is a desktop rail preference (persisted). On mobile the sidebar is a drawer and must open
 * full width: applied there, a desktop-collapsed setting turns the drawer into a label-less strip that covers the
 * menu button.
 */
export function effectiveSidebarCollapsed(collapsedSetting: boolean, isMobile: boolean): boolean {
  return collapsedSetting && !isMobile;
}

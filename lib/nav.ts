export type NavItem = {
  href: string;
  label: string;
};

const baseNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/scan", label: "Scan" },
  { href: "/items", label: "Items" },
  { href: "/totes", label: "Totes" },
  { href: "/history", label: "History" },
];

export function primaryNav(showSettings: boolean): NavItem[] {
  if (!showSettings) {
    return baseNav;
  }
  return [...baseNav, { href: "/settings", label: "Settings" }];
}

export function navColumns(count: number) {
  if (count >= 6) {
    return "grid-cols-6";
  }
  if (count === 5) {
    return "grid-cols-5";
  }
  if (count === 4) {
    return "grid-cols-4";
  }
  return "grid-cols-3";
}

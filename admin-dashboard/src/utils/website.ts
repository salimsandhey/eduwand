// The public website (web) owns the Privacy Policy, Terms,
// About and Contact pages. The dashboard only links to them, so there is one
// copy of each page to look after. Unset in a build means "no website to link
// to": those links are hidden rather than pointing at a page that isn't there.
const WEBSITE_URL: string = (import.meta.env.VITE_WEBSITE_URL ?? "").replace(/\/+$/, "");

export const hasWebsite = WEBSITE_URL !== "";

export function websiteUrl(path: string): string {
  return `${WEBSITE_URL}${path}`;
}

// Older links (store listings, emails, the mobile app's web fallback) point at
// these dashboard paths. They now forward to the same page on the website.
export const WEBSITE_PATHS: Record<string, string> = {
  "/privacy": "/privacy",
  "/privacy-policy": "/privacy",
  "/terms": "/terms",
  "/terms-of-service": "/terms",
  "/about": "/about",
  "/contact": "/contact",
};

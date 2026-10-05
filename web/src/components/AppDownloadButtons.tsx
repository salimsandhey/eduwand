import React, { useEffect, useState } from 'react'
import { getAppLinks } from '../lib/api'
import type { AppLinks } from '../lib/api'

// "Get it on Google Play" / "Download on the App Store" buttons. The addresses
// are set by the EduWand team in the admin dashboard (App download links); a
// store that has no link yet gets no button, and with neither set this renders
// nothing.
const PlayIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3.6 2.3a1.5 1.5 0 0 0-.6 1.2v17a1.5 1.5 0 0 0 .6 1.2l9.5-9.7L3.6 2.3zm10.9 8.4 2.6-2.6L5.6 1.6l8.9 9.1zm0 2.6-8.9 9.1 11.5-6.5-2.6-2.6zm3.9-3.1-3.1 3.1 3.1 3.1 3.7-2.1a1.5 1.5 0 0 0 0-2.6l-3.7-1.5z" />
  </svg>
)
const AppleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.7 2.5 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.8-1.5z" />
  </svg>
)

export const AppDownloadButtons: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [links, setLinks] = useState<AppLinks | null>(null)

  useEffect(() => {
    let cancelled = false
    getAppLinks()
      .then((result) => {
        if (!cancelled) setLinks(result)
      })
      .catch(() => {
        // No links is fine: the buttons just don't show.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!links || (!links.playStoreUrl && !links.appStoreUrl)) return null

  const base = 'btn-press inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1F1F1F] hover:bg-black text-white transition-colors'
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {links.playStoreUrl ? (
        <a href={links.playStoreUrl} target="_blank" rel="noopener noreferrer" className={base} aria-label="Get it on Google Play">
          <PlayIcon />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-medium opacity-80">GET IT ON</span>
            <span className="block text-sm font-bold">Google Play</span>
          </span>
        </a>
      ) : null}
      {links.appStoreUrl ? (
        <a href={links.appStoreUrl} target="_blank" rel="noopener noreferrer" className={base} aria-label="Download on the App Store">
          <AppleIcon />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-medium opacity-80">DOWNLOAD ON THE</span>
            <span className="block text-sm font-bold">App Store</span>
          </span>
        </a>
      ) : null}
    </div>
  )
}

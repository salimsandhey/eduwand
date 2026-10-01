import React from 'react'
import { marked } from 'marked'
import { useContentPage } from '../lib/useContentPage'
import { sanitizeHtml } from '../lib/sanitizeHtml'

interface LegalPageProps {
  contentKey: string
}

// Privacy Policy, Terms and similar pages: the text lives in the database and
// is edited by the EduWand team in the admin dashboard (Website pages), so
// changing a clause never needs a website release.
export const LegalPage: React.FC<LegalPageProps> = ({ contentKey }) => {
  const { page, error, loading, retry } = useContentPage(contentKey)

  return (
    <div className="pt-24 pb-20 bg-[#F7F5F1] min-h-screen text-[#1F1F1F]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 space-y-3">
          {page ? (
            <>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight">{page.title}</h1>
              <p className="text-[#756C72] text-xs sm:text-sm font-medium">
                Last updated:{' '}
                {new Date(page.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          ) : (
            <div className="h-12 w-72 max-w-full mx-auto rounded-xl bg-[#E8E2D9] animate-pulse" aria-hidden="true" />
          )}
        </div>

        <div className="bg-white p-6 sm:p-12 rounded-2xl border border-[#E8E2D9] card-shadow text-left">
          {error ? (
            <div className="text-center space-y-4 py-6" role="alert">
              <p className="text-sm text-rose-600 font-medium">{error}</p>
              <button
                onClick={retry}
                className="btn-press px-5 py-2.5 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white text-sm font-bold cursor-pointer transition-colors"
              >
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading">
              {[100, 92, 96, 60, 100, 88, 94].map((w, i) => (
                <div key={i} className="h-4 rounded bg-[#EFEAE1] animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : page ? (
            <div
              className="markdown-body"
              // Written by EduWand admins, and sanitised anyway.
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(page.bodyMarkdown, { async: false })) }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

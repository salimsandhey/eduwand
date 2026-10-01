import React from 'react'
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2 } from 'lucide-react'

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="pt-24 pb-20 bg-[#F7F5F1] min-h-screen text-[#1F1F1F]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F7E6F2] border border-[#E9C9DE] text-[#7C005A] text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>Student & School Data Protection</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-[#756C72] text-xs sm:text-sm font-medium">
            Effective Date: October 1, 2026 | Last Updated: October 2026
          </p>
        </div>

        {/* Policy Content Card */}
        <div className="bg-white p-8 sm:p-12 rounded-2xl border border-[#E8E2D9] card-shadow text-left space-y-10">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#F7E6F2] text-[#7C005A]">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                1. Our Strict Commitment to Data Privacy
              </h2>
            </div>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              At EduWand ("we", "our", or "us"), we recognize that educational data requires the highest level of privacy and protection. This Privacy Policy outlines how we collect, process, store, and safeguard institutional school data, educator accounts, student records, and parental inquiries when you access or use the EduWand platform.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#FFF6E5] text-[#D28A00]">
                <Eye className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                2. Information We Collect
              </h2>
            </div>
            <div className="space-y-2 text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              <p>We strictly collect only the information necessary to provide and optimize our educational services:</p>
              <ul className="list-disc pl-5 space-y-1 text-[#4A4348]">
                <li><strong>Institutional Account Information:</strong> Educator names, work emails, school roles, and board affiliations.</li>
                <li><strong>School Enrolment & Lead Inquiries:</strong> Prospective parent inquiries, contact details, and follow-up status processed via the Enrolment Growth Engine.</li>
                <li><strong>Academic & AI Tool Usage:</strong> Topics requested for AI lesson generation, worksheet configurations, and anonymized interaction with the EduWand Cat AI Tutor.</li>
                <li><strong>Technical Diagnostics:</strong> IP address, device operating system, browser type, and system performance logs to guarantee platform reliability.</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#E0F7FA] text-[#00838F]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                3. Zero Public Model Training Guarantee
              </h2>
            </div>
            <div className="bg-[#FAF5F8] p-5 rounded-xl border border-[#E9C9DE] space-y-2 text-sm text-[#7C005A] font-medium pl-10">
              <div className="flex items-center gap-2 font-bold text-base text-[#1F1F1F]">
                <CheckCircle2 className="w-5 h-5 text-[#7C005A]" />
                <span>Your Data Remains Yours</span>
              </div>
              <p className="text-[#4A4348] text-sm leading-relaxed">
                EduWand guarantees that your proprietary school curricula, custom uploaded lesson materials, student records, and internal institutional documents are NEVER sold to third parties, shared with advertisers, or used to train public generative AI models.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#F3E5F5] text-[#6A1B9A]">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                4. Data Encryption & Security Controls
              </h2>
            </div>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              All data transmitted to or from EduWand servers is protected using industry-standard TLS 1.3 encryption. Stored data is encrypted at rest using AES-256 bit encryption. We maintain strict role-based access controls (RBAC) ensuring only authorized school administrators can view internal campus analytics.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-[#1F1F1F]">
              5. Children’s Data & K-12 Compliance
            </h2>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed">
              EduWand operates in strict compliance with applicable K-12 student data protection legislation. When students interact with the EduWand Cat AI Tutor, strict content safety guardrails prevent inappropriate responses and maintain an encouraging educational environment.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-[#1F1F1F]">
              6. Data Ownership & Deletion Rights
            </h2>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed">
              Schools retain complete ownership over all inputted data and generated lesson outputs. School administrators may request full data export or permanent deletion of institutional records by contacting <a href="mailto:privacy@eduwand.com" className="text-[#7C005A] font-bold hover:underline">privacy@eduwand.com</a>.
            </p>
          </section>

          {/* Section 7 */}
          <section className="pt-4 border-t border-[#E8E2D9]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Contact Our Privacy Officer</h3>
            <p className="text-xs text-[#5C5358] mt-1">
              For any privacy inquiries, compliance verification, or data deletion requests, contact us at <a href="mailto:privacy@eduwand.com" className="text-[#7C005A] font-bold hover:underline">privacy@eduwand.com</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}

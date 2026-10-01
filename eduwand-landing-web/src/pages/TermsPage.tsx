import React from 'react'
import { FileText, Scale, CheckCircle2, ShieldAlert } from 'lucide-react'

export const TermsPage: React.FC = () => {
  return (
    <div className="pt-24 pb-20 bg-[#F7F5F1] min-h-screen text-[#1F1F1F]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF6E5] border border-[#FCD87D] text-[#D28A00] text-xs font-bold">
            <Scale className="w-4 h-4" />
            <span>Terms & Conditions</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight">
            Terms of Service
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
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                1. Acceptance of Terms
              </h2>
            </div>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              By accessing, registering for, or using the EduWand platform, websites, AI lesson generation tools, Enrolment Growth Engine, or EduWand Cat AI Tutor ("Services"), you agree to be bound by these Terms of Service. If you are entering into these terms on behalf of a school, educational institution, or district, you represent that you have the authority to bind that entity to these terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#FFF6E5] text-[#D28A00]">
                <Scale className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                2. Description of Services
              </h2>
            </div>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              EduWand provides K-12 schools, leadership teams, teachers, and parents with an integrated software suite comprising AI-powered lesson and assessment generation, inquiry follow-up automation, academic analytics, and interactive student tutoring tools.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#E0F7FA] text-[#00838F]">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                3. Intellectual Property Rights & Ownership
              </h2>
            </div>
            <div className="space-y-2 text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>EduWand IP:</strong> All platform software, algorithms, brand assets, mascot designs, and user interface elements remain the exclusive property of EduWand Inc. and its licensors.</li>
                <li><strong>User Output Ownership:</strong> Teachers and school administrators retain full ownership of all lesson plans, worksheets, assessments, and custom content generated using EduWand.</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#F3E5F5] text-[#6A1B9A]">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                4. Acceptable Use Policy
              </h2>
            </div>
            <div className="space-y-2 text-[#4A4348] text-sm sm:text-base leading-relaxed pl-10">
              <p>When using EduWand, users agree NOT to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Reverse engineer, decompile, or attempt to extract source code or AI model parameters from EduWand.</li>
                <li>Use the platform to generate illegal, harmful, offensive, or non-curriculum compliant content.</li>
                <li>Attempt unauthorized access to multi-campus executive dashboards or secondary institutional accounts.</li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-[#1F1F1F]">
              5. Early Beta & Service Availability
            </h2>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed">
              For partner schools participating in our early access waitlist program, EduWand provides priority onboarding and beta feature previews. While we strive for 99.9% uptime, early access services are provided on an "as is" and "as available" basis.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-[#1F1F1F]">
              6. Limitation of Liability
            </h2>
            <p className="text-[#4A4348] text-sm sm:text-base leading-relaxed">
              To the maximum extent permitted by applicable law, EduWand shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our educational tools or platform services.
            </p>
          </section>

          {/* Section 7 */}
          <section className="pt-4 border-t border-[#E8E2D9]">
            <h3 className="text-base font-bold text-[#1F1F1F]">Questions About Our Terms?</h3>
            <p className="text-xs text-[#5C5358] mt-1">
              For questions regarding these Terms & Conditions, please contact <a href="mailto:legal@eduwand.com" className="text-[#7C005A] font-bold hover:underline">legal@eduwand.com</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { ChevronDown, GraduationCap, School, Users, ArrowRight } from 'lucide-react'

type RoleType = 'teacher' | 'leadership' | 'parent'

interface FaqItem {
  id: string
  num: string
  q: string
  a: string
}

export const FaqAccordion: React.FC = () => {
  const [activeRole, setActiveRole] = useState<RoleType>('teacher')
  const [openId, setOpenId] = useState<string | null>('teacher-1')

  const faqsByRole: Record<RoleType, FaqItem[]> = {
    teacher: [
      {
        id: 'teacher-1',
        num: '01',
        q: 'How does EduWand help me reduce lesson preparation time?',
        a: 'EduWand generates syllabus-aligned lesson plans, PowerPoint slides, and practice worksheets in under 30 seconds. You can easily review, edit, and customize every detail before taking it into the classroom.',
      },
      {
        id: 'teacher-2',
        num: '02',
        q: 'Does it support our specific curriculum (CBSE, ICSE, NCERT, IB, State Boards)?',
        a: 'Yes! EduWand is built with complete curriculum adaptability. Simply select your grade, subject, and board, and EduWand produces fully aligned learning materials instantly.',
      },
      {
        id: 'teacher-3',
        num: '03',
        q: 'Can I create differentiated worksheets for students at different learning speeds?',
        a: 'Absolutely. You can generate tiered assessments (Basic, Intermediate, Advanced) for the exact same topic with a single click, ensuring every student gets the right level of challenge.',
      },
      {
        id: 'teacher-4',
        num: '04',
        q: 'Will EduWand replace my personal teaching style or lesson flow?',
        a: 'Never. EduWand acts purely as your supercharged teaching assistant. It handles tedious formatting, research, and drafting so you have more energy to focus on engaging your students.',
      },
    ],
    leadership: [
      {
        id: 'leadership-1',
        num: '01',
        q: 'How does the Enrolment Growth Engine increase student admissions for our school?',
        a: 'The Enrolment Growth Engine automates the entire prospective parent inquiry lifecycle. It sends automated follow-ups via WhatsApp and SMS, schedules campus visits, and gives your admissions team a clear pipeline view to boost conversion rates.',
      },
      {
        id: 'leadership-2',
        num: '02',
        q: 'Can I monitor academic progress and staff performance across multiple campuses?',
        a: 'Yes. School leadership gets a unified multi-branch dashboard displaying attendance trends, fee collection status, academic metrics, and parent inquiry conversion rates in real time.',
      },
      {
        id: 'leadership-3',
        num: '03',
        q: 'Is student and school data secure and compliant with privacy regulations?',
        a: 'We enforce strict enterprise-grade encryption (AES-256) and privacy controls. EduWand never sells your data or uses your school’s private records to train public AI models.',
      },
      {
        id: 'leadership-4',
        num: '04',
        q: 'How fast can our administrative and teaching staff be onboarded?',
        a: 'Most schools complete full staff onboarding in 2 to 3 days. Our dedicated onboarding team provides hands-on setup, data migration support, and staff training sessions.',
      },
    ],
    parent: [
      {
        id: 'parent-1',
        num: '01',
        q: 'What is the EduWand Cat AI Tutor and how does it help my child?',
        a: 'The EduWand Cat AI Tutor is a friendly, 24/7 interactive learning assistant that explains complex subjects step-by-step, helps with homework, and keeps students motivated without giving away direct answers.',
      },
      {
        id: 'parent-2',
        num: '02',
        q: 'How can I track my child’s daily learning progress and attendance?',
        a: 'Parents get access to a dedicated parent dashboard and instant WhatsApp updates regarding daily attendance, homework assignments, and upcoming exam schedules.',
      },
      {
        id: 'parent-3',
        num: '03',
        q: 'Is the AI safe and age-appropriate for young K-12 students?',
        a: 'Yes. The EduWand Cat AI Tutor operates within strict educational guardrails. It blocks inappropriate content, maintains an encouraging tone, and prioritizes child safety at all times.',
      },
      {
        id: 'parent-4',
        num: '04',
        q: 'How does EduWand help parents who are unfamiliar with current curriculum standards?',
        a: 'EduWand translates complex curriculum topics into simple parent guides and step-by-step homework assistance, enabling you to support your child’s education effortlessly.',
      },
    ],
  }

  const roleConfigs = [
    {
      id: 'teacher' as RoleType,
      label: 'Teacher',
      icon: GraduationCap,
      badge: 'Lesson Plans & AI Tools',
      accentColor: '#7C005A',
      bgLight: '#F7E6F2',
      borderLight: '#E9C9DE',
    },
    {
      id: 'leadership' as RoleType,
      label: 'School Leadership',
      icon: School,
      badge: 'Admissions & Multi-Campus',
      accentColor: '#D28A00',
      bgLight: '#FFF6E5',
      borderLight: '#FCD87D',
    },
    {
      id: 'parent' as RoleType,
      label: 'Parent',
      icon: Users,
      badge: 'Cat AI Tutor & Homework',
      accentColor: '#00838F',
      bgLight: '#E0F7FA',
      borderLight: '#B2EBF2',
    },
  ]

  const currentConfig = roleConfigs.find((r) => r.id === activeRole)!
  const currentFaqs = faqsByRole[activeRole]

  const handleRoleChange = (role: RoleType) => {
    setActiveRole(role)
    setOpenId(`${role}-1`)
  }

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id)
  }

  const scrollToWaitlist = () => {
    const element = document.getElementById('waitlist-form')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Calculate sliding indicator transform X offset
  const getIndicatorTransform = () => {
    switch (activeRole) {
      case 'teacher':
        return 'translateX(0%)'
      case 'leadership':
        return 'translateX(100%)'
      case 'parent':
        return 'translateX(200%)'
      default:
        return 'translateX(0%)'
    }
  }

  return (
    <section id="faq" className="py-24 bg-[#F7F5F1]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-10 space-y-3">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1F1F1F]">
            Frequently Asked <span className="text-[#7C005A]">Questions</span>
          </h2>
          <p className="text-[#5C5358] text-base sm:text-lg max-w-xl mx-auto">
            Personalized answers tailored specifically to your role in education.
          </p>
        </div>

        {/* Personalized Role Selector Segmented Controls */}
        <div className="mb-12">
          <div className="text-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#756C72]">
              I am joining as a:
            </span>
          </div>

          <div className="bg-[#EBE7DF] p-1.5 rounded-2xl border border-[#E0DACE] relative max-w-xl mx-auto shadow-inner">
            {/* Smooth Sliding Pill Background */}
            <div
              className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc((100%-12px)/3)] bg-white rounded-xl card-shadow transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ transform: getIndicatorTransform() }}
            />

            <div className="grid grid-cols-3 relative z-10">
              {roleConfigs.map((role) => {
                const Icon = role.icon
                const isActive = activeRole === role.id

                return (
                  <button
                    key={role.id}
                    onClick={() => handleRoleChange(role.id)}
                    className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-colors duration-200 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                      isActive ? 'text-[#1F1F1F]' : 'text-[#5C5358] hover:text-[#1F1F1F]'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 transition-colors duration-200 ${
                        isActive ? 'text-[#7C005A]' : 'text-[#756C72]'
                      }`}
                    />
                    <span className="truncate">{role.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* FAQ Accordion List for Selected Role */}
        <div className="space-y-4">
          {currentFaqs.map((faq) => {
            const isOpen = openId === faq.id

            return (
              <div
                key={faq.id}
                className={`bg-white rounded-2xl border transition-all duration-300 card-shadow overflow-hidden text-left relative ${
                  isOpen
                    ? 'border-[#E8E2D9] ring-1 ring-[#7C005A]/15'
                    : 'border-[#E8E2D9] hover:border-[#D6CFB9]'
                }`}
              >
                {/* Role-colored Active Left Indicator */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300"
                  style={{
                    backgroundColor: isOpen ? currentConfig.accentColor : 'transparent',
                  }}
                />

                {/* Header Button */}
                <button
                  onClick={() => toggle(faq.id)}
                  className="w-full p-6 sm:p-7 pl-7 sm:pl-8 flex items-center justify-between gap-4 text-left cursor-pointer transition-colors duration-200"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="text-xs sm:text-sm font-extrabold font-mono transition-colors duration-200 px-2.5 py-1 rounded-lg"
                      style={{
                        backgroundColor: isOpen ? currentConfig.bgLight : '#F7F5F1',
                        color: isOpen ? currentConfig.accentColor : '#9E959B',
                      }}
                    >
                      {faq.num}
                    </span>
                    <span className="font-extrabold text-[#1F1F1F] text-base sm:text-lg leading-snug">
                      {faq.q}
                    </span>
                  </div>

                  {/* Expand/Collapse Chevron */}
                  <div
                    className="p-2 rounded-xl transition-all duration-300 flex-shrink-0"
                    style={{
                      backgroundColor: isOpen ? currentConfig.bgLight : '#F7F5F1',
                      color: isOpen ? currentConfig.accentColor : '#756C72',
                    }}
                  >
                    <ChevronDown
                      className={`w-5 h-5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </div>
                </button>

                {/* Smooth Grid Height & Opacity Expansion */}
                <div
                  className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 sm:px-7 pl-14 sm:pl-16 pb-6 pt-1 text-[#4A4348] text-sm sm:text-base leading-relaxed border-t border-[#F7F5F1]">
                      {faq.a}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Role-Personalized Bottom Callout Card */}
        <div className="mt-14 bg-white rounded-2xl border border-[#E8E2D9] p-8 sm:p-10 card-shadow text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <span
                className="text-xs font-extrabold px-2.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: currentConfig.bgLight,
                  color: currentConfig.accentColor,
                }}
              >
                For {currentConfig.label}s
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-extrabold text-[#1F1F1F]">
              {activeRole === 'teacher' && 'Ready to save 10+ hours per week on lesson planning?'}
              {activeRole === 'leadership' && 'Ready to boost student enrolment and multi-campus growth?'}
              {activeRole === 'parent' && 'Want your child to learn with the EduWand Cat AI Tutor?'}
            </h3>
            <p className="text-sm sm:text-base text-[#5C5358]">
              Join our priority waitlist today for early access and personalized partner support.
            </p>
          </div>
          <button
            onClick={scrollToWaitlist}
            className="btn-press flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white font-semibold text-sm shadow-xs cursor-pointer transition-colors"
          >
            <span>Join Waitlist as a {currentConfig.label}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </section>
  )
}



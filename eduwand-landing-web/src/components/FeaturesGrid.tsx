import React from 'react'
import { Sparkles, TrendingUp, Bot, BarChart3 } from 'lucide-react'
import { AiButtonCatMascotWeb } from './AiButtonCatMascotWeb'

export const FeaturesGrid: React.FC = () => {
  const features = [
    {
      id: 'lesson-gen',
      icon: Sparkles,
      color: 'text-[#7C005A]',
      bgCard: 'bg-[#F7E6F2]',
      borderCard: 'border-[#E9C9DE]',
      title: 'AI Lesson Generator',
      description:
        'Transform syllabus topics into complete, curriculum-aligned lesson plans, worksheets, and slides in under 30 seconds.',
    },
    {
      id: 'enrolment-engine',
      icon: TrendingUp,
      color: 'text-[#D28A00]',
      bgCard: 'bg-[#FFF6E5]',
      borderCard: 'border-[#FCD87D]',
      title: 'Enrolment Growth Engine',
      description:
        'Automated parent follow-ups, inquiry tracking, and front-desk workflows designed to increase school admissions.',
    },
    {
      id: 'cat-tutor',
      icon: Bot,
      color: 'text-[#00838F]',
      bgCard: 'bg-[#E0F7FA]',
      borderCard: 'border-[#B2EBF2]',
      title: 'EduWand Cat AI Tutor',
      description:
        'An engaging 24/7 mascot assistant that helps students understand tough concepts while assisting teachers.',
      hasMascot: true,
    },
    {
      id: 'analytics',
      icon: BarChart3,
      color: 'text-[#6A1B9A]',
      bgCard: 'bg-[#F3E5F5]',
      borderCard: 'border-[#E1BEE7]',
      title: 'Real-time Analytics',
      description:
        'Comprehensive dashboards tracking student attainment, class progress, and teacher workloads with actionable AI insights.',
    },
  ]

  return (
    <section id="features" className="py-24 bg-white border-y border-[#E8E2D9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1F1F1F]">
            Everything your school needs to{' '}
            <span className="text-[#7C005A]">
              thrive and excel
            </span>
          </h2>
          <p className="text-[#5C5358] text-base sm:text-lg">
            EduWand bridges administrative growth and classroom magic into a single unified workspace.
          </p>
        </div>

        {/* Single Row Grid Cards with Solid Background Colors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-16">
          {features.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <div
                key={idx}
                className={`relative ${feature.bgCard} p-6 rounded-2xl border ${feature.borderCard} card-shadow flex flex-col justify-between text-left group transition-transform duration-200 hover:-translate-y-1`}
              >
                {/* AI Button Cat Mascot with automatic eye gaze animation matching the app */}
                {feature.hasMascot && (
                  <div className="absolute -top-[75px] right-[20px] pointer-events-auto z-20">
                    <AiButtonCatMascotWeb size={85} />
                  </div>
                )}

                <div>
                  {/* Clean Icon without background box */}
                  <div className="mb-4">
                    <Icon className={`w-8 h-8 ${feature.color}`} />
                  </div>

                  <h3 className="text-xl font-extrabold text-[#1F1F1F] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-[#5C5358] text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}


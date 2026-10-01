import React, { useState } from 'react'
import { School, GraduationCap, Users, CheckCircle } from 'lucide-react'

export const RoleTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'leadership' | 'teachers' | 'parents'>('leadership')

  const roleData = {
    leadership: {
      title: 'Accelerate Admissions & Institutional Efficiency',
      subtitle: 'Streamline front-desk inquiries, track lead stages, and get high-level operational clarity.',
      benefits: [
        'Automated parent follow-up sequences via WhatsApp & SMS',
        'Real-time enrolment pipeline & conversion funnel tracking',
        'Teacher activity & academic syllabus coverage analytics',
        'Centralized multi-branch school management dashboard',
      ],
      quote: 'EduWand gave our admissions team instant clarity on parent follow-ups while reducing teacher administrative overhead by 40%.',
      author: 'Dr. R. Sharma, School Director',
    },
    teachers: {
      title: 'Supercharge Your Classroom & Reclaim Your Time',
      subtitle: 'Generate customized lesson plans, question banks, and grading rubrics instantly with AI.',
      benefits: [
        'AI Lesson Builder aligned with national & board standards',
        'One-click student assessment & personalized review feedback',
        'Interactive AI Cat Mascot assistant in your classroom',
        'Effortless homework tracking & student progress logs',
      ],
      quote: 'I went from spending entire weekends planning lessons to generating creative, engaging class activities in minutes.',
      author: 'Priya M., Senior Educator',
    },
    parents: {
      title: 'Total Transparency & 24/7 Learning Support',
      subtitle: 'Stay connected with your child’s academic progress and provide instant AI homework support at home.',
      benefits: [
        'Instant updates on student attendance, assignments & test scores',
        'Friendly EduWand Cat tutor for step-by-step homework help',
        'Direct communication channel with teachers & school office',
        'Personalized student strengths & areas for growth reports',
      ],
      quote: 'My daughter loves learning with the EduWand cat tutor! It makes homework stress-free for our whole family.',
      author: 'Sunita K., Parent',
    },
  }

  const current = roleData[activeTab]

  return (
    <section id="roles" className="py-20 bg-[#F7F5F1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header - Section tag removed */}
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1F1F1F]">
            Designed for every stakeholder in education
          </h2>
          <p className="text-[#5C5358] text-base sm:text-lg">
            Select your role to see how EduWand transforms your daily educational experience.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1.5 rounded-xl bg-[#F8EEF5] border border-[#E9C9DE]">
            <button
              onClick={() => setActiveTab('leadership')}
              className={`btn-press flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold cursor-pointer ${
                activeTab === 'leadership'
                  ? 'bg-[#7C005A] text-white shadow-xs'
                  : 'text-[#5C5358] hover:text-[#7C005A]'
              }`}
            >
              <School className="w-4 h-4" />
              <span>School Leadership</span>
            </button>
            <button
              onClick={() => setActiveTab('teachers')}
              className={`btn-press flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold cursor-pointer ${
                activeTab === 'teachers'
                  ? 'bg-[#7C005A] text-white shadow-xs'
                  : 'text-[#5C5358] hover:text-[#7C005A]'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Educators & Teachers</span>
            </button>
            <button
              onClick={() => setActiveTab('parents')}
              className={`btn-press flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold cursor-pointer ${
                activeTab === 'parents'
                  ? 'bg-[#7C005A] text-white shadow-xs'
                  : 'text-[#5C5358] hover:text-[#7C005A]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Parents & Students</span>
            </button>
          </div>
        </div>

        {/* Tab Content Box */}
        <div className="bg-white p-8 sm:p-12 rounded-2xl border border-[#E8E2D9] card-shadow text-left max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-7 space-y-6">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1F] leading-tight">
                {current.title}
              </h3>
              <p className="text-[#5C5358] text-base leading-relaxed">
                {current.subtitle}
              </p>

              <div className="space-y-3 pt-2">
                {current.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[#7C005A] flex-shrink-0 mt-0.5" />
                    <span className="text-[#3A3437] text-sm sm:text-base font-semibold">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="p-6 rounded-xl bg-[#F7E6F2] border border-[#E9C9DE] space-y-4 relative">
                <div className="text-3xl text-[#7C005A] font-serif leading-none">"</div>
                <p className="text-[#3A3437] italic text-sm sm:text-base leading-relaxed">
                  {current.quote}
                </p>
                <div className="pt-2 border-t border-[#E9C9DE] text-xs font-bold text-[#7C005A]">
                  — {current.author}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  )
}

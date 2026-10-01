import React, { useState, useRef, useEffect } from 'react'
import confetti from 'canvas-confetti'
import { CheckCircle2, ArrowRight, ChevronDown, GraduationCap, School, Users, Check } from 'lucide-react'
import { CatMascotWeb } from './CatMascotWeb'
import { joinWaitlist } from '../lib/api'

export const HeroSection: React.FC = () => {
  const [role, setRole] = useState<'teacher' | 'leadership' | 'parent'>('teacher')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close custom dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    setSending(true)
    try {
      await joinWaitlist({ email: email.trim(), role })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist. Please try again.')
      setSending(false)
      return
    }
    setSending(false)
    setSubmitted(true)

    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#7C005A', '#FBAA0A', '#FB5F7E', '#52DFD6'],
      })
    } catch {
      // fallback
    }
  }

  const roleOptions = [
    { id: 'teacher' as const, label: 'Teacher', icon: GraduationCap },
    { id: 'leadership' as const, label: 'School Leader', icon: School },
    { id: 'parent' as const, label: 'Parent / Student', icon: Users },
  ]

  const currentRoleObj = roleOptions.find((r) => r.id === role)!

  return (
    <section id="waitlist-form" className="relative pt-10 pb-20 md:pt-16 md:pb-28 bg-[#F7F5F1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Headline & Form */}
          <div className="lg:col-span-7 space-y-8 text-left">
            
            {/* Main Headline - Solid Typography */}
            <h1 className="text-4xl sm:text-6xl font-extrabold text-[#1F1F1F] tracking-tight leading-[1.12]">
              Magic in Learning.{' '}
              <span className="text-[#7C005A]">
                Precision in Growth.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-xl text-[#4A4348] max-w-2xl leading-relaxed">
              EduWand unites AI lesson generation, automated enrolment follow-ups, real-time student analytics, and an interactive AI tutor into one seamless platform.
            </p>

            {/* Professional Waitlist Card */}
            <div className="bg-white p-6 sm:p-7 rounded-2xl border border-[#E8E2D9] card-shadow relative">
              <div className="mb-3">
                <h3 className="text-sm font-extrabold text-[#1F1F1F] uppercase tracking-wider">
                  Request Priority Access
                </h3>
              </div>

              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] focus-within:border-[#7C005A] focus-within:bg-white transition-all">
                    
                    {/* Custom Styled Role Dropdown */}
                    <div className="relative border-b sm:border-b-0 sm:border-r border-[#E8E2D9] px-2 py-1" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white text-xs sm:text-sm font-extrabold text-[#1F1F1F] transition-colors cursor-pointer"
                      >
                        <currentRoleObj.icon className="w-4 h-4 text-[#7C005A] flex-shrink-0" />
                        <span className="text-xs font-bold text-[#756C72] hidden sm:inline whitespace-nowrap">
                          I am a:
                        </span>
                        <span className="whitespace-nowrap">{currentRoleObj.label}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-[#756C72] transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Custom Dropdown Popover */}
                      {dropdownOpen && (
                        <div className="absolute left-0 top-full mt-2 w-48 bg-white border border-[#E8E2D9] rounded-xl card-shadow-lg z-50 p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                          {roleOptions.map((opt) => {
                            const Icon = opt.icon
                            const isSelected = role === opt.id
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setRole(opt.id)
                                  setDropdownOpen(false)
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#F7E6F2] text-[#7C005A]'
                                    : 'text-[#3A3437] hover:bg-[#F7F5F1]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#7C005A]' : 'text-[#756C72]'}`} />
                                  <span>{opt.label}</span>
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-[#7C005A]" />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Email Input */}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your institutional email address..."
                      className="flex-1 px-3 py-2 bg-transparent text-[#1F1F1F] placeholder-[#9E959B] text-sm focus:outline-none"
                      required
                    />

                    {/* Submit CTA */}
                    <button
                      type="submit"
                      disabled={sending}
                      className="btn-press px-5 py-2.5 rounded-lg bg-[#7C005A] hover:bg-[#600045] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
                    >
                      <span>{sending ? 'Joining…' : 'Join Waitlist'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {error && <p className="text-xs text-rose-600 font-medium px-1">{error}</p>}
                </form>
              ) : (
                <div className="p-4 rounded-xl bg-[#F7E6F2] border border-[#E9C9DE] flex items-center gap-3 text-[#7C005A]">
                  <CheckCircle2 className="w-6 h-6 text-[#7C005A] flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-[#1F1F1F] text-sm sm:text-base">Waitlist Registration Confirmed</h4>
                    <p className="text-xs text-[#5C5358]">
                      Your early access request has been recorded. Check your inbox for a confirmation, and we will contact you with onboarding details.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Hero Cat Mascot */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <CatMascotWeb width={420} height={380} trackMouse={true} />
          </div>

        </div>
      </div>
    </section>
  )
}



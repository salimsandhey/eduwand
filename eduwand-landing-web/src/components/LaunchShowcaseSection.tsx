import React, { useState, useRef, useCallback } from 'react'
import { MoveHorizontal, ArrowRight, Wand2, CheckCircle2 } from 'lucide-react'

import mascotFull from '../assets/decorative/mascot-full-body.png'
import generationHero from '../assets/decorative/decor-generation-hero.png'
import conversionCard from '../assets/decorative/decor-hero-conversion-card.png'
import followupCard from '../assets/decorative/decor-hero-followup-card.png'

interface LaunchShowcaseProps {
  onJoinClick?: () => void
}

export const LaunchShowcaseSection: React.FC<LaunchShowcaseProps> = ({ onJoinClick }) => {
  // Reveal percentage slider (0 to 100)
  const [revealPos, setRevealPos] = useState<number>(50)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const offsetX = clientX - rect.left
    const percent = Math.max(5, Math.min(95, (offsetX / rect.width) * 100))
    setRevealPos(percent)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    handleMove(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      handleMove(e.clientX)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX)
    }
  }

  return (
    <section id="coming-soon-portal" className="py-24 bg-[#F7F5F1] border-y border-[#E8E2D9] relative overflow-hidden select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Editorial Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-block px-3.5 py-1.5 rounded-md bg-[#F7E6F2] border border-[#E9C9DE] text-[#7C005A] text-xs font-bold uppercase tracking-wider">
            Interactive App Preview
          </div>
          <h2 className="text-4xl sm:text-6xl font-extrabold text-[#1F1F1F] tracking-tight leading-[1.08]">
            Unwrap the Future of{' '}
            <span className="text-[#7C005A]">EduWand.</span>
          </h2>
          <p className="text-[#5C5358] text-base sm:text-lg">
            Drag the magic wand slider below to peel back the veil and reveal the EduWand mobile & web app interface!
          </p>
        </div>

        {/* Awwwards Magic Portal Drag-to-Reveal Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          className="relative max-w-5xl mx-auto h-[480px] sm:h-[560px] rounded-3xl border border-[#E8E2D9] card-shadow-lg overflow-hidden cursor-ew-resize bg-white"
        >
          {/* Layer 1: Underneath Revealed Layer (Actual App Interface Showcase) */}
          <div className="absolute inset-0 bg-white p-6 sm:p-10 flex flex-col justify-between text-left">
            
            {/* Top Bar of Revealed App */}
            <div className="flex items-center justify-between pb-6 border-b border-[#E8E2D9]">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="ml-2 text-xs font-bold text-[#7C005A] uppercase tracking-wider">
                  EduWand App Workspace • Live Preview
                </span>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-md bg-[#F7E6F2] text-[#7C005A]">
                100% Unveiled
              </span>
            </div>

            {/* Revealed App Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-auto items-center">
              
              {/* App Card 1: AI Lesson Generation */}
              <div className="md:col-span-6 bg-[#F7F5F1] p-5 sm:p-6 rounded-2xl border border-[#E8E2D9] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#7C005A] uppercase">AI Module</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Ready
                  </span>
                </div>
                <h4 className="text-lg font-bold text-[#1F1F1F]">Lesson Plan & Slide Builder</h4>
                <img
                  src={generationHero}
                  alt="AI Generation"
                  className="w-full h-36 object-contain rounded-xl bg-white p-2 border border-[#E8E2D9]"
                />
              </div>

              {/* App Card 2: Enrolment Conversion Dashboard */}
              <div className="md:col-span-6 space-y-4">
                <div className="bg-[#F7F5F1] p-4 rounded-2xl border border-[#E8E2D9] flex items-center gap-4">
                  <img src={conversionCard} alt="" className="w-24 h-16 object-contain" />
                  <div>
                    <h5 className="text-sm font-bold text-[#1F1F1F]">Enrolment Growth Funnel</h5>
                    <p className="text-xs text-[#5C5358]">Automated inquiry follow-up sequence</p>
                  </div>
                </div>

                <div className="bg-[#F7F5F1] p-4 rounded-2xl border border-[#E8E2D9] flex items-center gap-4">
                  <img src={followupCard} alt="" className="w-24 h-16 object-contain" />
                  <div>
                    <h5 className="text-sm font-bold text-[#1F1F1F]">Parent Engagement Tracker</h5>
                    <p className="text-xs text-[#5C5358]">88% response rate on WhatsApp/SMS</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer of Revealed App */}
            <div className="pt-4 border-t border-[#E8E2D9] flex items-center justify-between text-xs text-[#756C72]">
              <span className="font-semibold">EduWand Unified App Engine</span>
              <span className="font-bold text-[#7C005A]">iOS • Android • Web</span>
            </div>
          </div>

          {/* Layer 2: Cover Layer (Coming Soon Veil) - Clipped dynamically by revealPos */}
          <div
            className="absolute inset-0 bg-[#F7F5F1] p-6 sm:p-10 flex flex-col justify-between text-left border-r border-[#7C005A]/40"
            style={{ clipPath: `polygon(0 0, ${revealPos}% 0, ${revealPos}% 100%, 0 100%)` }}
          >
            {/* Top Bar of Cover */}
            <div className="flex items-center justify-between pb-6 border-b border-[#E8E2D9]">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#7C005A] text-white text-xs font-bold uppercase tracking-wider">
                <Wand2 className="w-3.5 h-3.5" />
                <span>Launching 2026</span>
              </div>
              <span className="text-xs font-bold text-[#756C72] uppercase tracking-wider">
                Drag Slider To Reveal &rarr;
              </span>
            </div>

            {/* Main Cover Content */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center my-auto">
              <div className="md:col-span-7 space-y-4">
                <h3 className="text-3xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight leading-tight">
                  The Spell is <br />
                  <span className="text-[#7C005A]">Almost Cast.</span>
                </h3>
                <p className="text-sm sm:text-base text-[#5C5358] max-w-md leading-relaxed">
                  EduWand is undergoing final institutional verification. Public release across App Store, Google Play, and Web is approaching.
                </p>
              </div>

              <div className="md:col-span-5 flex justify-center">
                <img
                  src={mascotFull}
                  alt="EduWand Mascot"
                  className="h-44 sm:h-56 w-auto object-contain drop-shadow-md"
                />
              </div>
            </div>

            {/* Bottom Bar of Cover */}
            <div className="pt-4 border-t border-[#E8E2D9] flex items-center justify-between text-xs text-[#756C72]">
              <span className="font-semibold">EduWand Inc. All Rights Reserved</span>
              <span className="font-bold text-[#7C005A]">V1.0 Beta Testing Stage</span>
            </div>
          </div>

          {/* Interactive Wand Slider Divider Handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-[#7C005A] pointer-events-none z-30"
            style={{ left: `${revealPos}%` }}
          >
            {/* Handle Button */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#7C005A] text-white flex items-center justify-center shadow-lg border-2 border-white cursor-ew-resize">
              <MoveHorizontal className="w-5 h-5" />
            </div>
          </div>

          {/* Floating Reveal Indicator Tag */}
          <div
            className="absolute top-4 z-40 bg-[#1F1F1F] text-white px-3 py-1 rounded-md text-xs font-bold shadow-md pointer-events-none -translate-x-1/2"
            style={{ left: `${revealPos}%` }}
          >
            {Math.round(revealPos)}% REVEALED
          </div>
        </div>

        {/* Bottom Callout & Action */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-white border border-[#E8E2D9] card-shadow text-left max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-[#F7E6F2] text-[#7C005A]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#1F1F1F]">Want early VIP deployment for your school?</h4>
              <p className="text-xs sm:text-sm text-[#5C5358]">Join the waitlist to receive priority 1-on-1 onboarding before public launch.</p>
            </div>
          </div>

          <button
            onClick={() => {
              if (onJoinClick) onJoinClick()
              else {
                const el = document.getElementById('waitlist-form')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="btn-press flex-shrink-0 px-6 py-3 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer flex items-center gap-2"
          >
            <span>Request Priority Access</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </section>
  )
}

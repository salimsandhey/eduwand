import React, { useState, useEffect } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import logoColor from '../assets/brand/EduWand-Logo.png'

interface NavbarProps {
  onJoinClick?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onJoinClick }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      setScrolled(scrollY > 40)

      if (location.pathname === '/') {
        const features = document.getElementById('features')
        const faq = document.getElementById('faq')

        if (faq && scrollY >= faq.offsetTop - 200) {
          setActiveSection('faq')
        } else if (features && scrollY >= features.offsetTop - 200) {
          setActiveSection('features')
        } else {
          setActiveSection('')
        }
      } else {
        setActiveSection('')
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [location.pathname])

  const handleNavClick = (sectionId: string) => {
    setMobileMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        const element = document.getElementById(sectionId)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' })
        }
      }, 100)
    } else {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  const handleLogoClick = () => {
    setMobileMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <header className="sticky top-0 z-50 pointer-events-none w-full">
      {/* Outer Morphing Wrapper */}
      <div
        className={`w-full pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          scrolled ? 'px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4' : 'px-0 pt-0'
        }`}
      >
        {/* Inner Morphing Navbar Bar */}
        <div
          className={`w-full mx-auto flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] bg-white/95 backdrop-blur-md ${
            scrolled
              ? 'max-w-7xl h-16 rounded-2xl border border-[#E8E2D9] card-shadow-lg px-6'
              : 'max-w-[100vw] h-20 rounded-none border-b border-t-0 border-x-0 border-[#E8E2D9] shadow-none px-4 sm:px-6 lg:px-8'
          }`}
        >
          {/* Content Alignment Grid */}
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo & Brand */}
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={handleLogoClick}
            >
              <img
                src={logoColor}
                alt="EduWand Logo"
                className="h-8 sm:h-9 w-auto object-contain transition-all duration-300"
              />
            </div>

            {/* Desktop Navigation Links with ScrollSpy indicator */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => handleNavClick('features')}
                className={`text-sm font-semibold transition-colors cursor-pointer relative py-1 ${
                  activeSection === 'features'
                    ? 'text-[#7C005A]'
                    : 'text-[#3A3437] hover:text-[#7C005A]'
                }`}
              >
                <span>Features</span>
                {activeSection === 'features' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C005A] rounded-full animate-in fade-in duration-200" />
                )}
              </button>

              <button
                onClick={() => handleNavClick('faq')}
                className={`text-sm font-semibold transition-colors cursor-pointer relative py-1 ${
                  activeSection === 'faq'
                    ? 'text-[#7C005A]'
                    : 'text-[#3A3437] hover:text-[#7C005A]'
                }`}
              >
                <span>FAQ</span>
                {activeSection === 'faq' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C005A] rounded-full animate-in fade-in duration-200" />
                )}
              </button>

              <Link
                to="/contact"
                className={`text-sm font-semibold transition-colors cursor-pointer relative py-1 ${
                  location.pathname === '/contact'
                    ? 'text-[#7C005A]'
                    : 'text-[#3A3437] hover:text-[#7C005A]'
                }`}
              >
                <span>Contact</span>
                {location.pathname === '/contact' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C005A] rounded-full animate-in fade-in duration-200" />
                )}
              </Link>
            </div>

            {/* Desktop CTA Button */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={onJoinClick || (() => handleNavClick('waitlist-form'))}
                className="btn-press group inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white font-semibold text-sm shadow-xs cursor-pointer transition-all duration-300"
              >
                <span>Join Waitlist</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="flex md:hidden items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl bg-[#F7F5F1] text-[#1F1F1F] hover:bg-[#F7E6F2] border border-[#E8E2D9] transition-all duration-300"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto md:hidden max-w-7xl mx-auto mt-2 bg-white border border-[#E8E2D9] rounded-2xl p-4 space-y-3 card-shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              onClick={() => handleNavClick('features')}
              className="block w-full text-left py-2 text-[#1F1F1F] hover:text-[#7C005A] font-semibold"
            >
              Features
            </button>
            <button
              onClick={() => handleNavClick('faq')}
              className="block w-full text-left py-2 text-[#1F1F1F] hover:text-[#7C005A] font-semibold"
            >
              FAQ
            </button>
            <Link
              to="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left py-2 text-[#1F1F1F] hover:text-[#7C005A] font-semibold"
            >
              Contact Us
            </Link>
            <div className="pt-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  onJoinClick ? onJoinClick() : handleNavClick('waitlist-form')
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white font-semibold text-sm shadow-xs"
              >
                <span>Join Waitlist Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}





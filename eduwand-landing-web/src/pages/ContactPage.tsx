import React, { useState } from 'react'
import confetti from 'canvas-confetti'
import { Mail, MapPin, Send, CheckCircle2, Building2 } from 'lucide-react'


export const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    schoolName: '',
    role: 'teacher',
    subject: '',
    message: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.message) {
      setError('Please fill in all required fields.')
      return
    }
    setError('')
    setSubmitted(true)

    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#7C005A', '#FBAA0A', '#FB5F7E'],
      })
    } catch {
      // fallback
    }
  }

  return (
    <div className="pt-24 pb-20 bg-[#F7F5F1] min-h-screen text-[#1F1F1F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight">
            Get in Touch with <span className="text-[#7C005A]">EduWand</span>
          </h1>
          <p className="text-[#5C5358] text-base sm:text-lg leading-relaxed">
            Have questions about school onboarding, AI modules, or institutional pricing? Our team is here to assist you.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Left Column: Contact Details & Info */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white p-8 rounded-2xl border border-[#E8E2D9] card-shadow space-y-6 text-left">
              <h2 className="text-xl font-extrabold text-[#1F1F1F]">
                Contact Information
              </h2>
              <p className="text-[#5C5358] text-sm leading-relaxed">
                Reach out directly to our institutional team or request a personalized walkthrough for your school.
              </p>

              <div className="space-y-5 pt-2">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-[#F7E6F2] text-[#7C005A] flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1F1F1F]">Institutional & Support Email</h4>
                    <a href="mailto:support@eduwand.com" className="text-sm text-[#7C005A] font-semibold hover:underline">
                      support@eduwand.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-[#FFF6E5] text-[#D28A00] flex-shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1F1F1F]">School Partnerships</h4>
                    <a href="mailto:partnerships@eduwand.com" className="text-sm text-[#D28A00] font-semibold hover:underline">
                      partnerships@eduwand.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-[#E0F7FA] text-[#00838F] flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1F1F1F]">Office Location</h4>
                    <p className="text-sm text-[#5C5358]">
                      EduWand Tech Center, Foveainfotech Campus<br />
                      India & Global Support Hub
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Operating Hours Box */}
            <div className="bg-white p-6 rounded-2xl border border-[#E8E2D9] card-shadow text-left">
              <h3 className="text-sm font-extrabold text-[#1F1F1F] mb-1">
                Support Hours
              </h3>
              <p className="text-xs text-[#5C5358] leading-relaxed">
                Monday to Saturday: 9:00 AM – 6:00 PM IST<br />
                Dedicated 24/7 priority assistance for partner school administrators.
              </p>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <div className="bg-white p-8 sm:p-10 rounded-2xl border border-[#E8E2D9] card-shadow text-left">
              <h2 className="text-2xl font-extrabold text-[#1F1F1F] mb-6">
                Send Us a Message
              </h2>

              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Dr. Rajesh Sharma"
                        className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                        Institutional Email *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="e.g. rsharma@school.edu"
                        className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                        School / Institution Name
                      </label>
                      <input
                        type="text"
                        value={formData.schoolName}
                        onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                        placeholder="e.g. DPS International"
                        className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                        Your Role
                      </label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors cursor-pointer"
                      >
                        <option value="teacher">Teacher / Educator</option>
                        <option value="leadership">School Principal / Director</option>
                        <option value="admin">Administrator / IT</option>
                        <option value="parent">Parent / Student</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="e.g. Inquiry about multi-campus dashboard"
                      className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3A3437] uppercase mb-2">
                      How Can We Help? *
                    </label>
                    <textarea
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Tell us about your school needs or questions..."
                      className="w-full px-4 py-3 rounded-xl bg-[#F7F5F1] border border-[#E8E2D9] text-[#1F1F1F] text-sm focus:outline-none focus:border-[#7C005A] focus:bg-white transition-colors"
                      required
                    />
                  </div>

                  {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

                  <button
                    type="submit"
                    className="btn-press w-full py-4 rounded-xl bg-[#7C005A] hover:bg-[#600045] text-white font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <span>Send Message</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="p-8 rounded-xl bg-[#F7E6F2] border border-[#E9C9DE] text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-[#7C005A] mx-auto" />
                  <h3 className="text-xl font-extrabold text-[#1F1F1F]">Message Received!</h3>
                  <p className="text-sm text-[#5C5358] max-w-md mx-auto leading-relaxed">
                    Thank you for reaching out. A representative from the EduWand team will get back to your institutional email shortly.
                  </p>
                  <button
                    onClick={() => {
                      setSubmitted(false)
                      setFormData({ name: '', email: '', schoolName: '', role: 'teacher', subject: '', message: '' })
                    }}
                    className="text-xs font-bold text-[#7C005A] hover:underline pt-2"
                  >
                    Send another message
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

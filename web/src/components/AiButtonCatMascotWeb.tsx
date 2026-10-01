import React, { useEffect, useState } from 'react'

import aiEyesWhite from '../assets/decorative/AI-button-icon-eyes-white.png'
import aiFrame from '../assets/decorative/AI-button-icon-frame.png'

const SOURCE_WIDTH = 1254
const SOURCE_HEIGHT = 1254

const EYES = [
  {
    name: 'left',
    cx: 401.4 / SOURCE_WIDTH,
    cy: 843.7 / SOURCE_HEIGHT,
    w: 219.0 / SOURCE_WIDTH,
    h: 264.0 / SOURCE_HEIGHT,
    angleDeg: -12.5,
    pupilRFrac: 74 / 264,
    pupilRestingDxFrac: 23.6 / 264,
    pupilRestingDyFrac: -8.0 / 264,
    hl1RFrac: 20.5 / 264,
    hl1OffsetDxFrac: -23.5 / 264,
    hl1OffsetDyFrac: -23.5 / 264,
    hl2RFrac: 9.8 / 264,
    hl2OffsetDxFrac: 26.0 / 264,
    hl2OffsetDyFrac: 20.5 / 264,
  },
  {
    name: 'right',
    cx: 719.5 / SOURCE_WIDTH,
    cy: 703.3 / SOURCE_HEIGHT,
    w: 235.0 / SOURCE_WIDTH,
    h: 236.0 / SOURCE_HEIGHT,
    angleDeg: -14.0,
    pupilRFrac: 78 / 236,
    pupilRestingDxFrac: -0.5 / 236,
    pupilRestingDyFrac: 2.6 / 236,
    hl1RFrac: 20.5 / 236,
    hl1OffsetDxFrac: -23.5 / 236,
    hl1OffsetDyFrac: -23.5 / 236,
    hl2RFrac: 9.8 / 236,
    hl2OffsetDxFrac: 26.0 / 236,
    hl2OffsetDyFrac: 20.5 / 236,
  },
]

const FUR_COLOR = '#A9006F'

interface AiButtonCatMascotWebProps {
  className?: string
  size?: number
}

export const AiButtonCatMascotWeb: React.FC<AiButtonCatMascotWebProps> = ({
  className = '',
  size = 85,
}) => {
  // 1 = closed lid, 0 = wide open
  const [blink, setBlink] = useState(0)
  const [currentGaze, setCurrentGaze] = useState({ x: 0, y: 0 })

  // Blinking loop matching mobile app's AnimatedAiButtonMascot
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const animateBlink = async (duration: number, target: number) => {
      if (cancelled) return
      setBlink(target)
      await new Promise((r) => setTimeout(r, duration))
    }

    const doQuickBlink = async () => {
      await animateBlink(110, 1) // shut
      await new Promise((r) => setTimeout(r, 30))
      await animateBlink(170, 0) // open
    }

    const scheduleNextBlink = () => {
      const delay = 2500 + Math.random() * 2200
      timer = setTimeout(async () => {
        if (cancelled) return
        await doQuickBlink()
        if (Math.random() < 0.3) {
          await new Promise((r) => setTimeout(r, 60))
          await doQuickBlink()
        }
        scheduleNextBlink()
      }, delay)
    }

    scheduleNextBlink()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Automatic eye gaze animation loop matching mobile app's AnimatedAiButtonMascot
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const gazeSequence = [
      { x: 0, y: 0, pauseMs: 1500, duration: 150 }, // Resting Center
      { x: 0.85, y: -0.85, pauseMs: 1700, duration: 180 }, // Look up-right at star wand!
      { x: 0.5, y: 0, pauseMs: 1200, duration: 140 }, // Glance right
      { x: 0, y: 0, pauseMs: 1400, duration: 130 }, // Center
      { x: -0.75, y: 0.2, pauseMs: 1500, duration: 170 }, // Glance left
      { x: -0.4, y: 0.6, pauseMs: 1100, duration: 150 }, // Glance down-left
      { x: 0, y: 0, pauseMs: 1500, duration: 140 }, // Center
      { x: 0, y: 0.7, pauseMs: 1200, duration: 160 }, // Glance down
      { x: 0.65, y: -0.4, pauseMs: 1300, duration: 160 }, // Glance upper-right
      { x: 0, y: 0, pauseMs: 1600, duration: 130 }, // Center
    ]

    let step = 0

    const moveToNextGaze = () => {
      if (cancelled) return
      const target = gazeSequence[step]
      step = (step + 1) % gazeSequence.length

      const jitterX = (Math.random() - 0.5) * 0.05
      const jitterY = (Math.random() - 0.5) * 0.05
      const targetX = Math.max(-1, Math.min(1, target.x + (target.x === 0 ? 0 : jitterX)))
      const targetY = Math.max(-1, Math.min(1, target.y + (target.y === 0 ? 0 : jitterY)))

      setCurrentGaze({ x: targetX, y: targetY })

      timer = setTimeout(moveToNextGaze, target.pauseMs + target.duration + Math.random() * 400)
    }

    timer = setTimeout(moveToNextGaze, 800)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  const handleCatClick = () => {
    setBlink(1)
    setTimeout(() => {
      setBlink(0)
    }, 220)
  }

  // Dimension Calculations
  const renderedWidth = size
  const renderedHeight = size
  const offsetX = 0
  const offsetY = 0

  return (
    <div
      onClick={handleCatClick}
      className={`relative select-none cursor-pointer group ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      title="EduWand AI Mascot"
    >
      {/* Layer 1: Base Cat Icon with Pure White Scleras */}
      <img
        src={aiEyesWhite}
        alt="EduWand AI Button Cat Mascot"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Layer 2: Moving Pupils & Eyelid inside rotated Eye Container */}
      {EYES.map((eye, index) => {
        const eyeWidth = eye.w * renderedWidth
        const eyeHeight = eye.h * renderedHeight
        const left = offsetX + eye.cx * renderedWidth - eyeWidth / 2
        const top = offsetY + eye.cy * renderedHeight - eyeHeight / 2

        const pupilDiameter = eye.pupilRFrac * 2 * eyeHeight
        const restingX = eyeWidth / 2 + eye.pupilRestingDxFrac * eyeHeight - pupilDiameter / 2
        const restingY = eyeHeight / 2 + eye.pupilRestingDyFrac * eyeHeight - pupilDiameter / 2

        const hl1Size = eye.hl1RFrac * 2 * eyeHeight
        const hl1Left = pupilDiameter / 2 + eye.hl1OffsetDxFrac * eyeHeight - hl1Size / 2
        const hl1Top = pupilDiameter / 2 + eye.hl1OffsetDyFrac * eyeHeight - hl1Size / 2

        const hl2Size = eye.hl2RFrac * 2 * eyeHeight
        const hl2Left = pupilDiameter / 2 + eye.hl2OffsetDxFrac * eyeHeight - hl2Size / 2
        const hl2Top = pupilDiameter / 2 + eye.hl2OffsetDyFrac * eyeHeight - hl2Size / 2

        const maxShiftX = eyeWidth * 0.16
        const maxShiftY = eyeHeight * 0.14

        const shiftX = currentGaze.x * maxShiftX
        const shiftY = currentGaze.y * maxShiftY

        const lidTranslateY = -eyeHeight + blink * eyeHeight

        return (
          <div
            key={`ai-eye-${index}`}
            className="absolute overflow-hidden pointer-events-none bg-white"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${eyeWidth}px`,
              height: `${eyeHeight}px`,
              borderRadius: `${Math.min(eyeWidth, eyeHeight) * 0.5}px`,
              transform: `rotate(${eye.angleDeg}deg)`,
              zIndex: 2,
            }}
          >
            {/* Animated Black Pupil & Dual Sparkle Highlights */}
            <div
              className="absolute bg-[#0A0A0A] rounded-full transition-transform duration-300 ease-out"
              style={{
                left: `${restingX}px`,
                top: `${restingY}px`,
                width: `${pupilDiameter}px`,
                height: `${pupilDiameter}px`,
                transform: `translate(${shiftX}px, ${shiftY}px)`,
              }}
            >
              <div
                className="absolute bg-white rounded-full"
                style={{
                  left: `${hl1Left}px`,
                  top: `${hl1Top}px`,
                  width: `${hl1Size}px`,
                  height: `${hl1Size}px`,
                }}
              />
              <div
                className="absolute bg-white rounded-full"
                style={{
                  left: `${hl2Left}px`,
                  top: `${hl2Top}px`,
                  width: `${hl2Size}px`,
                  height: `${hl2Size}px`,
                }}
              />
            </div>

            {/* Eyelid Cover INSIDE eye container */}
            <div
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                backgroundColor: FUR_COLOR,
                transform: `translateY(${lidTranslateY}px)`,
                transition: 'transform 0.12s ease-out',
                zIndex: 5,
              }}
            />
          </div>
        )
      })}

      {/* Layer 3: Outer Frame Overlay */}
      <img
        src={aiFrame}
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ zIndex: 10 }}
      />
    </div>
  )
}

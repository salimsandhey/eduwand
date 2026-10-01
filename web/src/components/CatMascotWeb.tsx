import React, { useEffect, useRef, useState } from 'react'

import catEyesWhite from '../assets/decorative/decor-teacher-lesson-cat-eyes-white.png'
import catFrame from '../assets/decorative/decor-teacher-lesson-cat-frame.png'

const SOURCE_WIDTH = 1024
const SOURCE_HEIGHT = 923

const EYES = [
  {
    name: 'left',
    cx: 0.2417,
    cy: 0.6603,
    w: 0.1768 * 1.08,
    h: 0.1528 * 1.12,
    angleDeg: -23.02,
    localXFrac: 0.12076,
    localYFrac: -0.01185,
    pupilDiameterFrac: 0.519,
    hlOffsetDxFrac: -0.407,
    hlOffsetDyFrac: -0.005,
    hlDiameterFrac: 0.195,
  },
  {
    name: 'right',
    cx: 0.4575,
    cy: 0.5618,
    w: 0.165 * 1.08,
    h: 0.1484 * 1.12,
    angleDeg: -22.39,
    localXFrac: 0.03072,
    localYFrac: -0.03529,
    pupilDiameterFrac: 0.506,
    hlOffsetDxFrac: -0.370,
    hlOffsetDyFrac: 0.013,
    hlDiameterFrac: 0.235,
  },
]

const FUR_COLOR = '#7A014E'

interface CatMascotProps {
  className?: string
  width?: number
  height?: number
  trackMouse?: boolean
}

export const CatMascotWeb: React.FC<CatMascotProps> = ({
  className = '',
  width = 380,
  height = 342,
  trackMouse = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // 1 = closed lid, 0 = wide open
  const [blink, setBlink] = useState(1)
  const gazeRef = useRef({ x: 0, y: 0 })
  const [currentGaze, setCurrentGaze] = useState({ x: 0, y: 0 })
  const isMouseActiveRef = useRef(false)

  // Wake-up sequence & realistic blinking loop
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

    const schedulePeriodicBlinks = () => {
      const delay = 2500 + Math.random() * 2200
      timer = setTimeout(async () => {
        if (cancelled) return
        await doQuickBlink()
        if (Math.random() < 0.3) {
          await new Promise((r) => setTimeout(r, 60))
          await doQuickBlink()
        }
        schedulePeriodicBlinks()
      }, delay)
    }

    // Lazy Cat Wakeup sequence (aligns with mobile app BlinkingMascot)
    const wakeUp = async () => {
      if (cancelled) return

      // Step 1: Drowsy crack open half-way
      await animateBlink(480, 0.52)
      await new Promise((r) => setTimeout(r, 360))

      // Step 2: Lazy droop back down
      await animateBlink(420, 0.92)
      await new Promise((r) => setTimeout(r, 220))

      // Step 3: Crack open wider
      await animateBlink(300, 0.25)
      await new Promise((r) => setTimeout(r, 50))

      // Step 4: Flutter blink 1
      await animateBlink(80, 1)
      await animateBlink(85, 0.1)
      await new Promise((r) => setTimeout(r, 40))

      // Step 5: Flutter blink 2
      await animateBlink(70, 1)
      await animateBlink(170, 0) // wide awake!

      schedulePeriodicBlinks()
    }

    timer = setTimeout(wakeUp, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Mouse cursor tracking & Gaze Lerp Loop
  useEffect(() => {
    let lastMouseMove = Date.now()

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackMouse || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const catCenterX = rect.left + rect.width / 2
      const catCenterY = rect.top + rect.height / 2

      const dx = (e.clientX - catCenterX) / (window.innerWidth / 2)
      const dy = (e.clientY - catCenterY) / (window.innerHeight / 2)

      const clampedX = Math.max(-1, Math.min(1, dx * 1.5))
      const clampedY = Math.max(-1, Math.min(1, dy * 1.5))

      gazeRef.current = { x: clampedX, y: clampedY }
      isMouseActiveRef.current = true
      lastMouseMove = Date.now()
    }

    window.addEventListener('mousemove', handleMouseMove)

    // Autonomous gaze drift when mouse is still
    const autoGazeInterval = setInterval(() => {
      if (Date.now() - lastMouseMove > 2800) {
        isMouseActiveRef.current = false
        const gazes = [
          { x: 0, y: 0 },
          { x: 0.85, y: -0.85 }, // look up-right at star wand
          { x: 0.8, y: 0 },
          { x: -0.95, y: 0.25 },
          { x: -0.6, y: 0.75 },
          { x: 0, y: 0 },
        ]
        const randomGaze = gazes[Math.floor(Math.random() * gazes.length)]
        gazeRef.current = randomGaze
      }
    }, 2000)

    // Smooth Lerp Loop (60 FPS)
    let animationFrameId: number
    const updateGazeLerp = () => {
      setCurrentGaze((prev) => {
        const speed = isMouseActiveRef.current ? 0.16 : 0.08
        const nx = prev.x + (gazeRef.current.x - prev.x) * speed
        const ny = prev.y + (gazeRef.current.y - prev.y) * speed
        return { x: nx, y: ny }
      })
      animationFrameId = requestAnimationFrame(updateGazeLerp)
    }

    animationFrameId = requestAnimationFrame(updateGazeLerp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearInterval(autoGazeInterval)
      cancelAnimationFrame(animationFrameId)
    }
  }, [trackMouse])

  // Interactive Click (Wink reaction)
  const handleCatClick = () => {
    setBlink(1)
    setTimeout(() => {
      setBlink(0)
    }, 220)
  }

  // Dimension Calculations
  const sourceAspect = SOURCE_WIDTH / SOURCE_HEIGHT
  const containerAspect = width / height
  const renderedWidth = containerAspect > sourceAspect ? height * sourceAspect : width
  const renderedHeight = containerAspect > sourceAspect ? height : width / sourceAspect
  const offsetX = (width - renderedWidth) / 2
  const offsetY = (height - renderedHeight) / 2

  return (
    <div
      ref={containerRef}
      onClick={handleCatClick}
      className={`relative select-none cursor-pointer group ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      title="Click me!"
    >
      {/* Glow Effect Behind Cat */}
      <div className="absolute inset-0 bg-radial from-amber-400/20 via-purple-500/10 to-transparent rounded-full blur-2xl transform group-hover:scale-110 transition-transform duration-500 pointer-events-none" />

      {/* Layer 1: Base Cat Artwork with Pure White Scleras */}
      <img
        src={catEyesWhite}
        alt="EduWand Cat Mascot"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Layer 2: Moving Pupils & Eyelids inside overflow-hidden Eye Container */}
      {EYES.map((eye, index) => {
        const eyeWidth = eye.w * renderedWidth
        const eyeHeight = eye.h * renderedHeight
        const left = offsetX + eye.cx * renderedWidth - eyeWidth / 2
        const top = offsetY + eye.cy * renderedHeight - eyeHeight / 2

        const pupilSize = Math.round(eye.pupilDiameterFrac * eyeHeight) + 1
        const hlSize = pupilSize * eye.hlDiameterFrac

        const defaultPupilX = (eyeWidth - pupilSize) / 2 + eye.localXFrac * eyeWidth
        const defaultPupilY = (eyeHeight - pupilSize) / 2 + eye.localYFrac * eyeHeight

        const hlLeft = pupilSize * 0.5 + eye.hlOffsetDxFrac * pupilSize - hlSize / 2
        const hlTop = pupilSize * 0.5 + eye.hlOffsetDyFrac * pupilSize - hlSize / 2

        const maxShiftX = eyeWidth * 0.22
        const maxShiftY = eyeHeight * 0.16

        const shiftX = currentGaze.x * maxShiftX
        const shiftY = currentGaze.y * maxShiftY

        // Eyelid offset: -eyeHeight when blink=0 (open), 0 when blink=1 (closed)
        const lidTranslateY = -eyeHeight + blink * eyeHeight

        return (
          <div
            key={`eye-${index}`}
            className="absolute overflow-hidden pointer-events-none bg-white"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${eyeWidth}px`,
              height: `${eyeHeight}px`,
              borderTopLeftRadius: `${eyeHeight * 0.2}px`,
              borderTopRightRadius: `${eyeHeight * 0.2}px`,
              borderBottomLeftRadius: `${eyeHeight / 2}px`,
              borderBottomRightRadius: `${eyeHeight / 2}px`,
              transform: `rotate(${eye.angleDeg}deg)`,
              zIndex: 2,
            }}
          >
            {/* Animated Black Pupil & White Sparkle Highlight */}
            <div
              className="absolute bg-black rounded-full"
              style={{
                left: `${defaultPupilX}px`,
                top: `${defaultPupilY}px`,
                width: `${pupilSize}px`,
                height: `${pupilSize}px`,
                transform: `translate(${shiftX}px, ${shiftY}px)`,
                transition: 'transform 0.05s linear',
              }}
            >
              <div
                className="absolute bg-white rounded-full"
                style={{
                  left: `${hlLeft}px`,
                  top: `${hlTop}px`,
                  width: `${hlSize}px`,
                  height: `${hlSize}px`,
                }}
              />
            </div>

            {/* Eyelid Cover INSIDE the eye container contour */}
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

      {/* Layer 3: Eyelid Outer Frame Overlay (Upper Eyelid stroke and fur texture) */}
      <img
        src={catFrame}
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ zIndex: 10 }}
      />
    </div>
  )
}

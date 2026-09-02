import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

/**
 * PROTOTYPE — floating variant switcher for `?variant=` UI prototypes.
 *
 * Three structurally different views of the document library summary, gated by
 * `?variant=A|B|C` on the existing Documents tab. No param → the existing
 * LibrarySummary renders untouched. Hidden outside dev builds.
 */
interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[]
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    target.isContentEditable
  )
}

export default function PrototypeSwitcher({ variants }: PrototypeSwitcherProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentKey = searchParams.get('variant') ?? 'A'
  const currentIndex = Math.max(
    0,
    variants.findIndex((v) => v.key === currentKey)
  )
  const current = variants[currentIndex]

  const goTo = (index: number) => {
    const next = variants[((index % variants.length) + variants.length) % variants.length]
    const updated = new URLSearchParams(searchParams)
    updated.set('variant', next.key)
    setSearchParams(updated, { replace: true })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(currentIndex - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(currentIndex + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-black/20 bg-zinc-900 px-2 py-1.5 shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          className="grid size-7 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
          aria-label="Previous variant"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="min-w-[10rem] px-2 text-center font-mono text-xs text-white">
          {current.key} · {current.name}
        </span>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          className="grid size-7 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
          aria-label="Next variant"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
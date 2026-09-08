import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import Progress from '@/components/ui/Progress'
import LibrarySummary from '@/components/documents/LibrarySummary'
import PrototypeSwitcher from '@/components/prototype/PrototypeSwitcher'
import {
  getPipelineStatus,
  PipelineStatusResponse,
} from '@/api/lightrag'
import { useBackendState } from '@/stores/state'
import { cn } from '@/lib/utils'
import {
  DatabaseIcon,
  LoaderCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  FilesIcon,
  HourglassIcon,
  TriangleAlertIcon,
} from 'lucide-react'

/**
 * PROTOTYPE — document library summary, three structurally different views.
 *
 * Mounted in place of LibrarySummary on the existing Documents tab. `?variant=`
 * selects A (stat cards) / B (distribution bar) / C (dashboard ring + table);
 * no param renders the shipping LibrarySummary untouched.
 *
 * Question settled: what should the library summary look like?
 */

const getCountValue = (counts: Record<string, number>, ...keys: string[]): number => {
  for (const key of keys) {
    const value = counts[key]
    if (typeof value === 'number') return value
  }
  return 0
}

const getTotalCount = (counts: Record<string, number>): number =>
  getCountValue(counts, 'all', 'total')

function useLibraryStats(statusCounts: Record<string, number>) {
  const { t } = useTranslation()
  const pipelineActive = useBackendState.use.pipelineActive()
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusResponse | null>(null)

  useEffect(() => {
    if (!pipelineActive) {
      return
    }
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const data = await getPipelineStatus()
        if (!cancelled) setPipelineStatus(data)
      } catch {
        if (!cancelled) setPipelineStatus(null)
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pipelineActive])

  const total = getTotalCount(statusCounts)
  const completed = getCountValue(statusCounts, 'PROCESSED', 'processed')
  const processing =
    getCountValue(statusCounts, 'PARSING', 'parsing') +
    getCountValue(statusCounts, 'ANALYZING', 'analyzing') +
    getCountValue(statusCounts, 'PROCESSING', 'processing')
  const pending = getCountValue(statusCounts, 'PENDING', 'pending', 'PREPROCESSED', 'preprocessed')
  const failed = getCountValue(statusCounts, 'FAILED', 'failed')

  const curBatch = pipelineStatus?.cur_batch ?? 0
  const batchs = pipelineStatus?.batchs ?? 0
  const progressPercent = batchs > 0 ? Math.min(100, Math.round((curBatch / batchs) * 100)) : 0

  return {
    t,
    pipelineActive,
    total,
    completed,
    processing,
    pending,
    failed,
    curBatch,
    batchs,
    progressPercent,
  }
}

interface StatusSegment {
  key: string
  label: string
  value: number
  barClass: string
  dotClass: string
  icon: typeof FilesIcon
}

// ---------------------------------------------------------------------------
// Variant A — stat cards: numbers first, one card per status
// ---------------------------------------------------------------------------
function VariantA({ statusCounts }: { statusCounts: Record<string, number> }) {
  const stats = useLibraryStats(statusCounts)
  const { t } = stats

  const cards: StatusSegment[] = [
    {
      key: 'total',
      label: t('documentPanel.librarySummary.total'),
      value: stats.total,
      barClass: 'bg-zinc-400',
      dotClass: 'text-zinc-500',
      icon: FilesIcon,
    },
    {
      key: 'completed',
      label: t('documentPanel.librarySummary.completed'),
      value: stats.completed,
      barClass: 'bg-green-500',
      dotClass: 'text-green-600',
      icon: CheckCircle2Icon,
    },
    {
      key: 'processing',
      label: t('documentPanel.librarySummary.processing'),
      value: stats.processing,
      barClass: 'bg-blue-500',
      dotClass: 'text-blue-600',
      icon: LoaderCircleIcon,
    },
    {
      key: 'pending',
      label: t('documentPanel.librarySummary.pending'),
      value: stats.pending,
      barClass: 'bg-amber-500',
      dotClass: 'text-amber-600',
      icon: HourglassIcon,
    },
    {
      key: 'failed',
      label: t('documentPanel.librarySummary.failed'),
      value: stats.failed,
      barClass: 'bg-red-500',
      dotClass: 'text-red-600',
      icon: TriangleAlertIcon,
    },
  ]

  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.key}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-card/60 px-3 py-2.5 dark:border-gray-700"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                <Icon className={cn('size-4', card.dotClass, card.key === 'processing' && 'animate-spin')} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-lg leading-none font-semibold tabular-nums">{card.value}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {stats.pipelineActive && stats.batchs > 0 && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-card/40 px-3 py-1.5 dark:border-gray-700">
          <ClockIcon className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          <Progress value={stats.progressPercent} className="h-1.5" />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('documentPanel.librarySummary.progress', {
              cur: stats.curBatch,
              total: stats.batchs,
            })}{' '}
            ({stats.progressPercent}%)
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — distribution bar: one stacked bar proportional to status shares
// ---------------------------------------------------------------------------
function VariantB({ statusCounts }: { statusCounts: Record<string, number> }) {
  const stats = useLibraryStats(statusCounts)
  const { t } = stats

  const segments: StatusSegment[] = [
    {
      key: 'completed',
      label: t('documentPanel.librarySummary.completed'),
      value: stats.completed,
      barClass: 'bg-green-500',
      dotClass: 'bg-green-500',
      icon: CheckCircle2Icon,
    },
    {
      key: 'processing',
      label: t('documentPanel.librarySummary.processing'),
      value: stats.processing,
      barClass: 'bg-blue-500',
      dotClass: 'bg-blue-500',
      icon: LoaderCircleIcon,
    },
    {
      key: 'pending',
      label: t('documentPanel.librarySummary.pending'),
      value: stats.pending,
      barClass: 'bg-amber-500',
      dotClass: 'bg-amber-500',
      icon: HourglassIcon,
    },
    {
      key: 'failed',
      label: t('documentPanel.librarySummary.failed'),
      value: stats.failed,
      barClass: 'bg-red-500',
      dotClass: 'bg-red-500',
      icon: TriangleAlertIcon,
    },
  ]

  const shareOf = (value: number): number =>
    stats.total > 0 ? Math.round((value / stats.total) * 100) : 0

  return (
    <div className="mb-3">
      <div className="rounded-md border border-gray-200 bg-card/50 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <DatabaseIcon className="size-4 text-emerald-400" aria-hidden="true" />
            <span className="font-medium">{t('documentPanel.librarySummary.title')}</span>
          </span>
          <span className="text-lg font-semibold text-zinc-700 tabular-nums dark:text-zinc-300">
            {stats.total}
          </span>
        </div>

        {/* stacked proportional bar — structural core of this variant */}
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
          {segments.map((seg) =>
            seg.value > 0 ? (
              <div
                key={seg.key}
                className={cn('h-full transition-all duration-500', seg.barClass)}
                style={{ width: `${shareOf(seg.value)}%` }}
              />
            ) : null
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-baseline gap-1.5 text-sm">
              <span className={cn('size-2 self-center rounded-full', seg.dotClass)} aria-hidden="true" />
              <span className="truncate text-muted-foreground">{seg.label}</span>
              <span className="ml-auto font-medium tabular-nums">{seg.value}</span>
              <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {shareOf(seg.value)}%
              </span>
            </div>
          ))}
        </div>

        {stats.pipelineActive && stats.batchs > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-2.5 dark:border-gray-700">
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-emerald-500" aria-hidden="true" />
            <Progress value={stats.progressPercent} className="h-1.5" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('documentPanel.librarySummary.progress', {
                cur: stats.curBatch,
                total: stats.batchs,
              })}{' '}
              ({stats.progressPercent}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant C — dashboard panel: completion ring + status table
// ---------------------------------------------------------------------------
function VariantC({ statusCounts }: { statusCounts: Record<string, number> }) {
  const stats = useLibraryStats(statusCounts)
  const { t } = stats

  const rows: StatusSegment[] = [
    {
      key: 'completed',
      label: t('documentPanel.librarySummary.completed'),
      value: stats.completed,
      barClass: 'text-green-600',
      dotClass: 'bg-green-500',
      icon: CheckCircle2Icon,
    },
    {
      key: 'processing',
      label: t('documentPanel.librarySummary.processing'),
      value: stats.processing,
      barClass: 'text-blue-600',
      dotClass: 'bg-blue-500',
      icon: LoaderCircleIcon,
    },
    {
      key: 'pending',
      label: t('documentPanel.librarySummary.pending'),
      value: stats.pending,
      barClass: 'text-amber-600',
      dotClass: 'bg-amber-500',
      icon: HourglassIcon,
    },
    {
      key: 'failed',
      label: t('documentPanel.librarySummary.failed'),
      value: stats.failed,
      barClass: 'text-red-600',
      dotClass: 'bg-red-500',
      icon: TriangleAlertIcon,
    },
  ]

  const completion = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const shareOf = (value: number): number =>
    stats.total > 0 ? Math.round((value / stats.total) * 100) : 0

  const size = 72
  const stroke = 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = completion > 0 ? circumference * (1 - completion / 100) : circumference

  return (
    <div className="mb-3">
      <div className="rounded-md border border-gray-200 bg-card/50 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-4">
          {/* completion ring */}
          <div className="relative shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                className="text-muted"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="text-emerald-500 transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base leading-none font-semibold tabular-nums">{completion}%</span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {t('documentPanel.librarySummary.total')}
              </span>
            </div>
          </div>

          {/* status table */}
          <div className="grid min-w-0 flex-1 gap-1">
            {rows.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.key} className="flex items-center gap-2 text-sm">
                  <Icon className={cn('size-3.5 shrink-0', row.barClass)} aria-hidden="true" />
                  <span className="truncate text-muted-foreground">{row.label}</span>
                  <span className="ml-auto font-medium tabular-nums">{row.value}</span>
                  <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {shareOf(row.value)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {stats.pipelineActive && stats.batchs > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-2.5 dark:border-gray-700">
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-emerald-500" aria-hidden="true" />
            <Progress value={stats.progressPercent} className="h-1.5" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('documentPanel.librarySummary.progress', {
                cur: stats.curBatch,
                total: stats.batchs,
              })}{' '}
              ({stats.progressPercent}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switcher + fallback
// ---------------------------------------------------------------------------
const VARIANTS = [
  { key: 'A', name: 'Stat cards' },
  { key: 'B', name: 'Distribution bar' },
  { key: 'C', name: 'Dashboard ring' },
]

export default function LibrarySummaryPrototype({
  statusCounts,
}: {
  statusCounts: Record<string, number>
}) {
  const [searchParams] = useSearchParams()
  const variant = searchParams.get('variant')

  if (!import.meta.env.DEV || !variant) {
    return <LibrarySummary statusCounts={statusCounts} />
  }

  return (
    <>
      {variant === 'A' && <VariantA statusCounts={statusCounts} />}
      {variant === 'B' && <VariantB statusCounts={statusCounts} />}
      {variant === 'C' && <VariantC statusCounts={statusCounts} />}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  )
}
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Progress from '@/components/ui/Progress'
import { getPipelineStatus, PipelineStatusResponse } from '@/api/lightrag'
import { useBackendState } from '@/stores/state'
import { cn } from '@/lib/utils'
import { DatabaseIcon, LoaderCircleIcon } from 'lucide-react'

const getCountValue = (counts: Record<string, number>, ...keys: string[]): number => {
  for (const key of keys) {
    const value = counts[key]
    if (typeof value === 'number') {
      return value
    }
  }
  return 0
}

const getTotalCount = (counts: Record<string, number>): number =>
  getCountValue(counts, 'all', 'total')

interface LibrarySummaryProps {
  statusCounts: Record<string, number>
}

export default function LibrarySummary({ statusCounts }: LibrarySummaryProps) {
  const { t } = useTranslation()
  const pipelineActive = useBackendState.use.pipelineActive()
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusResponse | null>(null)

  // Poll pipeline status while the pipeline is running to surface ingestion progress.
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

  const stats = [
    { label: t('documentPanel.librarySummary.total'), value: total, className: 'text-zinc-700 dark:text-zinc-300' },
    { label: t('documentPanel.librarySummary.completed'), value: completed, className: 'text-green-600' },
    { label: t('documentPanel.librarySummary.processing'), value: processing, className: 'text-blue-600' },
    { label: t('documentPanel.librarySummary.pending'), value: pending, className: 'text-yellow-600' },
    { label: t('documentPanel.librarySummary.failed'), value: failed, className: 'text-red-600' }
  ]

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-gray-200 dark:border-gray-700 bg-card/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="size-4 text-emerald-400" aria-hidden="true" />
          <span className="text-sm font-medium">{t('documentPanel.librarySummary.title')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {stats.map(({ label, value, className }) => (
            <span key={label} className="text-sm whitespace-nowrap">
              <span className="text-muted-foreground">{label}: </span>
              <span className={cn('font-medium tabular-nums', className)}>{value}</span>
            </span>
          ))}
        </div>

        {pipelineActive && batchs > 0 && (
          <div className="flex min-w-[220px] flex-1 items-center justify-end gap-2">
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-emerald-500" aria-hidden="true" />
            <Progress value={progressPercent} className="h-2 max-w-[200px]" />
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {t('documentPanel.librarySummary.progress', { cur: curBatch, total: batchs })} ({progressPercent}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
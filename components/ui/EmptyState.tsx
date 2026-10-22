"use client"

interface EmptyStateProps {
  icon?: string
  title: string
  /** One line explaining what this screen is for, or why it is empty. */
  hint?: string
  actionLabel?: string
  onAction?: () => void
  /** Shown instead of the action when a filter is hiding everything. */
  onClearFilters?: () => void
}

export default function EmptyState({
  icon = "📭",
  title,
  hint,
  actionLabel,
  onAction,
  onClearFilters,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-14 h-14 rounded-full bg-[#f4f6f2] flex items-center justify-center text-2xl mb-4">
        {icon}
      </div>
      <div className="text-[#193d33] font-semibold text-base mb-1">{title}</div>
      {hint && (
        <div className="text-sm text-[#63756b] max-w-xs leading-relaxed mb-4">{hint}</div>
      )}
      {onClearFilters ? (
        <button
          onClick={onClearFilters}
          className="px-4 py-2 rounded-[9px] border border-[#e1e8df] text-sm font-semibold text-[#63756b] hover:bg-[#f7f9f5] transition-colors"
        >
          נקה סינון
        </button>
      ) : (
        actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-4 py-2 rounded-[9px] bg-[#193d33] text-white text-sm font-bold hover:bg-[#28634e] transition-colors"
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

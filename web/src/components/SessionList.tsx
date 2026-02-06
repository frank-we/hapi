import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useBulkSessionActions, useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'


// Selection state management
type SelectionState = {
    selectionMode: boolean
    selectedIds: Set<string>
}

type SelectionAction =
    | { type: 'ENTER_SELECTION_MODE' }
    | { type: 'EXIT_SELECTION_MODE' }
    | { type: 'TOGGLE_SESSION'; sessionId: string }
    | { type: 'SELECT_ALL'; sessionIds: string[] }
    | { type: 'SET_SELECTION'; sessionIds: string[] }
    | { type: 'CLEAR_SELECTION' }

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
    switch (action.type) {
        case 'ENTER_SELECTION_MODE':
            return { ...state, selectionMode: true }
        case 'EXIT_SELECTION_MODE':
            return { selectionMode: false, selectedIds: new Set() }
        case 'TOGGLE_SESSION': {
            const newSelectedIds = new Set(state.selectedIds)
            if (newSelectedIds.has(action.sessionId)) {
                newSelectedIds.delete(action.sessionId)
            } else {
                newSelectedIds.add(action.sessionId)
            }
            return { ...state, selectedIds: newSelectedIds }
        }
        case 'SELECT_ALL': {
            const newSelectedIds = new Set(action.sessionIds)
            return { ...state, selectedIds: newSelectedIds }
        }
        case 'SET_SELECTION': {
            const newSelectedIds = new Set(action.sessionIds)
            return { ...state, selectedIds: newSelectedIds }
        }
        case 'CLEAR_SELECTION':
            return { ...state, selectedIds: new Set() }
        default:
            return state
    }
}

type SessionGroup = {
    directory: string
    displayName: string
    sessions: SessionSummary[]
    latestUpdatedAt: number
    hasActiveSession: boolean
}

function getGroupDisplayName(directory: string): string {
    if (directory === 'Other') return directory
    const parts = directory.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) return directory
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

function groupSessionsByDirectory(sessions: SessionSummary[]): SessionGroup[] {
    const groups = new Map<string, SessionSummary[]>()

    sessions.forEach(session => {
        const path = session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
        if (!groups.has(path)) {
            groups.set(path, [])
        }
        groups.get(path)!.push(session)
    })

    return Array.from(groups.entries())
        .map(([directory, groupSessions]) => {
            const sortedSessions = [...groupSessions].sort((a, b) => {
                const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
                const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
                if (rankA !== rankB) return rankA - rankB
                return b.updatedAt - a.updatedAt
            })
            const latestUpdatedAt = groupSessions.reduce(
                (max, s) => (s.updatedAt > max ? s.updatedAt : max),
                -Infinity
            )
            const hasActiveSession = groupSessions.some(s => s.active)
            const displayName = getGroupDisplayName(directory)

            return { directory, displayName, sessions: sortedSessions, latestUpdatedAt, hasActiveSession }
        })
        .sort((a, b) => {
            if (a.hasActiveSession !== b.hasActiveSession) {
                return a.hasActiveSession ? -1 : 1
            }
            return b.latestUpdatedAt - a.latestUpdatedAt
        })
}

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function BulbIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a7 7 0 0 0-4-12Z" />
        </svg>
    )
}

function SelectionIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
    )
}

function XIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function ChevronIcon(props: { className?: string; collapsed?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function getSessionTitle(session: SessionSummary): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

function getTodoProgress(session: SessionSummary): { completed: number; total: number } | null {
    if (!session.todoProgress) return null
    if (session.todoProgress.completed === session.todoProgress.total) return null
    return session.todoProgress
}

function getAgentLabel(session: SessionSummary): string {
    const flavor = session.metadata?.flavor?.trim()
    if (flavor) return flavor
    return 'unknown'
}

function formatRelativeTime(value: number, t: (key: string, params?: Record<string, string | number>) => string): string | null {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return t('session.time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.time.daysAgo', { n: days })
    return new Date(ms).toLocaleDateString()
}

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    showPath?: boolean
    api: ApiClient | null
    selected?: boolean
    selectionMode?: boolean
    isSelected?: boolean
    onToggleSelect?: (sessionId: string) => void
    bulkDeleteEnabled?: boolean
    onBulkDeleteRequested?: () => void
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, showPath = true, api, selected = false, selectionMode = false, isSelected = false, onToggleSelect, bulkDeleteEnabled = false, onBulkDeleteRequested } = props
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    const { archiveSession, renameSession, deleteSession, isPending } = useSessionActions(
        api,
        s.id,
        s.metadata?.flavor ?? null
    )

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        onClick: () => {
            if (!menuOpen && !selectionMode) {
                onSelect(s.id)
            } else if (selectionMode && onToggleSelect && !s.active) {
                onToggleSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const statusDotClass = s.active
        ? (s.thinking ? 'bg-[#007AFF]' : 'bg-[var(--app-badge-success-text)]')
        : 'bg-[var(--app-hint)]'
    return (
        <>
            <button
                type="button"
                {...longPressHandlers}
                onKeyDown={(e) => {
                    if (!selectionMode) return
                    if (e.key === ' ' || e.key === 'Spacebar') {
                        e.preventDefault()
                        if (onToggleSelect && !s.active) {
                            onToggleSelect(s.id)
                        }
                    }
                }}
                className={`session-list-item flex w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none ${selected ? 'bg-[var(--app-secondary-bg)]' : ''}`}
                style={{ WebkitTouchCallout: 'none' }}
                aria-current={selected ? 'page' : undefined}
                aria-keyshortcuts={selectionMode ? 'Space' : undefined}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {selectionMode ? (
                            <label
                                className="flex h-4 w-4 items-center justify-center cursor-pointer"
                                title={s.active ? t('session.selection.activeDisabled') : undefined}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={s.active}
                                    onChange={() => onToggleSelect?.(s.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-[var(--app-divider)] text-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label={s.active ? t('session.selection.activeDisabledAria', { name: sessionName }) : t('session.selection.toggleAria', { name: sessionName })}
                                />
                            </label>
                        ) : (
                            <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                                <span
                                    className={`h-2 w-2 rounded-full ${statusDotClass}`}
                                />
                            </span>
                        )}
                        <div className="truncate text-base font-medium">
                            {sessionName}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                        {s.thinking ? (
                            <span className="text-[#007AFF] animate-pulse">
                                {t('session.item.thinking')}
                            </span>
                        ) : null}
                        {(() => {
                            const progress = getTodoProgress(s)
                            if (!progress) return null
                            return (
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <BulbIcon className="h-3 w-3" />
                                    {progress.completed}/{progress.total}
                                </span>
                            )
                        })()}
                        {s.pendingRequestsCount > 0 ? (
                            <span className="text-[var(--app-badge-warning-text)]">
                                {t('session.item.pending')} {s.pendingRequestsCount}
                            </span>
                        ) : null}
                        <span className="text-[var(--app-hint)]">
                            {formatRelativeTime(s.updatedAt, t)}
                        </span>
                    </div>
                </div>
                {showPath ? (
                    <div className="truncate text-xs text-[var(--app-hint)]">
                        {s.metadata?.path ?? s.id}
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-hint)]">
                    <span className="inline-flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                            ❖
                        </span>
                        {getAgentLabel(s)}
                    </span>
                    <span>{t('session.item.modelMode')}: {s.modelMode || 'default'}</span>
                    {s.metadata?.worktree?.branch ? (
                        <span>{t('session.item.worktree')}: {s.metadata.worktree.branch}</span>
                    ) : null}
                </div>
            </button>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={s.active}
                onRename={() => setRenameOpen(true)}
                onArchive={() => setArchiveOpen(true)}
                onDelete={() => {
                    setMenuOpen(false)
                    if (bulkDeleteEnabled) {
                        onBulkDeleteRequested?.()
                        return
                    }
                    setDeleteOpen(true)
                }}
                anchorPoint={menuAnchorPoint}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={sessionName}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: sessionName })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={t('dialog.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={deleteSession}
                isPending={isPending}
                destructive
            />
        </>
    )
}

export function SessionList(props: {
    sessions: SessionSummary[]
    onSelect: (sessionId: string) => void
    onNewSession: () => void
    onRefresh: () => void
    isLoading: boolean
    renderHeader?: boolean
    api: ApiClient | null
    selectedSessionId?: string | null
    selectionApiRef?: {
        current: {
            enterSelectionMode: () => void
            exitSelectionMode: () => void
        } | null
    }
    onSelectionStateChange?: (state: {
        selectionMode: boolean
        selectedCount: number
        hasSelection: boolean
    }) => void
}) {
    const { t, locale } = useTranslation()
    const { addToast } = useToast()
    const { renderHeader = true, api, selectedSessionId } = props

    // Selection state management
    const [selectionState, dispatchSelection] = useReducer(selectionReducer, {
        selectionMode: false,
        selectedIds: new Set<string>()
    })

    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
    const { deleteSessions, isPending: isBulkDeleting } = useBulkSessionActions(api)
    const selectionToggleButtonRef = useRef<HTMLButtonElement>(null)
    const newSessionButtonRef = useRef<HTMLButtonElement>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)

    const selectableSessionIds = useMemo(
        () => props.sessions.filter(s => !s.active).map(s => s.id),
        [props.sessions]
    )
    const selectedCount = useMemo(
        () => selectionState.selectedIds.size,
        [selectionState.selectedIds]
    )
    const selectableCount = useMemo(
        () => selectableSessionIds.length,
        [selectableSessionIds]
    )
    const isAllSelected = useMemo(
        () => selectableCount > 0 && selectedCount === selectableCount,
        [selectableCount, selectedCount]
    )
    const isIndeterminate = useMemo(
        () => selectedCount > 0 && selectedCount < selectableCount,
        [selectableCount, selectedCount]
    )

    const hasSelection = useMemo(
        () => selectionState.selectionMode && selectionState.selectedIds.size > 0,
        [selectionState.selectionMode, selectionState.selectedIds]
    )

    const getCountKey = (n: number) => (
        n === 1 ? 'session.selection.selectedCount_one' : 'session.selection.selectedCount_other'
    )

    const getPluralKey = (keyBase: string, n: number) => {
        if (locale !== 'en') return keyBase
        return `${keyBase}_${n === 1 ? 'one' : 'other'}`
    }

    const handleEnterSelectionMode = () => dispatchSelection({ type: 'ENTER_SELECTION_MODE' })
    const handleExitSelectionMode = () => {
        setBulkDeleteDialogOpen(false)
        dispatchSelection({ type: 'EXIT_SELECTION_MODE' })
    }

    if (props.selectionApiRef) {
        props.selectionApiRef.current = {
            enterSelectionMode: handleEnterSelectionMode,
            exitSelectionMode: handleExitSelectionMode,
        }
    }

    useEffect(() => {
        props.onSelectionStateChange?.({
            selectionMode: selectionState.selectionMode,
            selectedCount,
            hasSelection,
        })
    }, [hasSelection, props.onSelectionStateChange, selectedCount, selectionState.selectionMode])

    const handleBulkDelete = () => {
        setBulkDeleteDialogOpen(true)
    }

    const handleConfirmBulkDelete = async () => {
        const selectedIds = Array.from(selectionState.selectedIds)
        const { succeeded, failed } = await deleteSessions(selectedIds)

        if (failed.length === 0) {
            dispatchSelection({ type: 'EXIT_SELECTION_MODE' })
            addToast({
                title: t('session.bulkDelete.toastSuccessTitle'),
                body: t(getPluralKey('session.bulkDelete.toastSuccessBody', succeeded.length), { n: succeeded.length }),
                sessionId: '',
                url: ''
            })
        } else if (succeeded.length === 0) {
            addToast({
                title: t('session.bulkDelete.toastAllFailedTitle'),
                body: t(getPluralKey('session.bulkDelete.toastAllFailedBody', failed.length), { n: failed.length }),
                sessionId: '',
                url: ''
            })
        } else {
            dispatchSelection({ type: 'CLEAR_SELECTION' })
            dispatchSelection({ type: 'SELECT_ALL', sessionIds: failed.map(f => f.id) })
            addToast({
                title: t('session.bulkDelete.toastPartialFailedTitle'),
                body: t(getPluralKey('session.bulkDelete.toastPartialFailedBody', failed.length), { n: failed.length }),
                sessionId: '',
                url: ''
            })
        }

        setBulkDeleteDialogOpen(false)
    }

    const handleSelectAll = () => {
        if (isAllSelected) {
            dispatchSelection({ type: 'CLEAR_SELECTION' })
            return
        }
        dispatchSelection({ type: 'SELECT_ALL', sessionIds: selectableSessionIds })
    }

    const selectAllCheckboxRef = useRef<HTMLInputElement>(null)
    useEffect(() => {
        if (!selectAllCheckboxRef.current) return
        selectAllCheckboxRef.current.indeterminate = isIndeterminate
    }, [isIndeterminate])

    // Clear invalid selections when sessions list updates (e.g. deleted/archived)
    useEffect(() => {
        if (selectionState.selectedIds.size === 0) return
        const selectableIdSet = new Set(selectableSessionIds)
        const validSelectedIds = Array.from(selectionState.selectedIds).filter(id => selectableIdSet.has(id))
        if (validSelectedIds.length === selectionState.selectedIds.size) return

        dispatchSelection({ type: 'CLEAR_SELECTION' })
        if (validSelectedIds.length > 0) {
            dispatchSelection({ type: 'SELECT_ALL', sessionIds: validSelectedIds })
        }
    }, [selectableSessionIds, selectionState.selectedIds])

    // Keyboard: Escape exits selection mode
    useEffect(() => {
        if (!selectionState.selectionMode) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            if (isBulkDeleting) return
            event.preventDefault()
            handleExitSelectionMode()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [handleExitSelectionMode, isBulkDeleting, selectionState.selectionMode])

    // Focus management when entering/exiting selection mode
    useEffect(() => {
        if (selectionState.selectionMode) {
            const active = document.activeElement
            if (active instanceof HTMLElement) {
                previousFocusRef.current = active
            }
            requestAnimationFrame(() => {
                selectAllCheckboxRef.current?.focus()
            })
            return
        }

        const previous = previousFocusRef.current
        previousFocusRef.current = null

        requestAnimationFrame(() => {
            if (previous && document.contains(previous)) {
                previous.focus()
                return
            }
            if (selectionToggleButtonRef.current) {
                selectionToggleButtonRef.current.focus()
                return
            }
            newSessionButtonRef.current?.focus()
        })
    }, [selectionState.selectionMode])

    const groups = useMemo(
        () => groupSessionsByDirectory(props.sessions),
        [props.sessions]
    )
    const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(
        () => new Map()
    )
    const isGroupCollapsed = (group: SessionGroup): boolean => {
        const override = collapseOverrides.get(group.directory)
        if (override !== undefined) return override
        return !group.hasActiveSession
    }

    const toggleGroup = (directory: string, isCollapsed: boolean) => {
        setCollapseOverrides(prev => {
            const next = new Map(prev)
            next.set(directory, !isCollapsed)
            return next
        })
    }

    useEffect(() => {
        setCollapseOverrides(prev => {
            if (prev.size === 0) return prev
            const next = new Map(prev)
            const knownGroups = new Set(groups.map(group => group.directory))
            let changed = false
            for (const directory of next.keys()) {
                if (!knownGroups.has(directory)) {
                    next.delete(directory)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [groups])

    const bulkDeleteTitle = useMemo(() => {
        if (locale === 'en') {
            const key = selectedCount === 1 ? 'session.bulkDelete.title_one' : 'session.bulkDelete.title_other'
            return t(key, { n: selectedCount })
        }
        return t('session.bulkDelete.title', { n: selectedCount })
    }, [locale, selectedCount, t])

    const bulkDeleteDescription = useMemo(() => {
        const selectedSessions = props.sessions.filter(s => selectionState.selectedIds.has(s.id))
        const names = selectedSessions.slice(0, 3).map(getSessionTitle).join(', ')
        const hasMore = selectedSessions.length > 3

        const base = (() => {
            if (locale === 'en') {
                const key = selectedCount === 1
                    ? 'session.bulkDelete.description_one'
                    : 'session.bulkDelete.description_other'
                return t(key, { n: selectedCount })
            }
            return t('session.bulkDelete.description', { n: selectedCount })
        })()

        if (!names) return base
        return `${base} (${names}${hasMore ? '…' : ''})`
    }, [locale, props.sessions, selectedCount, selectionState.selectedIds, t])

    return (
        <div className="mx-auto w-full max-w-content flex flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-1">
                    {selectionState.selectionMode ? (
                        <div className="flex items-center gap-3" aria-keyshortcuts="Escape">
                            <span className="sr-only">{t('session.selection.keyboardHint')}</span>
                            <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                                <input
                                    ref={selectAllCheckboxRef}
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                    disabled={selectableCount === 0}
                                    aria-label={isAllSelected ? t('session.selection.deselectAllAria') : t('session.selection.selectAllAria')}
                                    className="h-4 w-4 rounded border-[var(--app-divider)] text-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <span>
                                    {isAllSelected ? t('session.selection.deselectAll') : t('session.selection.selectAll')}
                                </span>
                            </label>
                            <div className="text-xs text-[var(--app-hint)]">
                                {locale === 'en'
                                    ? t(getCountKey(selectedCount), { n: selectedCount })
                                    : t('session.selection.selectedCount', { n: selectedCount })}
                            </div>
                            {selectedCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => dispatchSelection({ type: 'CLEAR_SELECTION' })}
                                    className="text-xs text-[var(--app-link)] hover:underline"
                                    aria-label={t('session.selection.deselectAllAria')}
                                >
                                    {t('session.selection.deselectAll')}
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <div className="text-xs text-[var(--app-hint)]">
                                {t('sessions.count', { n: props.sessions.length, m: groups.length })}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleEnterSelectionMode}
                                    className="p-1.5 rounded-full text-[var(--app-link)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                                    title={t('session.selection.enterMode')}
                                    aria-label={t('session.selection.enterModeAria')}
                                    ref={selectionToggleButtonRef}
                                >
                                    <SelectionIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={props.onNewSession}
                                    className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                    title={t('sessions.new')}
                                    ref={newSessionButtonRef}
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </>
                    )}
                    {selectionState.selectionMode ? (
                        <button
                            type="button"
                            onClick={handleExitSelectionMode}
                            disabled={isBulkDeleting}
                            className="p-1.5 rounded-full text-[var(--app-link)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] disabled:opacity-60 disabled:cursor-not-allowed"
                            title={t('session.selection.exitMode')}
                            aria-label={t('session.selection.exitModeAria')}
                        >
                            <XIcon className="h-5 w-5" />
                        </button>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-col">
                {groups.map((group) => {
                    const isCollapsed = isGroupCollapsed(group)
                    const groupSelectableSessionIds = selectionState.selectionMode
                        ? group.sessions.filter(s => !s.active).map(s => s.id)
                        : []
                    const groupSelectedCount = selectionState.selectionMode
                        ? groupSelectableSessionIds.filter(id => selectionState.selectedIds.has(id)).length
                        : 0
                    const groupSelectableCount = groupSelectableSessionIds.length
                    const groupAllSelected = groupSelectableCount > 0 && groupSelectedCount === groupSelectableCount
                    const groupIndeterminate = groupSelectedCount > 0 && groupSelectedCount < groupSelectableCount
                    return (
                        <div key={group.directory}>
                            <div className="sticky top-0 z-10 flex w-full items-center gap-2 px-3 py-2 bg-[var(--app-bg)] border-b border-[var(--app-divider)] transition-colors hover:bg-[var(--app-secondary-bg)]">
                                {selectionState.selectionMode ? (
                                    <label className="flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={groupAllSelected}
                                            disabled={groupSelectableCount === 0}
                                            ref={(el) => {
                                                if (!el) return
                                                el.indeterminate = groupIndeterminate
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => {
                                                const nextSelectedIds = new Set(selectionState.selectedIds)
                                                if (groupAllSelected) {
                                                    groupSelectableSessionIds.forEach(id => nextSelectedIds.delete(id))
                                                } else {
                                                    groupSelectableSessionIds.forEach(id => nextSelectedIds.add(id))
                                                }
                                                dispatchSelection({ type: 'SET_SELECTION', sessionIds: Array.from(nextSelectedIds) })
                                            }}
                                            aria-label={groupAllSelected
                                                ? t('session.selection.deselectGroupAria', { group: group.displayName })
                                                : t('session.selection.selectGroupAria', { group: group.displayName })}
                                            className="h-4 w-4 rounded border-[var(--app-divider)] text-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </label>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.directory, isCollapsed)}
                                    className="flex w-full items-center gap-2 text-left"
                                >
                                    <ChevronIcon
                                        className="h-4 w-4 text-[var(--app-hint)]"
                                        collapsed={isCollapsed}
                                    />
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="font-medium text-base break-words" title={group.directory}>
                                            {group.displayName}
                                        </span>
                                        <span className="shrink-0 text-xs text-[var(--app-hint)]">
                                            ({group.sessions.length})
                                        </span>
                                    </div>
                                </button>
                            </div>
                            {!isCollapsed ? (
                                <div className="flex flex-col divide-y divide-[var(--app-divider)] border-b border-[var(--app-divider)]">
                                    {group.sessions.map((s) => (
                                        <SessionItem
                                            key={s.id}
                                            session={s}
                                            onSelect={props.onSelect}
                                            showPath={false}
                                            api={api}
                                            selected={s.id === selectedSessionId}
                                            selectionMode={selectionState.selectionMode}
                                            isSelected={selectionState.selectedIds.has(s.id)}
                                            onToggleSelect={(sessionId) => dispatchSelection({ type: 'TOGGLE_SESSION', sessionId })}
                                            bulkDeleteEnabled={selectionState.selectionMode && selectionState.selectedIds.size > 0}
                                            onBulkDeleteRequested={handleBulkDelete}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            <ConfirmDialog
                isOpen={bulkDeleteDialogOpen}
                onClose={() => {
                    if (isBulkDeleting) return
                    setBulkDeleteDialogOpen(false)
                }}
                title={bulkDeleteTitle}
                description={bulkDeleteDescription}
                confirmLabel={t('session.bulkDelete.confirm')}
                confirmingLabel={t('session.bulkDelete.confirming')}
                onConfirm={handleConfirmBulkDelete}
                isPending={isBulkDeleting}
                destructive
            />
        </div>
    )
}

import { useRef, useState } from 'react'
import { Check, ImagePlus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { analyzeHabitContractProof } from '@/lib/habitContractAnalyze'
import {
  MAX_PROOF_IMAGES,
  compressProofImages,
  imageFilesFromList,
} from '@/lib/habitContractImage'
import { formatContractDate, formatEuros, contractNameClass, contractTone } from '@/lib/habitContracts'
import { cn, formatDate, generateId } from '@/lib/utils'
import type {
  HabitContract,
  HabitContractPerson,
  HabitContractProof,
  HabitContractsState,
} from '@/types'

interface ContractDetailModalProps {
  contract: HabitContract
  people: HabitContractPerson[]
  selfPersonId: string | null
  state: HabitContractsState
  userId: string | null
  onAddProof: (proof: HabitContractProof) => void
  onUpdateProofStatus: (id: string, status: HabitContractProof['status']) => void
  onPatchProof: (id: string, patch: Partial<Omit<HabitContractProof, 'id'>>) => void
  onDeleteProof: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function ContractDetailModal({
  contract,
  people,
  selfPersonId,
  state,
  userId,
  onAddProof,
  onUpdateProofStatus,
  onPatchProof,
  onDeleteProof,
  onEdit,
  onDelete,
  onClose,
}: ContractDetailModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const proofs = state.proofs
    .filter((proof) => proof.contract_id === contract.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  const [notes, setNotes] = useState('')
  const [draftImages, setDraftImages] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [proofPersonId, setProofPersonId] = useState(
    () =>
      (selfPersonId && contract.person_ids.includes(selfPersonId) ? selfPersonId : null) ??
      people[0]?.id ??
      contract.person_ids[0] ??
      '',
  )
  const canSubmit = !busy && !recalculatingId && (draftImages.length > 0 || notes.trim().length > 0)

  const personFor = (personId: string): HabitContractPerson =>
    people.find((person) => person.id === personId) ??
    people[0] ?? {
      id: personId || contract.person_ids[0] || '',
      name: 'Unknown',
      color: '#71717a',
      created_at: '',
    }

  const analyzeProof = (input: {
    imageDataUrls: string[]
    notes: string
    personId: string
    excludeProofId?: string
  }) =>
    analyzeHabitContractProof({
      imageDataUrls: input.imageDataUrls,
      notes: input.notes,
      contract,
      person: personFor(input.personId),
      people: state.people,
      contracts: state.contracts,
      proofs: state.proofs,
      excludeProofId: input.excludeProofId,
    })

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)
    try {
      const next = await compressProofImages(files, draftImages.length)
      if (next.length === 0) {
        setError(`You can add up to ${MAX_PROOF_IMAGES} photos per proof`)
        return
      }
      setDraftImages((prev) => [...prev, ...next].slice(0, MAX_PROOF_IMAGES))
    } catch {
      setError('Could not read one of those photos')
    }
  }

  const submitProof = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      let analysis: HabitContractProof['analysis'] = null
      try {
        const result = await analyzeProof({
          imageDataUrls: draftImages,
          notes,
          personId: proofPersonId || contract.person_ids[0] || '',
        })
        analysis = result.analysis
      } catch (analyzeError) {
        analysis = null
        setError(
          analyzeError instanceof Error
            ? `${analyzeError.message} Proof was still saved for review.`
            : 'Could not analyze. Proof was still saved.',
        )
      }
      onAddProof({
        id: generateId(),
        contract_id: contract.id,
        person_id: proofPersonId || contract.person_ids[0] || '',
        date: formatDate(new Date()),
        image_data_urls: draftImages,
        notes: notes.trim(),
        analysis,
        status: 'pending',
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      setNotes('')
      setDraftImages([])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not save that proof')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const recalculateProof = async (proof: HabitContractProof) => {
    setRecalculatingId(proof.id)
    setError(null)
    try {
      const result = await analyzeProof({
        imageDataUrls: proof.image_data_urls,
        notes: proof.notes,
        personId: proof.person_id,
        excludeProofId: proof.id,
      })
      onPatchProof(proof.id, { analysis: result.analysis })
    } catch (analyzeError) {
      setError(
        analyzeError instanceof Error
          ? analyzeError.message
          : 'Could not recalculate this proof',
      )
    } finally {
      setRecalculatingId(null)
    }
  }

  return (
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {people.map((person) => (
                <span
                  key={person.id}
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${person.color}22`, color: person.color }}
                >
                  {person.name}
                </span>
              ))}
              <h2
                className={cn(
                  'truncate text-base font-semibold',
                  contractNameClass(contractTone(contract, state.proofs)),
                )}
              >
                {contract.name}
              </h2>
            </div>
            <p className="mt-1 text-sm text-zinc-300">{contract.goal || 'No goal written yet'}</p>
            <p className="mt-1 text-sm text-zinc-300">
              <span className="text-zinc-500">Penalty </span>
              {contract.penalty || 'No rule written yet'}
            </p>
            {contract.how_to_calculate && (
              <p className="mt-1 text-sm text-zinc-300">
                <span className="text-zinc-500">Calculate </span>
                {contract.how_to_calculate}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              {formatContractDate(contract.start_date)}
              {contract.end_date ? ` → ${formatContractDate(contract.end_date)}` : ' → open'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div
            className={cn(
              'rounded-xl border border-dashed bg-zinc-900/40 p-3 transition-colors',
              dragging ? 'border-[var(--accent-400)] bg-[var(--accent-950)]/40' : 'border-zinc-800',
            )}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return
              setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void addFiles(imageFilesFromList(event.dataTransfer.files))
            }}
          >
            <p className="text-xs font-medium text-zinc-300">Add proof</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Drop photos here, pick several at once, or just write what happened. The API uses
              photos and text together.
            </p>
            {people.length > 1 && (
              <label className="mt-2 block space-y-1">
                <span className="text-[11px] font-medium text-zinc-400">Proof for</span>
                <select
                  value={proofPersonId}
                  onChange={(e) => setProofPersonId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-6 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            >
              <ImagePlus size={18} />
              {dragging ? 'Drop photos' : 'Drop photos or click to choose'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(imageFilesFromList(e.target.files))
                e.target.value = ''
              }}
            />
            {draftImages.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {draftImages.map((url, index) => (
                  <li key={`${index}-${url.length}`} className="relative overflow-hidden rounded-lg bg-black">
                    <img src={url} alt={`Draft photo ${index + 1}`} className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-zinc-200 hover:text-white"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() =>
                        setDraftImages((prev) => prev.filter((_, item) => item !== index))
                      }
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent-500)]"
              rows={3}
              placeholder="Write the proof in text, e.g. 2h 14m screentime or skipped the workout"
            />
            <Button size="sm" className="mt-2" disabled={!canSubmit} onClick={() => void submitProof()}>
              {busy ? 'Analyzing…' : 'Submit proof'}
            </Button>
            {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
          </div>

          {proofs.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No proof yet</p>
          ) : (
            <ul className="space-y-3">
              {proofs.map((proof) => (
                <li
                  key={proof.id}
                  className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/50"
                >
                  {proof.image_data_urls.length === 1 && (
                    <img
                      src={proof.image_data_urls[0]}
                      alt={`Proof for ${contract.name} on ${proof.date}`}
                      className="max-h-64 w-full object-contain bg-black"
                    />
                  )}
                  {proof.image_data_urls.length > 1 && (
                    <div className="grid grid-cols-2 gap-px bg-zinc-800">
                      {proof.image_data_urls.map((url, index) => (
                        <img
                          key={`${proof.id}-${index}`}
                          src={url}
                          alt={`Proof ${index + 1} for ${contract.name}`}
                          className="max-h-48 w-full object-cover bg-black"
                        />
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-zinc-400">
                        {formatContractDate(proof.date)}
                        {people.length > 1 &&
                          ` · ${state.people.find((person) => person.id === proof.person_id)?.name ?? 'Someone'}`}
                        {proof.image_data_urls.length === 0 && ' · written'}
                      </p>
                      <StatusPill status={proof.status} />
                    </div>
                    {proof.notes && <p className="text-sm text-zinc-300">{proof.notes}</p>}
                    {proof.analysis ? (
                      <div className="rounded-lg bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
                        <p>
                          {proof.analysis.met_goal === true
                            ? 'Goal met'
                            : proof.analysis.met_goal === false
                              ? 'Goal missed'
                              : 'Unclear'}
                          {' · '}
                          {formatEuros(proof.analysis.penalty_due)}
                        </p>
                        {proof.analysis.penalty_calculation && (
                          <p className="mt-1 text-zinc-200">{proof.analysis.penalty_calculation}</p>
                        )}
                        {proof.analysis.extracted && (
                          <p className="mt-1 text-zinc-400">{proof.analysis.extracted}</p>
                        )}
                        {proof.analysis.explanation && (
                          <p className="mt-1 text-zinc-500">{proof.analysis.explanation}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">No AI analysis — review manually.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {proof.status !== 'accepted' && (
                        <Button
                          size="sm"
                          onClick={() => onUpdateProofStatus(proof.id, 'accepted')}
                        >
                          <Check size={14} />
                          Accept
                        </Button>
                      )}
                      {proof.status !== 'disputed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onUpdateProofStatus(proof.id, 'disputed')}
                        >
                          Dispute
                        </Button>
                      )}
                      {proof.status !== 'accepted' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || recalculatingId !== null}
                          onClick={() => void recalculateProof(proof)}
                        >
                          <RefreshCw size={14} />
                          {recalculatingId === proof.id ? 'Recalculating…' : 'Recalculate'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteProof(proof.id)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 px-5 py-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Delete this contract?</span>
              <Button size="sm" variant="danger" onClick={onDelete}>
                Delete
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete contract
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function StatusPill({ status }: { status: HabitContractProof['status'] }) {
  const label = status === 'accepted' ? 'Accepted' : status === 'disputed' ? 'Disputed' : 'To review'
  const className =
    status === 'accepted'
      ? 'bg-emerald-950 text-emerald-300'
      : status === 'disputed'
        ? 'bg-red-950 text-red-300'
        : 'bg-amber-950 text-amber-300'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${className}`}>
      {label}
    </span>
  )
}

import { useMemo, useState } from 'react'

const pipelineSteps = [
  {
    id: '01',
    title: 'Ingest Syllabus PDF',
    detail: 'Drop your complete syllabus and let the planner auto-detect modules, units, and weightage.',
  },
  {
    id: '02',
    title: 'Sync Exam Timetable',
    detail: 'Feed exam dates and slots so the engine can prioritize high-impact chapters first.',
  },
  {
    id: '03',
    title: 'Generate Study Matrix',
    detail: 'Get a time-optimized, conflict-aware schedule and export it directly as CSV.',
  },
]

const statCards = [
  { label: 'Subjects Parsed', value: '12' },
  { label: 'Schedule Confidence', value: '98.4%' },
  { label: 'CSV Generation Time', value: '< 2s' },
]

type Subject = {
  name: string
  exam_date: string
}

type PlanResponse = {
  generated_at?: string
  study_plan: Array<{ subject: string; daily_goal: string; focus_topics: string[] }>
  priority_list: string[]
  time_allocation: {
    total_hours_per_day: number
    allocations: Array<{ subject: string; hours_per_day: number }>
  }
  adjustment_notes?: string
}

const escapeCsvValue = (value: string | number | null | undefined) => {
  const normalizedValue = value == null ? '' : String(value)
  return /[",\n]/.test(normalizedValue) ? `"${normalizedValue.replace(/"/g, '""')}"` : normalizedValue
}

const formatHoursAndMinutes = (hours: number) => {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours > 0 && minutes > 0) {
    return `${wholeHours} hr${wholeHours === 1 ? '' : 's'} ${minutes} min`
  }
  if (wholeHours > 0) {
    return `${wholeHours} hr${wholeHours === 1 ? '' : 's'}`
  }
  return `${minutes} min`
}

const normalizeSubjectKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const normalizeLooseSubjectKey = (value: string) =>
  normalizeSubjectKey(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const scoreSubjectSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeLooseSubjectKey(left)
  const normalizedRight = normalizeLooseSubjectKey(right)

  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.9

  const leftTokens = new Set(normalizedLeft.split(' ').filter(Boolean))
  const rightTokens = new Set(normalizedRight.split(' ').filter(Boolean))
  let overlapCount = 0

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlapCount += 1
  })

  if (overlapCount === 0) return 0
  return overlapCount / Math.max(leftTokens.size, rightTokens.size)
}

const findBestSubjectMatch = <T,>(subjectName: string, candidates: T[], getLabel: (candidate: T) => string) => {
  let bestMatch: T | null = null
  let bestScore = 0

  candidates.forEach((candidate) => {
    const score = scoreSubjectSimilarity(subjectName, getLabel(candidate))
    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  })

  return bestScore >= 0.5 ? bestMatch : null
}

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  const parsedDate = new Date(year, month - 1, day)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const formatExamDate = (value: string) => {
  const parsedDate = parseIsoDate(value)
  if (!parsedDate) return value

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate)
}

const getDaysLeftUntilExam = (value: string) => {
  const parsedDate = parseIsoDate(value)
  if (!parsedDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parsedDate.getTime() - today.getTime()) / 86_400_000)
}

const getUrgencyLabel = (daysLeft: number | null) => {
  if (daysLeft == null) return 'unknown'
  if (daysLeft <= 7) return 'high'
  if (daysLeft <= 21) return 'medium'
  return 'low'
}

const formatGeneratedAt = (value?: string) => {
  if (!value) return ''

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return value

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate)
}

const buildSubjectReasoning = ({
  subjectName,
  examDate,
  priorityRank,
  hoursPerDay,
  isWeakSubject,
  focusTopics,
  dailyGoal,
}: {
  subjectName: string
  examDate: string
  priorityRank: number | null
  hoursPerDay: number | null
  isWeakSubject: boolean
  focusTopics: string[]
  dailyGoal?: string
}) => {
  const reasoningParts: string[] = []
  const daysLeft = getDaysLeftUntilExam(examDate)
  const urgency = getUrgencyLabel(daysLeft)

  if (examDate) {
    const formattedExamDate = formatExamDate(examDate)

    if (daysLeft == null) {
      reasoningParts.push(`Exam is scheduled for ${formattedExamDate}.`)
    } else if (daysLeft < 0) {
      reasoningParts.push(
        `${subjectName} had an exam on ${formattedExamDate}, which is ${Math.abs(daysLeft)} day${
          Math.abs(daysLeft) === 1 ? '' : 's'
        } ago.`,
      )
    } else if (daysLeft === 0) {
      reasoningParts.push(`${subjectName} has its exam today (${formattedExamDate}), so it needs immediate revision.`)
    } else {
      reasoningParts.push(
        `${subjectName} has its exam on ${formattedExamDate} with ${daysLeft} day${
          daysLeft === 1 ? '' : 's'
        } left, so its urgency is ${urgency}.`,
      )
    }
  } else {
    reasoningParts.push(`${subjectName} does not have a matched exam date in the exported plan, so ranking is based on the planner output.`)
  }

  if (priorityRank != null) {
    reasoningParts.push(`It is ranked #${priorityRank + 1} in the priority order.`)
  }

  if (hoursPerDay != null) {
    reasoningParts.push(`The planner allocates ${formatHoursAndMinutes(hoursPerDay)} per day.`)
  }

  if (isWeakSubject) {
    reasoningParts.push('It gets extra attention because you marked it as a weak subject.')
  }

  if (focusTopics.length > 0) {
    reasoningParts.push(`Key focus topics: ${focusTopics.join(', ')}.`)
  }

  if (dailyGoal?.trim()) {
    reasoningParts.push(`Daily goal: ${dailyGoal.trim()}.`)
  }

  return reasoningParts.join(' ')
}

const buildPlanCsv = (plan: PlanResponse, subjects: Subject[], weakSubjectsText: string) => {
  const hoursBySubject = new Map(
    plan.time_allocation.allocations.map((allocation) => [normalizeSubjectKey(allocation.subject), allocation.hours_per_day]),
  )
  const studyPlanBySubject = new Map(plan.study_plan.map((entry) => [normalizeSubjectKey(entry.subject), entry]))
  const priorityRankBySubject = new Map(plan.priority_list.map((subject, index) => [normalizeSubjectKey(subject), index]))
  const weakSubjectSet = new Set(
    weakSubjectsText
      .split(',')
      .map((subject) => normalizeSubjectKey(subject))
      .filter(Boolean),
  )

  const headers = [
    'subject',
    'exam_date',
    'days_left',
    'urgency',
    'priority_rank',
    'study_time_per_day',
    'weak_subject',
    'daily_goal',
    'focus_topics',
    'subject_reasoning',
    'plan_generated_at',
  ]

  const rows = subjects.map((subject) => {
    const subjectKey = normalizeSubjectKey(subject.name)
    const matchedStudyPlanEntry =
      studyPlanBySubject.get(subjectKey) ?? findBestSubjectMatch(subject.name, plan.study_plan, (entry) => entry.subject)
    const matchedAllocation =
      hoursBySubject.get(subjectKey) != null
        ? { subject: subject.name, hours_per_day: hoursBySubject.get(subjectKey) as number }
        : findBestSubjectMatch(subject.name, plan.time_allocation.allocations, (allocation) => allocation.subject)
    const matchedPrioritySubject =
      priorityRankBySubject.get(subjectKey) != null
        ? subject.name
        : findBestSubjectMatch(subject.name, plan.priority_list, (prioritySubject) => prioritySubject)
    const priorityRank =
      priorityRankBySubject.get(subjectKey) ??
      (matchedPrioritySubject ? plan.priority_list.findIndex((prioritySubject) => prioritySubject === matchedPrioritySubject) : -1)
    const hoursPerDay = matchedAllocation?.hours_per_day ?? null
    const examDate = subject.exam_date
    const subjectName = subject.name.trim()
    const studyPlanEntry = matchedStudyPlanEntry
    const focusTopics = studyPlanEntry?.focus_topics ?? []
    const daysLeft = getDaysLeftUntilExam(examDate)
    const isWeakSubject = weakSubjectSet.has(subjectKey)

    return [
      subjectName,
      examDate ? formatExamDate(examDate) : '',
      daysLeft ?? '',
      getUrgencyLabel(daysLeft),
      priorityRank >= 0 ? priorityRank + 1 : '',
      hoursPerDay == null ? '' : formatHoursAndMinutes(hoursPerDay),
      isWeakSubject ? 'yes' : 'no',
      studyPlanEntry?.daily_goal ?? '',
      focusTopics.join('; '),
      buildSubjectReasoning({
        subjectName,
        examDate,
        priorityRank,
        hoursPerDay,
        isWeakSubject,
        focusTopics,
        dailyGoal: studyPlanEntry?.daily_goal,
      }),
      formatGeneratedAt(plan.generated_at),
    ]
      .map(escapeCsvValue)
      .join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

const buildSampleCsv = () =>
  [
    [
      'subject',
      'exam_date',
      'days_left',
      'urgency',
      'priority_rank',
      'study_time_per_day',
      'weak_subject',
      'daily_goal',
      'focus_topics',
      'subject_reasoning',
      'plan_generated_at',
    ].join(','),
    [
      'Applied Mathematics',
      '15 Apr 2026',
      16,
      'medium',
      1,
      '2 hrs 30 min',
      'yes',
      'Finish problem-solving practice for calculus and matrices.',
      'Integration; Matrices; Differential Equations',
      'Applied Mathematics is prioritized because its exam is closer, you marked it as weak, and the planner assigns extra daily study time for revision-heavy topics.',
      '30 Mar 2026, 10:30',
    ]
      .map(escapeCsvValue)
      .join(','),
    [
      'Physics',
      '22 Apr 2026',
      23,
      'low',
      2,
      '1 hr 30 min',
      'no',
      'Revise derivations and complete one timed chapter test.',
      'Modern Physics; Optics; Semiconductor Devices',
      'Physics is scheduled after Mathematics because the exam is later, but it still keeps steady daily revision to avoid last-minute cramming.',
      '30 Mar 2026, 10:30',
    ]
      .map(escapeCsvValue)
      .join(','),
  ].join('\n')

const downloadCsvFile = (filename: string, content: string) => {
  const csvBlob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const downloadUrl = URL.createObjectURL(csvBlob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

function App() {
  const [selectedPdfName, setSelectedPdfName] = useState('')
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null)
  const [syllabusText, setSyllabusText] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState(5)
  const [weakSubjectsText, setWeakSubjectsText] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<PlanResponse | null>(null)

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000', [])

  const handleAddSubject = () => {
    if (!subjectName.trim() || !examDate) return
    const normalizedSubjectName = normalizeSubjectKey(subjectName)

    setSubjects((prev) => {
      const existingIndex = prev.findIndex((subject) => normalizeSubjectKey(subject.name) === normalizedSubjectName)
      if (existingIndex === -1) {
        return [...prev, { name: subjectName.trim(), exam_date: examDate }]
      }

      const nextSubjects = [...prev]
      nextSubjects[existingIndex] = {
        ...nextSubjects[existingIndex],
        exam_date: examDate,
      }
      return nextSubjects
    })

    setError('')
    setSubjectName('')
    setExamDate('')
  }

  const clearSelectedPdf = () => {
    setSelectedPdfName('')
    setSelectedPdfFile(null)
    setSyllabusText('')
    const inputEl = document.getElementById('syllabus-input') as HTMLInputElement | null
    if (inputEl) inputEl.value = ''
  }

  const uploadSyllabusPdf = async (): Promise<string> => {
    if (!selectedPdfFile) return ''
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedPdfFile)

      const res = await fetch(`${apiBase}/upload-syllabus`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `PDF upload failed with status ${res.status}`)
      }

      const data = (await res.json()) as { syllabus_text?: string }
      const extracted = data.syllabus_text ?? ''
      setSyllabusText(extracted)
      return extracted
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleGeneratePlan = async () => {
    if (subjects.length === 0) {
      setError('Please add at least one subject and exam date.')
      return
    }
    setError('')
    setLoading(true)
    setPlan(null)

    try {
      const extractedSyllabusText = selectedPdfFile ? await uploadSyllabusPdf() : syllabusText
      const weakSubjects = weakSubjectsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch(`${apiBase}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects,
          hours_per_day: Number(hoursPerDay),
          weak_subjects: weakSubjects,
          syllabus_text: extractedSyllabusText,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `Request failed with status ${res.status}`)
      }

      const data = (await res.json()) as PlanResponse
      setPlan(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend.')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    if (!plan) {
      setError('Generate a study plan before exporting CSV.')
      return
    }

    setError('')
    const csvContent = buildPlanCsv(plan, subjects, weakSubjectsText)
    const safeTimestamp = (plan.generated_at ?? new Date().toISOString()).replace(/[:.]/g, '-')
    downloadCsvFile(`study-plan-${safeTimestamp}.csv`, csvContent)
  }

  const handleLaunchPlannerConsole = () => {
    document.getElementById('planner-console')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDownloadSampleCsv = () => {
    downloadCsvFile('study-plan-sample.csv', buildSampleCsv())
  }

  return (
    <div className="app-shell">
      <div className="aurora aurora-one" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />

      <header className="hero">
        <p className="hero-kicker">ACADEMIC PLANNER // FUTURE MODE</p>
        <h1>
          Forge Your <span>Exam Strategy</span> Like A Mission Control Deck
        </h1>
        <p className="hero-copy">
          Upload your syllabus PDF, inject exam timetable data, and instantly shape a precision study plan
          engineered for peak output.
        </p>

        <div className="hero-actions">
          <button className="btn btn-primary" onClick={handleLaunchPlannerConsole}>
            Launch Planner Console
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadSampleCsv}>
            View Sample CSV
          </button>
        </div>

        <section className="stats-grid" aria-label="Planner stats">
          {statCards.map((card) => (
            <article key={card.label} className="stats-card">
              <p>{card.label}</p>
              <h3>{card.value}</h3>
            </article>
          ))}
        </section>
      </header>

      <main className="content-grid">
        <section className="panel upload-panel">
          <div className="panel-head">
            <h2>Syllabus Ingestion</h2>
            <span className="badge">PDF</span>
          </div>
          <p>Drag and drop your course syllabus to map units, deadlines, and chapter priorities.</p>
          <label className="drop-zone" htmlFor="syllabus-input">
            <input
              id="syllabus-input"
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setSelectedPdfName(file ? file.name : '')
                setSelectedPdfFile(file ?? null)
                setSyllabusText('')
              }}
            />
            <strong>Drop PDF Here</strong>
            <span>or tap to browse local files</span>
          </label>
          {selectedPdfName && (
            <p style={{ marginTop: '0.5rem' }}>
              Selected PDF: <strong>{selectedPdfName}</strong>
              <button
                type="button"
                className="btn btn-small"
                style={{ marginLeft: '0.75rem' }}
                onClick={clearSelectedPdf}
              >
                Remove PDF
              </button>
            </p>
          )}
          {uploadingPdf && <p style={{ marginTop: '0.5rem' }}>Extracting syllabus from PDF...</p>}
          {!!syllabusText && !uploadingPdf && (
            <p style={{ marginTop: '0.5rem', color: '#7fffd4' }}>PDF parsed and included in planning.</p>
          )}
        </section>

        <section className="panel timetable-panel">
          <div className="panel-head">
            <h2>Exam Timetable Sync</h2>
            <span className="badge">DATES</span>
          </div>
          <p>Enter your exam slots so the planner can auto-balance revisions and rest windows.</p>
          <form className="timetable-form">
            <div>
              <label htmlFor="subject">Subject</label>
              <input
                id="subject"
                type="text"
                placeholder="Applied Mathematics"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="exam-date">Exam Date</label>
              <input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="hours-day">Hours / Day</label>
              <input
                id="hours-day"
                type="number"
                min="1"
                max="24"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
              />
            </div>
            <button type="button" className="btn btn-small" onClick={handleAddSubject}>
              Add Exam Node
            </button>
          </form>
          <div style={{ marginTop: '0.75rem' }}>
            <label htmlFor="weak-subjects">Weak Subjects (comma separated)</label>
            <input
              id="weak-subjects"
              type="text"
              placeholder="Math, Physics"
              value={weakSubjectsText}
              onChange={(e) => setWeakSubjectsText(e.target.value)}
            />
          </div>
          {subjects.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>Added subjects:</strong>
              {subjects.map((s) => (
                <p key={`${s.name}-${s.exam_date}`}>
                  {s.name} - {s.exam_date}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="panel pipeline-panel">
          <div className="panel-head">
            <h2>Planner Pipeline</h2>
            <span className="badge">AI FLOW</span>
          </div>
          <div className="timeline">
            {pipelineSteps.map((step) => (
              <article key={step.id} className="timeline-item">
                <div className="timeline-id">{step.id}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel export-panel" id="planner-console">
          <div className="panel-head">
            <h2>CSV Export Dock</h2>
            <span className="badge">OUTPUT</span>
          </div>
          <p>Once syllabus and exams are synced, launch a machine-formatted CSV with one click.</p>
          <button className="btn btn-primary full-width" onClick={handleGeneratePlan} disabled={loading}>
            {loading ? 'Generating Plan...' : 'Generate Study Plan'}
          </button>
          <button
            className="btn btn-secondary full-width"
            onClick={handleExportCsv}
            disabled={!plan || loading}
            style={{ marginTop: '0.75rem' }}
          >
            Download Study Plan CSV
          </button>
          {error && (
            <p style={{ color: '#ff6b6b', marginTop: '0.5rem' }}>
              Error: {error}
            </p>
          )}
          <div className="terminal-preview" aria-live="polite">
            {loading ? (
              <>
                <p>&gt; parsing syllabus.pdf</p>
                <p>&gt; syncing exam timetable...</p>
                <p>&gt; generating study plan...</p>
                <p className="ok">status: running</p>
              </>
            ) : error ? (
              <>
                <p>&gt; planner request failed</p>
                <p>&gt; check backend connection or input data</p>
                <p>&gt; csv export unavailable</p>
                <p style={{ color: '#ff6b6b' }}>status: error</p>
              </>
            ) : plan ? (
              <>
                <p>&gt; planner response received</p>
                <p>&gt; matched {subjects.length} subject(s)</p>
                <p>&gt; study-plan.csv ready for download</p>
                <p className="ok">status: success</p>
              </>
            ) : (
              <>
                <p>&gt; waiting for syllabus and exam inputs</p>
                <p>&gt; planner engine idle</p>
                <p>&gt; csv export dock standing by</p>
                <p>status: idle</p>
              </>
            )}
          </div>
          {plan && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Priority List</h3>
              <p>{plan.priority_list.join(', ')}</p>
              <h3>Time Allocation</h3>
              {plan.time_allocation.allocations.map((a) => (
                <p key={a.subject}>
                  {a.subject}: {formatHoursAndMinutes(a.hours_per_day)}/day
                </p>
              ))}
              {plan.adjustment_notes && (
                <>
                  <h3>Adjustment Notes</h3>
                  <p>{plan.adjustment_notes}</p>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App


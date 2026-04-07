import { useState } from 'react'

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

const formatHoursAndMinutes = (hours: number) => {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (wholeHours > 0 && minutes > 0) return `${wholeHours}h ${minutes}m`
  if (wholeHours > 0) return `${wholeHours}h`
  return `${minutes}m`
}

const normalizeSubjectKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const d = new Date(year, month - 1, day)
  return isNaN(d.getTime()) ? null : d
}

const formatExamDate = (value: string) => {
  const d = parseIsoDate(value)
  if (!d) return value
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </span>
  )
}

function App() {
  const [selectedPdfName, setSelectedPdfName] = useState('')
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null)
  const [syllabusText, setSyllabusText] = useState('')
  const [selectedTimetablePdfName, setSelectedTimetablePdfName] = useState('')
  const [selectedTimetablePdfFile, setSelectedTimetablePdfFile] = useState<File | null>(null)
  const [timetableText, setTimetableText] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState<number | ''>('')
  const [weakSubjectsText, setWeakSubjectsText] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploadingTimetablePdf, setUploadingTimetablePdf] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<PlanResponse | null>(null)

  const apiBase = 'http://127.0.0.1:8080';

  const uploadSyllabusPdf = async (): Promise<string> => {
    if (!selectedPdfFile) return ''
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedPdfFile)
      const res = await fetch(`${apiBase}/upload-syllabus`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as { syllabus_text: string }
      setSyllabusText(data.syllabus_text)
      return data.syllabus_text
    } catch (err) {
      setError('Failed to upload syllabus PDF.')
      return ''
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleTimetableFileSelect = async (file: File) => {
    setSelectedTimetablePdfName(file.name)
    setSelectedTimetablePdfFile(file)
    setTimetableText('')
    setError('')
    setUploadingTimetablePdf(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiBase}/upload-timetable`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as { timetable_text: string }
      setTimetableText(data.timetable_text)
    } catch (err) {
      setError('Failed to upload timetable PDF.')
    } finally {
      setUploadingTimetablePdf(false)
    }
  }

  const handleAddSubject = () => {
    if (!subjectName.trim() || !examDate) return
    const normalized = normalizeSubjectKey(subjectName)
    setSubjects((prev) => {
      const idx = prev.findIndex((s) => normalizeSubjectKey(s.name) === normalized)
      if (idx === -1) return [...prev, { name: subjectName.trim(), exam_date: examDate }]
      const next = [...prev]
      next[idx] = { ...next[idx], exam_date: examDate }
      return next
    })
    setError('')
    setSubjectName('')
    setExamDate('')
  }

  const handleRemoveSubject = (name: string) => {
    setSubjects((prev) => prev.filter((s) => s.name !== name))
  }

  const handleGeneratePlan = async () => {
    if (subjects.length === 0 && !timetableText && !selectedTimetablePdfFile) {
      setError('Add at least one subject (manually or via PDF) to generate a plan.')
      return
    }
    if (uploadingTimetablePdf) {
      setError('Timetable PDF is still being parsed. Please wait a moment.')
      return
    }
    setError('')
    setLoading(true)
    setPlan(null)

    let extractedSyllabusText = syllabusText

    try {
      if (selectedPdfFile && !syllabusText) extractedSyllabusText = await uploadSyllabusPdf()

      const weakSubjects = weakSubjectsText.split(',').map((s) => s.trim()).filter(Boolean)

      const res = await fetch(`${apiBase}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects,
          hours_per_day: hoursPerDay === '' ? null : Number(hoursPerDay),
          weak_subjects: weakSubjects,
          syllabus_text: extractedSyllabusText,
          timetable_text: timetableText,
        }),
      })

      if (!res.ok) throw new Error('Request failed')
      
      const data = await res.json() as PlanResponse
      setPlan(data)
    } catch (err) {
      setError('Failed to connect to backend.')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    if (!plan) { setError('Generate a study plan before exporting.'); return }
    setError('')
    
    // NUCLEAR FIX: Open a new tab and download directly from the Python backend
    window.open(`${apiBase}/download-csv`, '_blank');
  }

  const checkBackendHealth = async () => {
    try {
      const res = await fetch(`${apiBase}/`)
      if (res.ok) {
        const data = await res.json()
        alert(`Backend is running:\n${JSON.stringify(data, null, 2)}`)
      } else {
        alert(`Backend responded with status ${res.status}`)
      }
    } catch {
      alert(`Cannot connect to backend at ${apiBase}\n\nMake sure the backend is running (python main.py).`)
    }
  }

  const terminalStatus = loading ? 'loading' : error ? 'error' : plan ? 'success' : 'idle'

  return (
    <div className="app-shell">

      {/* Top bar */}
      <div className="topbar">
        <span className="wordmark">Exam<span>Forge</span> // Academic Planner</span>
        <span className="status-pill">System Ready</span>
      </div>

      {/* Hero */}
      <header className="hero">
        <p className="hero-eyebrow">AI-Powered Study Engine</p>
        <h1>
          Forge your exam strategy<br />
          with <em>precision intelligence</em>
        </h1>
        <p className="hero-sub">
          Upload your syllabus, sync your timetable, and receive a time-optimised
          study matrix engineered for peak academic output.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => document.getElementById('planner-console')?.scrollIntoView({ behavior: 'smooth' })}>
            Open Planner Console
          </button>
          <button className="btn btn-ghost" onClick={checkBackendHealth}>
            Check Backend
          </button>
        </div>
      </header>

      {/* ── Section: Preferences ── */}
      <p className="section-label">Study Preferences</p>
      <div className="layout-grid cols-1" style={{ marginBottom: 1 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Personalise Your Plan</span>
            <span className="badge badge-muted">Optional</span>
          </div>
          <p className="panel-desc">
            Set your daily availability and flag the subjects you need the most help with.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ width: 120 }}>
              <label className="form-label" htmlFor="hours-day">Hours / Day</label>
              <input
                id="hours-day"
                type="number"
                min="1" max="24"
                className="form-input"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 6"
              />
              <span className="form-helper">Defaults to 5 if left blank</span>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="form-label" htmlFor="weak-subjects">Weak Subjects</label>
              <input
                id="weak-subjects"
                type="text"
                className="form-input"
                placeholder="e.g. Mathematics, Physics"
                value={weakSubjectsText}
                onChange={(e) => setWeakSubjectsText(e.target.value)}
              />
              <span className="form-helper">Comma-separated — extra time allocated to these</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Inputs ── */}
      <p className="section-label" style={{ marginTop: '2rem' }}>Data Sources</p>
      <div className="layout-grid">

        {/* Manual subjects */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Manual Subject Entry</span>
            <span className="badge badge-muted">Optional</span>
          </div>
          <p className="panel-desc">Add subjects and exam dates directly if you prefer not to use PDFs.</p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="subject-name">Subject</label>
              <input
                id="subject-name"
                type="text"
                className="form-input"
                placeholder="e.g. Mathematics"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSubject()}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="exam-date">Exam Date</label>
              <input
                id="exam-date"
                type="date"
                className="form-input"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-outline-gold"
              onClick={handleAddSubject}
              disabled={!subjectName.trim() || !examDate}
              style={{ alignSelf: 'flex-end' }}
            >
              + Add
            </button>
          </div>

          {subjects.length > 0 && (
            <div className="subject-list">
              {subjects.map((s) => (
                <div key={`${s.name}-${s.exam_date}`} className="subject-row">
                  <span className="subject-name">{s.name}</span>
                  <span className="subject-date">{formatExamDate(s.exam_date)}</span>
                  <button
                    type="button"
                    className="file-remove"
                    onClick={() => handleRemoveSubject(s.name)}
                    style={{ marginLeft: 8 }}
                    title="Remove subject"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Planner Pipeline</span>
            <span className="badge badge-teal">AI Flow</span>
          </div>
          <p className="panel-desc">How your inputs become a precision study schedule.</p>
          <div className="pipeline">
            {pipelineSteps.map((step) => (
              <div key={step.id} className="pipeline-step">
                <div className="step-num">{step.id}</div>
                <div>
                  <div className="step-title">{step.title}</div>
                  <div className="step-detail">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Syllabus PDF */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Syllabus Ingestion</span>
            <span className="badge badge-gold">PDF</span>
          </div>
          <p className="panel-desc">Upload your course syllabus to auto-detect units, deadlines, and chapter priorities.</p>

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
            <div className="drop-icon">📄</div>
            <span className="drop-title">Drop syllabus PDF here</span>
            <span className="drop-sub">or tap to browse</span>
          </label>

          {selectedPdfName && (
            <div className="file-attached">
              <span>📎</span>
              <strong>{selectedPdfName}</strong>
              <button className="file-remove" onClick={() => { setSelectedPdfName(''); setSelectedPdfFile(null); setSyllabusText('') }}>✕</button>
            </div>
          )}
          {uploadingPdf && (
            <div className="status-inline loading">Extracting syllabus<LoadingDots /></div>
          )}
          {syllabusText && !uploadingPdf && (
            <div className="status-inline ok">✓ Syllabus parsed and ready</div>
          )}
        </div>

        {/* Timetable PDF — auto-parses on selection */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Timetable Ingestion</span>
            <span className="badge badge-gold">PDF</span>
          </div>
          <p className="panel-desc">Upload your exam timetable PDF — it will be parsed automatically on upload.</p>

          <label className="drop-zone" htmlFor="timetable-input">
            <input
              id="timetable-input"
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleTimetableFileSelect(file)
              }}
            />
            <div className="drop-icon">📅</div>
            <span className="drop-title">Drop timetable PDF here</span>
            <span className="drop-sub">or tap to browse — parses instantly</span>
          </label>

          {selectedTimetablePdfName && (
            <div className="file-attached">
              <span>📎</span>
              <strong>{selectedTimetablePdfName}</strong>
              <button
                className="file-remove"
                onClick={() => {
                  setSelectedTimetablePdfName('')
                  setSelectedTimetablePdfFile(null)
                  setTimetableText('')
                }}
              >✕</button>
            </div>
          )}
          {uploadingTimetablePdf && (
            <div className="status-inline loading">Parsing timetable<LoadingDots /></div>
          )}
          {timetableText && !uploadingTimetablePdf && (
            <div className="status-inline ok">✓ Timetable parsed and ready</div>
          )}
        </div>
      </div>

      {/* ── Section: Output ── */}
      <p className="section-label" style={{ marginTop: '2rem' }}>Generate & Export</p>
      <div className="layout-grid cols-1">
        <div className="panel" id="planner-console">
          <div className="panel-head">
            <span className="panel-title">Study Plan Output</span>
            <span className="badge badge-teal">CSV Export</span>
          </div>
          <p className="panel-desc">
            Once your inputs are configured, generate your optimised study plan and download it as a structured CSV.
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleGeneratePlan}
              disabled={loading || uploadingTimetablePdf}
              style={{ flex: '1 1 200px' }}
            >
              {loading ? (<>Generating plan<LoadingDots /></>) : 'Generate Study Plan'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleExportCsv}
              disabled={!plan || loading}
              style={{ flex: '1 1 200px' }}
            >
              Download CSV
            </button>
          </div>

          {error && (
            <div className="error-msg">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Terminal */}
          <div className="terminal">
            {terminalStatus === 'loading' && (
              <>
                <div className="term-line term-run">parsing syllabus data</div>
                <div className="term-line term-run">syncing exam timetable</div>
                <div className="term-line term-run">generating study matrix</div>
              </>
            )}
            {terminalStatus === 'error' && (
              <>
                <div className="term-line term-err">planner request failed</div>
                <div className="term-line term-err">check backend connection or input data</div>
                <div className="term-line term-err">csv export unavailable</div>
              </>
            )}
            {terminalStatus === 'success' && plan && (
              <>
                <div className="term-line term-ok">planner response received</div>
                <div className="term-line term-ok">matched {plan.priority_list.length} subject(s)</div>
                <div className="term-line term-ok">study_plan.csv ready for download</div>
              </>
            )}
            {terminalStatus === 'idle' && (
              <>
                <div className="term-line">waiting for syllabus and exam inputs</div>
                <div className="term-line">planner engine idle</div>
                <div className="term-line">csv export dock standing by</div>
              </>
            )}
          </div>

          {/* Plan results */}
          {plan && (
            <>
              <div className="result-section">
                <div className="result-label">Priority Order</div>
                <div className="result-chips">
                  {plan.priority_list.map((s, i) => (
                    <span key={s} className="chip">
                      <span style={{ color: 'var(--gold)', marginRight: 4, fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>#{i + 1}</span>
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="result-section">
                <div className="result-label">Daily Time Allocation</div>
                {plan.time_allocation.allocations.map((a) => (
                  <div key={a.subject} className="alloc-row">
                    <span className="alloc-name">{a.subject}</span>
                    <span className="alloc-time">{formatHoursAndMinutes(a.hours_per_day)} / day</span>
                  </div>
                ))}
              </div>

              {plan.adjustment_notes && (
                <div className="result-section">
                  <div className="result-label">Adjustment Notes</div>
                  <div className="notes-box">{plan.adjustment_notes}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}

export default App
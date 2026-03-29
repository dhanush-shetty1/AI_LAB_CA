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
  study_plan: Array<{ subject: string; daily_goal: string; focus_topics: string[] }>
  priority_list: string[]
  time_allocation: {
    total_hours_per_day: number
    allocations: Array<{ subject: string; hours_per_day: number }>
  }
  adjustment_notes?: string
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
    setSubjects((prev) => [...prev, { name: subjectName.trim(), exam_date: examDate }])
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
          <button className="btn btn-primary">Launch Planner Console</button>
          <button className="btn btn-secondary">View Sample CSV</button>
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

        <section className="panel export-panel">
          <div className="panel-head">
            <h2>CSV Export Dock</h2>
            <span className="badge">OUTPUT</span>
          </div>
          <p>Once syllabus and exams are synced, launch a machine-formatted CSV with one click.</p>
          <button className="btn btn-primary full-width" onClick={handleGeneratePlan} disabled={loading}>
            {loading ? 'Generating Plan...' : 'Generate Study Plan'}
          </button>
          {error && (
            <p style={{ color: '#ff6b6b', marginTop: '0.5rem' }}>
              Error: {error}
            </p>
          )}
          <div className="terminal-preview" aria-hidden="true">
            <p>&gt; parsing syllabus.pdf</p>
            <p>&gt; syncing exam timetable...</p>
            <p>&gt; building study-plan.csv</p>
            <p className="ok">status: success</p>
          </div>
          {plan && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Priority List</h3>
              <p>{plan.priority_list.join(', ')}</p>
              <h3>Time Allocation</h3>
              {plan.time_allocation.allocations.map((a) => (
                <p key={a.subject}>
                  {a.subject}: {a.hours_per_day} hrs/day
                </p>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App


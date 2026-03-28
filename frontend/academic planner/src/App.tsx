

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

function App() {
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
            <input id="syllabus-input" type="file" accept=".pdf" />
            <strong>Drop PDF Here</strong>
            <span>or tap to browse local files</span>
          </label>
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
              <input id="subject" type="text" placeholder="Applied Mathematics" />
            </div>
            <div>
              <label htmlFor="exam-date">Exam Date</label>
              <input id="exam-date" type="date" />
            </div>
            <div>
              <label htmlFor="exam-slot">Slot</label>
              <select id="exam-slot" defaultValue="Morning">
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
              </select>
            </div>
            <button type="button" className="btn btn-small">
              Add Exam Node
            </button>
          </form>
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
          <button className="btn btn-primary full-width">Generate Study Plan CSV</button>
          <div className="terminal-preview" aria-hidden="true">
            <p>&gt; parsing syllabus.pdf</p>
            <p>&gt; syncing exam timetable...</p>
            <p>&gt; building study-plan.csv</p>
            <p className="ok">status: success</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App


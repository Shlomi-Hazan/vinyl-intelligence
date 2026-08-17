const stackChecks = [
  'Vite frontend',
  'React application shell',
  'TypeScript project checks',
  'Netlify Function boundary at /api/health',
]

function App() {
  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="app-title">
        <p className="eyebrow">Milestone 1 scaffold</p>
        <h1 id="app-title">Vinyl Intelligence</h1>
        <p className="lede">
          The approved web stack is in place. Product features begin in
          later reviewed milestones.
        </p>
      </section>

      <section className="stack-panel" aria-labelledby="stack-title">
        <h2 id="stack-title">Stack Boundary Check</h2>
        <ul>
          {stackChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App

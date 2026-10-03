"use client";

export default function EmptyHero({ mode, starters, onPick }) {
  return (
    <div className="empty-hero">
      {mode === "general" ? (
        <>
          <h1>Ask me <em>anything</em></h1>
          <p>General questions, explanations, drafting, code. This mode isn&apos;t grounded in any documents, so there are no sources to check — for anything about Vince, switch to <strong>About Vince</strong>.</p>
        </>
      ) : (
        <>
          <h1>Ask me anything about <em>Vince</em></h1>
          <p>I answer from his CV, projects and notes — grounded in the documents, with the sources you can check. He&apos;s Sean Vincent Vien V. Viñas on paper, but goes by Vince.</p>
        </>
      )}
      <div className="starter-grid">
        {starters.map((starter, index) => (
          <button key={starter} type="button" className="starter-card" onClick={() => onPick(starter)}>
            <span className="starter-index">0{index + 1}</span>
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

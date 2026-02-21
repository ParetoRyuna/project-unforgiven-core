"use client";

type Props = {
  entries: string[];
};

export function Journal({ entries }: Props) {
  return (
    <section className="ow-card">
      <h3>Journal</h3>
      <div className="ow-journal">
        {entries.slice().reverse().map((entry, idx) => (
          <p key={`${idx}-${entry}`}>{entry}</p>
        ))}
      </div>
    </section>
  );
}

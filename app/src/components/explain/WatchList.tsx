import { SectionHeading } from "./SectionHeading";

export function WatchList({ items, play }: { items: { label: string; detail: string }[]; play?: boolean }) {
  return (
    <section className="ex-section" data-section="watch">
      <SectionHeading devi="bhairavi" play={play} />
      <ul className="ex-list">
        {items.map((w, i) => (
          <li key={i}>
            {w.label} <span className="ex-muted">· {w.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

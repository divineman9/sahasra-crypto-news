import { SectionHeading } from "./SectionHeading";

export function Uncertain({ items, play }: { items: string[]; play?: boolean }) {
  return (
    <section className="ex-section" data-section="uncertain">
      <SectionHeading devi="dhumavati" play={play} />
      <ul className="ex-list">
        {items.map((u, i) => (
          <li key={i}>{u}</li>
        ))}
      </ul>
    </section>
  );
}

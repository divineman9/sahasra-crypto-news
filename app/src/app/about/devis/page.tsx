import Link from "next/link";
import { DEVI } from "@/components/devi";

export const metadata = { title: "The ten lenses | Sahasra" };

// Legend for the ten decorative marks used on the "Understand this" cards.
export default function DevisPage() {
  return (
    <main className="mx-auto max-w-3xl p-4 font-mono text-xs text-slate-300">
      <Link href="/" className="text-slate-500 hover:text-slate-300">back to feed</Link>
      <h1 className="mt-3 font-sans text-lg font-semibold text-slate-100">The ten lenses</h1>
      <p className="mt-2 text-slate-400" data-testid="devi-note">
        These are original, contemporary editorial symbols inspired by the Daśa Mahāvidyā. They are decorative lenses for
        reading news, not devotional images, not ritual yantras, and they make no claims about markets.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="devi-list">
        {DEVI.map((d) => (
          <li key={d.key} className="devi-legend-item flex gap-3 rounded border border-slate-800 p-3" data-devi={d.key}>
            <span className="shrink-0" title={`${d.tooltip}\n${d.meaning}`}>
              <d.Component size={64} />
            </span>
            <div className="min-w-0">
              <h2 className="font-sans text-sm font-semibold text-slate-100">
                {d.name} <span className="font-normal text-slate-500">({d.iast})</span>
              </h2>
              <p className="mt-0.5 text-slate-200">Lens: {d.lens}</p>
              <p className="mt-0.5 text-slate-400">{d.meaning}</p>
              <p className="mt-1 text-[10px] text-slate-500">{d.tooltip}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

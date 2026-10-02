import { DEVI_BY_KEY, type DeviKey } from "./registry";

// One decorative mark. `title` (hover tooltip) = the respectful "Inspired by ..." line + the meaning line.
// The mark itself is aria-hidden; headings next to it are text-first.
export function DeviMark({
  devi, size = 18, play = false, className, tooltip = true,
}: {
  devi: DeviKey; size?: number; play?: boolean; className?: string; tooltip?: boolean;
}) {
  const d = DEVI_BY_KEY[devi];
  const Mark = d.Component;
  return (
    <span className="devi-wrap inline-flex shrink-0 items-center" title={tooltip ? `${d.tooltip}\n${d.meaning}` : undefined} style={{ lineHeight: 0 }}>
      <Mark size={size} play={play} className={className} />
    </span>
  );
}

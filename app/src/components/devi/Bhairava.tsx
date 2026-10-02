import { DeviSvg, accent, type DeviProps } from "./shapes";

// Bhairava (the Guardian): a trishula (trident) with a damaru-like hourglass, inside a guarding circle.
// No figure, no skulls, no animal; abstract line-art only.
export function Bhairava({ size = 64, play = false, className }: DeviProps) {
  return (
    <DeviSvg name="bhairava" size={size} play={play} className={className} title="Bhairava">
      <circle className="devi-bhairava-ring" cx="32" cy="32" r="28" pathLength={1} transform="rotate(-90 32 32)" opacity={0.7} />
      <g className="devi-bhairava-trident">
        <path d="M32 11 V53" />
        <path d="M22 14 V22 Q22 31 32 31 Q42 31 42 22 V14" />
        <path d="M32 11 L29.5 15 M32 11 L34.5 15 M22 14 L20 17.5 M22 14 L24 17.5 M42 14 L40 17.5 M42 14 L44 17.5" />
      </g>
      <path className="devi-bhairava-damaru" d="M26.5 37 H37.5 L32 44.5 Z M26.5 52 H37.5 L32 44.5 Z" style={accent("bhairava")} />
    </DeviSvg>
  );
}

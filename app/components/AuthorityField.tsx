/*
 * Animated hero background: request paths flow across the field and pass
 * through a central gate. Most are stamped through in violet; one is turned
 * away in red at the gate. Pure CSS motion (offset-path), no libraries.
 * The coordinate space is a fixed 1440x800 stage centered in the hero, so
 * the CSS offset-paths and the SVG strokes always agree.
 */

const PATHS = {
  p1: 'M -60,80 C 300,120 520,200 718,248 S 1250,420 1500,480',
  p2: 'M -60,420 C 260,380 500,300 718,250 S 1200,160 1500,120',
  p3: 'M -60,650 C 300,600 520,380 720,252 S 1250,520 1500,640',
  p4: 'M 1500,60 C 1100,120 900,200 722,246 S 300,420 -60,520',
  reject: 'M -60,260 C 300,236 520,244 716,248',
};

export default function AuthorityField() {
  return (
    <div className="hero-field" aria-hidden>
      <div className="hero-stage">
        <svg viewBox="0 0 1440 800" fill="none">
          {/* request lanes */}
          <path d={PATHS.p1} className="lane" />
          <path d={PATHS.p2} className="lane" />
          <path d={PATHS.p3} className="lane" />
          <path d={PATHS.p4} className="lane" />
          {/* the central gate */}
          <g className="gate">
            <path d="M 678,214 h 84" />
            <path d="M 690,214 v 72" />
            <path d="M 750,214 v 72" />
          </g>
          {/* distant gates for texture */}
          <g className="gate gate-far">
            <path d="M 156,560 h 44 M 162,560 v 38 M 194,560 v 38" />
            <path d="M 1236,150 h 44 M 1242,150 v 38 M 1274,150 v 38" />
            <path d="M 1310,600 h 34 M 1315,600 v 30 M 1339,600 v 30" />
          </g>
        </svg>
        <span className="field-dot dot-1" />
        <span className="field-dot dot-2" />
        <span className="field-dot dot-3" />
        <span className="field-dot dot-4" />
        <span className="field-dot dot-reject" />
      </div>
      <div className="hero-wash" />
    </div>
  );
}

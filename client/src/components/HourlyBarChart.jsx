const CHART_HEIGHT = 180
const SCALE_MAX = 150 // % headroom above the 100% reference line
const LINE_BAR_HEIGHT = (100 / SCALE_MAX) * CHART_HEIGHT // px height a bar would have exactly at 100%
const MIN_GAP_BELOW_LINE = 6 // px — guaranteed visual gap for any bar under 100%, bigger than the glow blur radius so it can never look like it touches the line

export default function HourlyBarChart({ hourly }) {
  return (
    <div className="relative">
      <div className="scroll-fade-right relative overflow-x-auto pb-2">
        <div style={{ minWidth: 'max-content' }}>
          {/* Bars zone: exactly CHART_HEIGHT tall, so every bar column shares the
              same bottom edge and the 100% line's own `bottom` offset lines up
              with the bars' real baseline — no guessed offset for the label row. */}
          <div className="relative flex items-end gap-3 pl-1 pr-10" style={{ height: CHART_HEIGHT }}>
            {hourly.map((slot) => {
              let barHeight = Math.max((Math.min(slot.pct, SCALE_MAX) / SCALE_MAX) * CHART_HEIGHT, slot.qty > 0 ? 4 : 0)
              if (slot.pct < 100) {
                barHeight = Math.min(barHeight, LINE_BAR_HEIGHT - MIN_GAP_BELOW_LINE)
              }
              return (
                <div key={slot.index} className="flex w-16 flex-shrink-0 items-end justify-center" style={{ height: CHART_HEIGHT }}>
                  <div
                    className="w-9 rounded-t-sm bg-turquoise/80 shadow-glow-bar transition-all"
                    style={{ height: barHeight }}
                  >
                    <div className="w-full pt-1 text-center font-mono text-[11px] font-medium text-navy-950">
                      {slot.qty > 0 ? slot.qty : ''}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* 100% reference line — positioned within this same CHART_HEIGHT box */}
            <div
              className="pointer-events-none absolute left-0 right-10 border-t border-dashed border-turquoise/40"
              style={{ bottom: LINE_BAR_HEIGHT }}
            >
              <span className="absolute -top-2.5 right-0 bg-navy-900 px-1 font-mono text-[10px] text-turquoise/70">100%</span>
            </div>
          </div>

          {/* Label row — its own zone, sized by its own content, has no effect on bar/line alignment above */}
          <div className="mt-1 flex gap-3 pl-1 pr-10">
            {hourly.map((slot) => (
              <div key={slot.index} className="w-16 flex-shrink-0 text-center font-mono text-[10px] leading-tight text-slate-500">
                {slot.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-6 right-1 animate-bounce-x text-turquoise/70">›</div>
    </div>
  )
}

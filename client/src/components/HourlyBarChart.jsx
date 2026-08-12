const CHART_HEIGHT = 180
const SCALE_MAX = 150 // % headroom above the 100% reference line

export default function HourlyBarChart({ hourly }) {
  return (
    <div className="relative">
      <div className="scroll-fade-right relative overflow-x-auto pb-2">
        <div className="flex items-end gap-3 pl-1 pr-10" style={{ height: CHART_HEIGHT + 40 }}>
          {hourly.map((slot) => {
            const barHeight = Math.max((Math.min(slot.pct, SCALE_MAX) / SCALE_MAX) * CHART_HEIGHT, slot.qty > 0 ? 4 : 0)
            return (
              <div key={slot.index} className="flex w-16 flex-shrink-0 flex-col items-center justify-end gap-1" style={{ height: CHART_HEIGHT + 40 }}>
                <div className="relative flex flex-1 items-end" style={{ height: CHART_HEIGHT }}>
                  <div
                    className="w-9 rounded-t-sm bg-turquoise/80 shadow-glow-sm transition-all"
                    style={{ height: barHeight }}
                  >
                    <div className="w-full pt-1 text-center font-mono text-[11px] font-medium text-navy-950">
                      {slot.qty > 0 ? slot.qty : ''}
                    </div>
                  </div>
                </div>
                <div className="text-center font-mono text-[10px] leading-tight text-slate-500">{slot.label}</div>
              </div>
            )
          })}
        </div>

        {/* 100% reference line */}
        <div
          className="pointer-events-none absolute left-0 right-10 border-t border-dashed border-turquoise/40"
          style={{ bottom: 40 + (100 / SCALE_MAX) * CHART_HEIGHT }}
        >
          <span className="absolute -top-2.5 right-0 bg-navy-900 px-1 font-mono text-[10px] text-turquoise/70">100%</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-6 right-1 animate-bounce-x text-turquoise/70">›</div>
    </div>
  )
}

export default function AccuracyChart({ points, width = 600, height = 160 }) {
  if (!points || points.length === 0) return null

  const padding = { top: 10, right: 10, bottom: 24, left: 32 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0
  const y = (v) => padding.top + innerH - (v / 100) * innerH
  const x = (i) => padding.left + i * stepX

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.accuracy).toFixed(1)}`).join(' ')
  const areaPath = `${path} L ${x(points.length - 1).toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {[0, 25, 50, 75, 100].map((v) => (
        <line key={v} x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
      ))}
      <path d={areaPath} fill="rgba(212,175,55,0.12)" stroke="none" />
      <path d={path} fill="none" stroke="#D4AF37" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.5))' }} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.accuracy)} r="3" fill="#F5D061" />
      ))}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 8 || 1) === 0 ? (
          <text key={i} x={x(i)} y={height - 6} fontSize="9" fill="#64748B" textAnchor="middle">
            {p.label}
          </text>
        ) : null,
      )}
      <text x={4} y={y(0) + 3} fontSize="9" fill="#64748B">0</text>
      <text x={4} y={y(100) + 3} fontSize="9" fill="#64748B">100</text>
    </svg>
  )
}

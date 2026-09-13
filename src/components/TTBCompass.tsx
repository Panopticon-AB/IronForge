import type React from 'react';
import type { TTBIndices } from '../types';

interface TTBCompassProps {
  indices: TTBIndices;
}

const TTBCompass: React.FC<TTBCompassProps> = ({ indices }) => {
  const size = 120;
  const center = size / 2;
  const radius = 45;

  const degToRad = (deg: number) => (deg * Math.PI) / 180;

  const getCoords = (angle: number, score: number, maxScore = 100) => {
    const r = (score / maxScore) * radius;
    const x = center + r * Math.cos(degToRad(angle));
    const y = center + r * Math.sin(degToRad(angle));
    return { x, y };
  };

  const wellnessScore = indices.wellness;
  const strengthScore = indices.strength;
  const enduranceScore = indices.endurance;

  if (wellnessScore === null || strengthScore === null || enduranceScore === null) {
    const scoreRows = [
      ['WEL', wellnessScore],
      ['STR', strengthScore],
      ['END', enduranceScore],
    ] as const;

    return (
      <div className="bg-armor border-2 border-clay/30 rounded-lg shadow-2xl relative overflow-hidden group p-4">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-10" />
        <div className="relative z-10">
          <div className="flex justify-between items-baseline mb-3">
            <h3 className="font-serif text-sm uppercase tracking-widest text-clay">Sys. Vitality</h3>
            <span className="text-xs font-mono bg-void text-cyan px-2 py-1 rounded shadow-[0_0_10px_rgba(6,182,212,0.3)]">
              PARTIAL DATA
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            {scoreRows.map(([label, score]) => (
              <div key={label} className="bg-void/40 border border-steel/20 rounded p-2">
                <div className="text-[10px] font-serif text-steel">{label}</div>
                <div className="font-mono text-sm text-clay">{score === null ? '—' : score}</div>
              </div>
            ))}
          </div>

          <p className="text-[10px] leading-relaxed text-steel">
            Insufficient TTB evidence. Unknown scores are not plotted as zero.
          </p>
        </div>
      </div>
    );
  }

  const pWellness = getCoords(-90, wellnessScore);
  const pStrength = getCoords(30, strengthScore);
  const pEndurance = getCoords(150, enduranceScore);

  const maxWellness = getCoords(-90, 100);
  const maxStrength = getCoords(30, 100);
  const maxEndurance = getCoords(150, 100);

  const healthPercentage = wellnessScore;
  const healthStatus =
    healthPercentage > 85
      ? 'FRESH'
      : healthPercentage > 60
        ? 'STABLE'
        : healthPercentage > 30
          ? 'FATIGUED'
          : 'DEPLETED';
  const healthColor =
    healthPercentage > 70 ? 'bg-venom' : healthPercentage > 40 ? 'bg-gold' : 'bg-plasma';

  return (
    <div className="bg-armor border-2 border-clay/30 rounded-lg shadow-2xl relative overflow-hidden group p-4">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-10" />
      <div className="relative z-10">
        <div className="flex justify-between items-baseline mb-2">
          <h3 className="font-serif text-sm uppercase tracking-widest text-clay">Sys. Vitality</h3>
          <span className="text-xs font-mono bg-void text-cyan px-2 py-1 rounded shadow-[0_0_10px_rgba(6,182,212,0.3)]">
            TSB-S
          </span>
        </div>
        <div className="relative flex flex-col items-center">
          <div className="relative w-40 h-40">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full h-full drop-shadow-2xl overflow-visible"
            >
              <title>Total Training Balance radar</title>
              <defs>
                <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                  <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.3" />
                </radialGradient>
              </defs>

              {/* Background Grid */}
              <line
                x1={center}
                y1={center}
                x2={maxWellness.x}
                y2={maxWellness.y}
                stroke="var(--color-steel)"
                strokeWidth="1"
              />
              <line
                x1={center}
                y1={center}
                x2={maxStrength.x}
                y2={maxStrength.y}
                stroke="var(--color-steel)"
                strokeWidth="1"
              />
              <line
                x1={center}
                y1={center}
                x2={maxEndurance.x}
                y2={maxEndurance.y}
                stroke="var(--color-steel)"
                strokeWidth="1"
              />

              {[25, 50, 75, 100].map((pct) => {
                const w = getCoords(-90, pct);
                const s = getCoords(30, pct);
                const e = getCoords(150, pct);
                return (
                  <polygon
                    key={pct}
                    points={`${w.x},${w.y} ${s.x},${s.y} ${e.x},${e.y}`}
                    fill="none"
                    stroke="var(--color-steel)"
                    strokeWidth={pct === 100 ? 1.5 : 0.5}
                    strokeOpacity={pct === 100 ? 0.5 : 0.3}
                  />
                );
              })}

              {/* Data Shape */}
              <polygon
                points={`${pWellness.x},${pWellness.y} ${pStrength.x},${pStrength.y} ${pEndurance.x},${pEndurance.y}`}
                fill="url(#radarGradient)"
                stroke="var(--color-gold)"
                strokeWidth="2"
                className="drop-shadow-[0_0_8px_rgba(234,179,8,0.7)] transition-all duration-1000 ease-out"
              />

              {/* Vertices */}
              <circle cx={pWellness.x} cy={pWellness.y} r="3" fill="var(--color-gold)" />
              <circle cx={pStrength.x} cy={pStrength.y} r="3" fill="var(--color-gold)" />
              <circle cx={pEndurance.x} cy={pEndurance.y} r="3" fill="var(--color-gold)" />

              {/* Labels */}
              <text
                x={maxWellness.x - 10}
                y={maxWellness.y + 5}
                textAnchor="end"
                fill="var(--color-clay)"
                fontSize="8"
                fontWeight="bold"
                className="uppercase font-serif"
              >
                WEL
              </text>
              <text
                x={maxStrength.x + 10}
                y={maxStrength.y + 5}
                textAnchor="start"
                fill="var(--color-clay)"
                fontSize="8"
                fontWeight="bold"
                className="uppercase font-serif"
              >
                STR
              </text>
              <text
                x={maxEndurance.x - 10}
                y={maxEndurance.y + 5}
                textAnchor="end"
                fill="var(--color-clay)"
                fontSize="8"
                fontWeight="bold"
                className="uppercase font-serif"
              >
                END
              </text>
            </svg>
          </div>

          <div className="w-full px-2 mt-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-serif text-steel">SYST. HEALTH</span>
              <span className="text-[10px] font-bold text-clay uppercase">{healthStatus}</span>
            </div>
            <div className="w-full bg-steel/20 rounded-full h-1.5">
              <div
                className={`${healthColor} h-1.5 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(var(--color-gold),0.3)]`}
                style={{ width: `${healthPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TTBCompass;

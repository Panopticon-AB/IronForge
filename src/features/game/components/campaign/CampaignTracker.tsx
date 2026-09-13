import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { BUILD_VOLUME_TARGETS } from '@/data/builds';
import { TitanXPBar } from '@/features/titan/components/TitanXPBar';
import { cn } from '@/lib/utils';
import type { IntervalsWellness, TTBIndices } from '@/types';
import type { TrainingPath, WeeklyMastery } from '@/types/training';
import { CheckCircle2, Lock, Scroll } from 'lucide-react';
import type React from 'react';

interface CampaignTrackerProps {
  wellness: IntervalsWellness | null;
  ttb: TTBIndices | null;
  level: number;
  activePath?: TrainingPath;
  strengthProgress?: number; // e1RM increase over time
  totalExperience?: number;
  weeklyMastery?: WeeklyMastery;
}

/**
 * Generate dynamic campaign gates based on active training path
 */
function getPhase1Gates(
  ctl: number | null,
  wellnessScore: number | null,
  level: number,
  activePath: TrainingPath,
  strengthProgress: number
) {
  // Dynamic thresholds based on path
  const ctlThreshold =
    {
      JUGGERNAUT: 10, // Lower cardio requirement
      PATHFINDER: 40, // Higher for cardio focus
      WARDEN: 20,
    }[activePath] || 20;

  const strengthGate = activePath === 'JUGGERNAUT';

  const gates = [
    {
      label: `Establish Base Resilience (CTL > ${ctlThreshold})`,
      completed: ctl !== null && ctl >= ctlThreshold,
      current: ctl === null ? 'unknown' : `${Math.round(ctl)} / ${ctlThreshold}`,
      pathRelevant: activePath === 'PATHFINDER' || activePath === 'WARDEN',
    },
    {
      label: 'Stabilize Recovery (Wellness > 80)',
      completed: wellnessScore !== null && wellnessScore >= 80,
      current: wellnessScore === null ? 'unknown' : `${wellnessScore} / 80`,
      pathRelevant: true,
    },
    {
      label: 'Prove Consistency (Reach Level 5)',
      completed: level >= 5,
      current: `Lvl ${level} / 5`,
      pathRelevant: true,
    },
  ];

  if (strengthGate) {
    gates.unshift({
      label: 'Increase 1RM by 5%',
      completed: strengthProgress >= 5,
      current: `+${strengthProgress.toFixed(1)}% / 5%`,
      pathRelevant: true,
    });
  }

  return gates;
}

export const CampaignTracker: React.FC<CampaignTrackerProps> = ({
  wellness,
  ttb,
  level,
  activePath = 'WARDEN',
  strengthProgress = 0,
  totalExperience = 0,
  weeklyMastery,
}) => {
  const wellnessScore = ttb?.wellness ?? null;
  const ctl = wellness?.ctl ?? null;
  const isPhase1Complete = getPhase1Gates(
    ctl,
    wellnessScore,
    level,
    activePath,
    strengthProgress
  ).every((p) => p.completed);
  const gates = getPhase1Gates(ctl, wellnessScore, level, activePath, strengthProgress);

  const cardStyle = cn('bg-forge-900 border-2 rounded-lg p-4 h-full transition-all duration-300', {
    'border-rarity-legendary shadow-legendary-glow animate-pulse-glow': !isPhase1Complete,
    'border-forge-border': isPhase1Complete,
  });

  return (
    <div className={cardStyle}>
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-forge-border pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Scroll className="w-5 h-5 text-rarity-legendary" />
          <h2 className="font-bold uppercase tracking-widest text-warrior-light text-sm">
            The Grand Campaign
          </h2>
        </div>
        <span
          className={`border ${isPhase1Complete ? 'border-rarity-legendary text-rarity-legendary' : 'border-warrior text-warrior'} font-bold text-xs uppercase rounded px-2 py-0.5`}
        >
          {isPhase1Complete ? 'Complete' : 'Active'}
        </span>
      </div>

      {/* Current Act Details */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-1">Act I: The Rites of Initiation</h3>
        <p className="text-rarity-common text-xs italic max-w-xl">
          &quot;Before a Titan can carry the weight of the world, they must first master the weight
          of their own spirit. Build the foundation.&quot;
        </p>
      </div>

      {/* Level & XP Progress */}
      <div className="mb-6 bg-forge-800/50 p-2 rounded-lg border border-forge-border/50">
        <TitanXPBar currentXP={(totalExperience || 0) % 100} maxXP={100} level={level} />
      </div>

      {/* Weekly Mastery (System Matrix Metrics) */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-rarity-legendary" />
          <h3 className="font-bold uppercase tracking-wider text-xs text-warrior-light">
            Weekly Mastery
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <MasteryProgressBar
            label="Strength Sets"
            current={weeklyMastery?.strengthSets || 0}
            target={(BUILD_VOLUME_TARGETS[activePath] || BUILD_VOLUME_TARGETS.WARDEN).strengthSets}
            color="bg-red-500"
          />
          <MasteryProgressBar
            label="Cardio TSS"
            current={weeklyMastery?.cardioTss || 0}
            target={(BUILD_VOLUME_TARGETS[activePath] || BUILD_VOLUME_TARGETS.WARDEN).cardioTss}
            color="bg-cyan-500"
          />
          <MasteryProgressBar
            label="Mobility Sessions"
            current={weeklyMastery?.mobilitySessions || 0}
            target={
              (BUILD_VOLUME_TARGETS[activePath] || BUILD_VOLUME_TARGETS.WARDEN).mobilitySessions
            }
            color="bg-amber-500"
          />
        </div>
      </div>

      {/* Attunement Gate */}
      <Alert className="bg-forge-800 border-forge-border">
        <Lock className="w-4 h-4 text-warrior" />
        <AlertTitle className="font-bold uppercase text-xs text-warrior">
          Attunement Gate (Requirements to Advance)
        </AlertTitle>
        <AlertDescription>
          <div className="space-y-1.5 mt-2">
            {gates.map((req, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {req.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-rarity-legendary" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-rarity-common" />
                  )}
                  <span className="text-rarity-common text-xs">{req.label}</span>
                </div>
                <span className="font-mono text-xs text-rarity-common">{req.current}</span>
              </div>
            ))}
          </div>
        </AlertDescription>
      </Alert>

      {/* Future Acts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
        <div className="bg-forge-800 border border-forge-border rounded p-3 flex items-center gap-3">
          <Lock className="w-5 h-5 text-rarity-common" />
          <div>
            <h4 className="text-rarity-common font-bold uppercase text-xs">Act II</h4>
            <p className="font-bold text-sm text-white">The Basalt Bastion</p>
          </div>
        </div>
        <div className="bg-forge-800 border border-forge-border rounded p-3 flex items-center gap-3">
          <Lock className="w-5 h-5 text-rarity-common" />
          <div>
            <h4 className="text-rarity-common font-bold uppercase text-xs">Act III</h4>
            <p className="font-bold text-sm text-white">The Elite Crucible</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MasteryProgressBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
}

const MasteryProgressBar: React.FC<MasteryProgressBarProps> = ({
  label,
  current,
  target,
  color,
}) => {
  const percentage = Math.min(100, (current / target) * 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-tighter">
        <span className="text-rarity-common">{label}</span>
        <span className="text-white font-mono">
          {current} / {target}
        </span>
      </div>
      <div className="h-1.5 w-full bg-forge-700 rounded-full overflow-hidden border border-forge-border/30">
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,0,0,0.5)]',
            color
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

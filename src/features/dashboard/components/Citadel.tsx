import type { LeaderboardEntry } from '@/actions/social/leaderboards';
import { QuestBoard } from '@/components/gamification/QuestBoard';
import UltrathinkDashboard from '@/features/dashboard/components/UltrathinkDashboard';
import { CampaignTracker } from '@/features/game/components/campaign/CampaignTracker';
import { PocketCastsPlayer } from '@/features/podcast/components/PocketCastsPlayer';
import type React from 'react';
import type { DashboardAction, DashboardState } from '../types';
import { FeedPanel } from './FeedPanel';
import { QuickActions } from './QuickActions';
import { StatsHeader } from './StatsHeader';

interface CitadelProps {
  state: DashboardState;
  dispatch: React.Dispatch<DashboardAction>;
  titanState?: any;
  pocketCastsConnected?: boolean;
  liteMode?: boolean;
  leaderboardEntries?: LeaderboardEntry[];
}

export const Citadel: React.FC<CitadelProps> = ({
  state,
  dispatch,
  titanState,
  pocketCastsConnected,
  liteMode,
}) => (
  <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in">
    <StatsHeader state={state} titanState={titanState} liteMode={liteMode} />

    {!liteMode && (
      <section id="quest-board">
        <QuestBoard
          challenges={state.challenges || []}
          onClaimSuccess={() => {
            /* Handled by Server Action + Revalidate */
          }}
        />
      </section>
    )}

    <QuickActions dispatch={dispatch} />

    {pocketCastsConnected && (
      <section id="podcast-player">
        <PocketCastsPlayer />
      </section>
    )}

    <FeedPanel state={state} dispatch={dispatch} titanState={titanState} />

    <section
      id="ultrathink-dashboard"
      className="bg-forge-800 p-6 rounded-lg shadow-xl border border-forge-700"
    >
      <h2 className="text-2xl font-bold text-magma mb-4 uppercase tracking-wider">
        Ultrathink Dashboard
      </h2>
      <UltrathinkDashboard
        ttb={state.ttb || undefined}
        wellness={state.wellnessData}
        audit={
          state.weaknessAudit || {
            detected: false,
            type: 'NONE',
            message: 'Analyzing...',
            confidence: 0,
          }
        }
        forecast={state.forecast}
        events={state.events}
        titanAnalysis={state.titanAnalysis || undefined}
        activePath={state.activePath}
      />
    </section>

    {!liteMode && (
      <section
        id="campaign-tracker"
        className="bg-forge-800 p-6 rounded-lg shadow-xl border border-forge-700"
      >
        <h2 className="text-2xl font-bold text-magma mb-4 uppercase tracking-wider">
          Campaign Tracker
        </h2>
        <CampaignTracker
          wellness={state.wellnessData}
          ttb={state.ttb}
          level={state.level}
          activePath={state.activePath}
          totalExperience={state.totalExperience}
          weeklyMastery={state.weeklyMastery}
        />
      </section>
    )}
  </div>
);

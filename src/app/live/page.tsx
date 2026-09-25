import { getActiveStrengthSessionAction } from '@/actions/live-forge/core';
import { LiveForgeContainer } from '@/components/live/LiveForgeContainer';

export const metadata = {
  title: 'Live Forge — Strength Logging',
  description: 'Production-ready strength logging from phone or web browser',
};

export const dynamic = 'force-dynamic';

export default async function LiveForgePage() {
  const activeSession = await getActiveStrengthSessionAction();

  return (
    <main className="min-h-screen bg-black text-white px-3 py-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <LiveForgeContainer initialSession={activeSession} />
      </div>
    </main>
  );
}

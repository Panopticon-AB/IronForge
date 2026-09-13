export type StrengthEvidenceSource =
  | 'HEVY'
  | 'IRONFORGE_LIVE_FORGE'
  | 'IRONFORGE_MANUAL'
  | 'INTERVALS_ICU';

export interface StrengthEvidenceProvenance {
  source: StrengthEvidenceSource;
  providerSessionId?: string;
  providerRevision?: string;
  importedAt?: string;
}

export interface StrengthSetEvidence {
  sequence: number;
  providerSetIndex?: number;
  loadKg?: number;
  reps?: number;
  durationSeconds?: number;
  rpe?: number;
  rir?: number;
  isBodyweight?: boolean;
}

export interface StrengthExerciseEvidence {
  sequence: number;
  exerciseName: string;
  providerExerciseId?: string;
  equipmentProfileId?: string;
  exerciseVariant?: string;
  setupMode?: string;
  sets: StrengthSetEvidence[];
}

export interface StrengthSessionEvidence {
  provenance: StrengthEvidenceProvenance;
  title?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  exercises: StrengthExerciseEvidence[];
}

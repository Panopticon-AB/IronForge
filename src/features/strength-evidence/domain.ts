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
  clientWriteId?: string;
  measurementMode?: 'LOAD_AND_REPS' | 'REPS_ONLY' | 'DURATION' | 'DURATION_AND_LOAD';
  load?: number;
  loadUnit?: 'KG' | 'LBS';
  loadSemantics?:
    | 'TOTAL_EXTERNAL_LOAD'
    | 'ADDED_LOAD'
    | 'PER_HAND'
    | 'BODYWEIGHT'
    | 'ASSISTED_BODYWEIGHT';
  loadKg?: number;
  reps?: number;
  durationSeconds?: number;
  side?: 'LEFT' | 'RIGHT' | 'BILATERAL';
  rpe?: number;
  rir?: number;
  isBodyweight?: boolean;
  note?: string;
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

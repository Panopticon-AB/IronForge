// Re-exports from sibling type files
export type { AuditReport } from './auditor';
export type { TrainingPath, WeeklyMastery } from './training';

// Local imports for internal use
import type { AuditReport } from './auditor';
import type { TrainingPath, WeeklyMastery } from './training';

export enum BlockType {
  WARMUP = 'warmup',
  STATION = 'station',
  TRANSITION = 'transition',
  COOLDOWN = 'cooldown',
}

export enum Archetype {
  JUGGERNAUT = 'JUGGERNAUT',
  PATHFINDER = 'PATHFINDER',
  WARDEN = 'WARDEN',
}

export enum ExerciseLogic {
  FIXED_REPS = 'fixed_reps',
  TM_PERCENT = '531_tm_percent',
}

export type Rarity = 'poor' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export enum SubscriptionTier {
  FREE = 'FREE',
  PRO = 'PRO',
  LIFETIME = 'LIFETIME',
}

export interface User {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus?: string;
  subscriptionExpiry?: Date;
  archetype?: Archetype;
  // Add other fields as they become necessary for frontend
}

export interface Set {
  id: string;
  reps: number | string; // Target: string for "AMRAP"
  completedReps?: number; // Actual performed reps
  weightPct?: number; // For TM logic
  weight?: number; // Resolved weight
  completed: boolean;
  isPrZone?: boolean;
  isPr?: boolean; // Added for tracking PRs in session
  rarity?: Rarity; // Visual style
  e1rm?: number; // Calculated estimated 1RM for this set performance
  rpe?: number; // Rate of Perceived Exertion
  type?: string;
  setType?: 'normal' | 'failure' | 'dropset' | 'warmup' | 'myoreps';
  isWarmup?: boolean;
  completedAt?: string;
  repGoal?: number;
  e1rmGoalReps?: number;
  e1rmTarget?: number;
}

export interface Exercise {
  id: string;
  name: string;
  hevyId?: string; // Integration ID
  logic: ExerciseLogic;
  trainingMax?: number; // Default TM for calc
  sets: Set[];
  notes?: string;
  instructions?: string[];
  demoUrl?: string;
  lootTable?: string[]; // Flavor text for rewards
  supersetId?: string; // Links multiple exercises together
  supersetOrder?: number; // 1 (A1), 2 (A2), etc.
}

export interface Block {
  id: string;
  name: string;
  type: BlockType;
  exercises?: Exercise[]; // For Station/Warmup
  setupInstructions?: string[]; // For Transition
  targetSetupName?: string; // For Transition
  estimatedDurationSec?: number;
}

export type QuestDifficulty = 'Normal' | 'Heroic' | 'Mythic';

export interface Session {
  id: string;
  name: string; // "Quest Name"
  zoneName?: string; // e.g., "The Iron Mines"
  difficulty?: QuestDifficulty;
  levelReq?: number;
  blocks: Block[];
  isGenerated?: boolean; // Flag for dynamic quests
  isCustom?: boolean; // Flag for user-created dungeons
}

// --- EQUIPMENT / ARMORY ---
export type EquipmentCategory = 'Barbell' | 'Weights' | 'Machine' | 'Cardio' | 'Accessory' | 'Rack';

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  isOwned: boolean;
}

// --- GUILDS & RAIDS ---
export interface Guild {
  id: string;
  name: string;
  memberCount: number;
  activeRaid?: RaidBoss;
}

export interface RaidBoss {
  id: string;
  name: string;
  totalHp: number;
  currentHp: number;
  image: string;
  description: string;
  rewards: string[];
}

export interface ChatMessage {
  id: string;
  userName: string;
  message: string;
  timestamp: string;
  type: 'CHAT' | 'LOG';
}

// --- SKILLS & TALENTS ---
export enum SkillStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
  MASTERED = 'MASTERED',
}

export type SkillCategory =
  // Legacy categories (deprecated, kept for backward compatibility)
  | 'push'
  | 'pull'
  | 'legs'
  | 'core'
  // New Path-aligned categories
  | 'strength' // Juggernaut alignment (merged push + legs)
  | 'hypertrophy' // Titan alignment
  | 'endurance' // Engine alignment
  | 'hybrid' // Warden alignment
  | 'utility'; // Renamed from 'core' (all paths)

export interface SkillRequirement {
  type: 'achievement_count' | 'vo2max_value' | '1rm_weight' | 'rep_count';
  exercise_id: string; // 'any' or specific ID
  value: number;
  comparison: 'gte' | 'lte';
}

export interface SkillNode {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  parents: string[];
  x: number;
  y: number;
  currency: 'talent_point' | 'kinetic_shard';
  cost: number;
  requirements: SkillRequirement[];
}

// --- ACHIEVEMENTS ---
export type AchievementCategory = 'general' | 'dungeons' | 'professions' | 'cardio' | 'feats';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  points: number;
}

export interface TitanRank {
  id: number;
  name: string;
  minTp: number;
  minKs: number;
  gateDescription?: string;
}

// --- ANALYTICS & LOGGING ---
export interface ExerciseLog {
  id?: number | string;
  date: string; // ISO
  exerciseId: string;
  e1rm: number;
  rpe: number;
  isEpic?: boolean;
}

export interface MeditationLog {
  id?: number;
  date: string;
  durationMinutes: number;
  source: 'Headspace' | 'Calm' | 'Other';
}

export interface IntervalsWellness {
  id?: string;
  bodyBattery?: number;
  sleepScore?: number;
  hrv?: number;
  restingHR?: number;
  vo2max?: number;
  ctl?: number;
  atl?: number;
  tsb?: number;
  sleepSecs?: number;
  ramp_rate?: number;
}

// --- INTERVALS.ICU ---
export type { IntervalsActivity, IntervalsEvent } from '@/lib/intervals';

export interface AthleteSettings {
  id: string;
  name: string;
  timezone: string;
  resting_hr?: number;
  max_hr?: number;
  lthr?: number;
  ftp?: number;
  run_ftp?: number;
  heart_rate_zones?: { min: number; max: number; name?: string }[];
  power_zones?: unknown[];
}

export interface AppSettings {
  intervalsApiKey: string;
  intervalsAthleteId: string;
  hevyApiKey?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  valhallaId?: string;
  heroName?: string;
  hueBridgeIp?: string;
  hueUsername?: string;
  prioritizeHyperPro?: boolean;
}

export interface TitanAttributes {
  strength: number;
  endurance: number;
  technique: number;
  recovery: number;
  mental: number;
  hypertrophy: number;
}

export interface WeaknessAudit {
  detected: boolean;
  type: 'NONE' | 'AEROBIC_INTERFERENCE' | 'RECOVERY_DEBT';
  message: string;
  confidence: number;
  correlationData?: { metric: string; trend: 'UP' | 'DOWN' };
}

export interface TSBForecast {
  dayOffset: number;
  tsb: number;
  label: string;
}

export interface TTBIndices {
  strength: number | null;
  endurance: number | null;
  wellness: number | null;
  lowest: 'strength' | 'endurance' | 'wellness' | null;
}

export interface TitanLoadCalculation {
  standardTss: number;
  titanLoad: number;
  discrepancy: number;
  advice: string;
  appliedMultiplier?: number;
}

export interface OracleRecommendation {
  type: 'RECOVERY' | 'PR_ATTEMPT' | 'CARDIO_VALIDATION' | 'GRIND' | 'TAPER' | 'COMPETITION_PREP';
  title: string;
  rationale: string;
  priorityScore: number;
  generatedSession?: Session;
  sessionId?: string;
  targetExercise?: string;
  primaryFocus?: string;
  equipmentId?: string;
}

/**
 * Full weekly plan containing recommendations for each day
 */
export interface WeeklyPlan {
  id: string;
  weekStart: string; // ISO date (Monday)
  days: DayPlan[];
  createdAt: string;
}

export interface DayPlan {
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  date: string; // ISO date
  recommendation: OracleRecommendation;
  isRestDay: boolean;
}

/**
 * Context for generating a weekly plan
 */
export interface PlanContext {
  wellness: IntervalsWellness;
  ttb: TTBIndices;
  auditReport?: AuditReport | null;
  activePath: TrainingPath;
  weeklyMastery?: WeeklyMastery;
  inAppLogs?: InAppWorkoutLog[];
}

export interface InAppWorkoutLog {
  id: string;
  date: string;
  type: 'STRENGTH' | 'CARDIO';
  durationMin: number;
  setsCompleted?: number;
  tssEstimate?: number;
}

export interface ValhallaPayload {
  heroName: string;
  level: number;
  achievements: string[];
  skills: string[];
  historyCount: number;
  lastSync: string;
}

export interface ValhallaSyncResult {
  success: boolean;
  message: string;
  timestamp: string;
}

// --- BESTIARY ---
export type MonsterType = 'Giant' | 'Beast' | 'Undead' | 'Elemental' | 'Construct' | 'Dragon';
export type MonsterElement =
  | 'Physical'
  | 'Fire'
  | 'Ice'
  | 'Lightning'
  | 'Earth'
  | 'Shadow'
  | 'Holy';

export type BossTier = 'STORY' | 'HEROIC' | 'TITAN_SLAYER';

export interface Monster {
  id: string;
  name: string;
  type: MonsterType;
  element?: MonsterElement; // Optional for backward compatibility
  level: number;
  description: string;
  image: string; // URL or emoji/icon name
  hp: number;
  maxHp: number;
  weakness: SkillCategory[];
  associatedExerciseIds: string[];
  /** Speed in kph for chase mode (optional) */
  chaseSpeedKph?: number;
}

// --- WORLD MAP ---
export interface Zone {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  coordinates: { x: number; y: number }; // Percentage for placement on map
  icon: string;
  isDiscovered: boolean;
  region: 'Foundry' | 'Wilderness' | 'Ethereal';
}

// --- GRIMOIRE ---
export type GrimoireEntryType =
  | 'ACHIEVEMENT'
  | 'PR'
  | 'LEVEL_UP'
  | 'BOSS_DEFEAT'
  | 'METRIC_MILESTONE';

export interface GrimoireEntry {
  id: string;
  date: string;
  type: GrimoireEntryType;
  title: string;
  description: string;
  rarity: Rarity;
  metadata?: Record<string, unknown>;
}

// --- MONITORING ---
export interface SentryMonitorOptions {
  slug: string;
  schedule?: string;
  checkInMargin?: number;
  maxRuntime?: number;
}

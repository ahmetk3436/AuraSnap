import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_AURA_HISTORY_KEY = 'guest_aura_history_v1';
const GUEST_AURA_HISTORY_MAX = 30;
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface GuestAuraReading {
  id: string;
  aura_color: string;
  secondary_color?: string | null;
  energy_level: number;
  mood_score: number;
  personality: string;
  strengths: string[];
  challenges: string[];
  daily_advice: string;
  analyzed_at: string;
  created_at: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

function isWithinRetention(dateLike: string): boolean {
  const ts = new Date(dateLike).getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts <= RETENTION_MS;
}

function sortNewest<T extends { created_at: string }>(a: T, b: T): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function normalizeGuestAuraReading(raw: any): GuestAuraReading {
  const now = new Date().toISOString();
  const created = normalizeString(raw?.created_at, now);
  const analyzed = normalizeString(raw?.analyzed_at, created);
  const id =
    normalizeString(raw?.id) ||
    `guest-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    aura_color: normalizeString(raw?.aura_color, 'violet').toLowerCase(),
    secondary_color: raw?.secondary_color ? normalizeString(raw.secondary_color).toLowerCase() : null,
    energy_level: clamp(Number(raw?.energy_level) || 50, 1, 100),
    mood_score: clamp(Number(raw?.mood_score) || 5, 1, 10),
    personality: normalizeString(raw?.personality, 'Intuitive and expressive.'),
    strengths: normalizeArray(raw?.strengths),
    challenges: normalizeArray(raw?.challenges),
    daily_advice: normalizeString(raw?.daily_advice, ''),
    analyzed_at: analyzed,
    created_at: created,
  };
}

export async function loadGuestAuraHistory(): Promise<GuestAuraReading[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_AURA_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((item) => normalizeGuestAuraReading(item));
    const retained = normalized
      .filter((item) => isWithinRetention(item.created_at))
      .sort(sortNewest)
      .slice(0, GUEST_AURA_HISTORY_MAX);

    if (retained.length !== normalized.length) {
      await AsyncStorage.setItem(GUEST_AURA_HISTORY_KEY, JSON.stringify(retained));
    }

    return retained;
  } catch {
    return [];
  }
}

export async function saveGuestAuraReading(reading: GuestAuraReading): Promise<void> {
  const current = await loadGuestAuraHistory();
  const filtered = current.filter((r) => r.id !== reading.id);
  const next = [reading, ...filtered]
    .filter((item) => isWithinRetention(item.created_at))
    .sort(sortNewest)
    .slice(0, GUEST_AURA_HISTORY_MAX);
  await AsyncStorage.setItem(GUEST_AURA_HISTORY_KEY, JSON.stringify(next));
}

export async function saveGuestAuraReadings(readings: GuestAuraReading[]): Promise<void> {
  if (!Array.isArray(readings) || readings.length === 0) {
    return;
  }

  const normalized = readings.map((item) => normalizeGuestAuraReading(item));
  const seen = new Set<string>();
  const deduped: GuestAuraReading[] = [];

  for (const reading of normalized) {
    if (!isWithinRetention(reading.created_at)) continue;
    if (seen.has(reading.id)) continue;
    seen.add(reading.id);
    deduped.push(reading);
    if (deduped.length >= GUEST_AURA_HISTORY_MAX) break;
  }

  await AsyncStorage.setItem(GUEST_AURA_HISTORY_KEY, JSON.stringify(deduped));
}

export async function deleteGuestAuraReading(id: string): Promise<void> {
  const current = await loadGuestAuraHistory();
  const next = current.filter((item) => item.id !== id);
  await AsyncStorage.setItem(GUEST_AURA_HISTORY_KEY, JSON.stringify(next));
}

export async function getLatestGuestAuraReading(): Promise<GuestAuraReading | null> {
  const history = await loadGuestAuraHistory();
  return history.length > 0 ? history[0] : null;
}

export async function clearGuestAuraHistory(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_AURA_HISTORY_KEY);
}

export type AuraTone =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'white'
  | 'gold'
  | 'pink';

export interface AuraThemeEntry {
  key: AuraTone;
  display: string;
  emoji: string;
  primary: string;
  secondary: string;
  glow: string;
  text: string;
  chipBg: string;
}

const AURA_THEME: Record<AuraTone, AuraThemeEntry> = {
  red: {
    key: 'red',
    display: 'Red Aura',
    emoji: '🔥',
    primary: '#ef4444',
    secondary: '#f97316',
    glow: '#ef4444',
    text: '#fecaca',
    chipBg: '#7f1d1d',
  },
  orange: {
    key: 'orange',
    display: 'Orange Aura',
    emoji: '🌅',
    primary: '#f97316',
    secondary: '#f59e0b',
    glow: '#f97316',
    text: '#fed7aa',
    chipBg: '#7c2d12',
  },
  yellow: {
    key: 'yellow',
    display: 'Yellow Aura',
    emoji: '☀️',
    primary: '#f59e0b',
    secondary: '#eab308',
    glow: '#eab308',
    text: '#fef08a',
    chipBg: '#713f12',
  },
  green: {
    key: 'green',
    display: 'Green Aura',
    emoji: '🌿',
    primary: '#22c55e',
    secondary: '#14b8a6',
    glow: '#22c55e',
    text: '#bbf7d0',
    chipBg: '#14532d',
  },
  blue: {
    key: 'blue',
    display: 'Blue Aura',
    emoji: '🌊',
    primary: '#3b82f6',
    secondary: '#2563eb',
    glow: '#3b82f6',
    text: '#bfdbfe',
    chipBg: '#1e3a8a',
  },
  indigo: {
    key: 'indigo',
    display: 'Indigo Aura',
    emoji: '🌙',
    primary: '#6366f1',
    secondary: '#4f46e5',
    glow: '#6366f1',
    text: '#c7d2fe',
    chipBg: '#312e81',
  },
  violet: {
    key: 'violet',
    display: 'Violet Aura',
    emoji: '✨',
    primary: '#8b5cf6',
    secondary: '#ec4899',
    glow: '#8b5cf6',
    text: '#ddd6fe',
    chipBg: '#581c87',
  },
  white: {
    key: 'white',
    display: 'White Aura',
    emoji: '🤍',
    primary: '#94a3b8',
    secondary: '#e2e8f0',
    glow: '#cbd5e1',
    text: '#e2e8f0',
    chipBg: '#1f2937',
  },
  gold: {
    key: 'gold',
    display: 'Golden Aura',
    emoji: '👑',
    primary: '#f59e0b',
    secondary: '#facc15',
    glow: '#f59e0b',
    text: '#fef3c7',
    chipBg: '#78350f',
  },
  pink: {
    key: 'pink',
    display: 'Pink Aura',
    emoji: '💖',
    primary: '#ec4899',
    secondary: '#f472b6',
    glow: '#ec4899',
    text: '#fbcfe8',
    chipBg: '#831843',
  },
};

const ALIAS_MAP: Record<string, AuraTone> = {
  red: 'red',
  'fiery red': 'red',
  orange: 'orange',
  'sunset orange': 'orange',
  yellow: 'yellow',
  'golden yellow': 'yellow',
  green: 'green',
  'forest green': 'green',
  blue: 'blue',
  'ocean blue': 'blue',
  indigo: 'indigo',
  'royal indigo': 'indigo',
  violet: 'violet',
  purple: 'violet',
  'mystic purple': 'violet',
  white: 'white',
  'crystal white': 'white',
  gold: 'gold',
  golden: 'gold',
  pink: 'pink',
};

export function normalizeAuraTone(input: string): AuraTone {
  const normalized = input.trim().toLowerCase();
  return ALIAS_MAP[normalized] || 'violet';
}

export function getAuraTheme(input: string): AuraThemeEntry {
  return AURA_THEME[normalizeAuraTone(input)];
}

export function getAuraLabel(input: string): string {
  const tone = normalizeAuraTone(input);
  switch (tone) {
    case 'red':
      return 'Energetic';
    case 'orange':
      return 'Creative';
    case 'yellow':
      return 'Optimistic';
    case 'green':
      return 'Balanced';
    case 'blue':
      return 'Calm';
    case 'indigo':
      return 'Intuitive';
    case 'violet':
      return 'Spiritual';
    case 'white':
      return 'Pure';
    case 'gold':
      return 'Enlightened';
    case 'pink':
      return 'Loving';
    default:
      return 'Mystical';
  }
}

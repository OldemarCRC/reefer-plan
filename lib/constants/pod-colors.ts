// lib/constants/pod-colors.ts
// One fixed color per port UN/LOCODE.
// Ports not in this map get a deterministic color via hash (same port = same
// color always, even across plans and voyages).

export const POD_COLOR_MAP: Record<string, string> = {
  // Netherlands
  'NLVLI': '#f97316',  // Vlissingen
  'NLRTM': '#f59e0b',  // Rotterdam

  // United Kingdom
  'GBPME': '#3b82f6',  // Portsmouth
  'GBSOU': '#60a5fa',  // Southampton
  'GBFXT': '#93c5fd',  // Felixstowe
  'GBDVR': '#2563eb',  // Dover

  // Belgium
  'BEANR': '#eab308',  // Antwerp

  // Germany
  'DEHAM': '#6b7280',  // Hamburg
  'DEBHV': '#94a3b8',  // Bremerhaven

  // France
  'FRLEH': '#8b5cf6',  // Le Havre
  'FRRAD': '#7c3aed',  // Radicatel

  // United States
  'USLAX': '#ef4444',  // Los Angeles
  'USNYC': '#f87171',  // New York
  'USORF': '#fca5a5',  // Norfolk
  'USSAV': '#dc2626',  // Savannah
  'USWIL': '#b91c1c',  // Wilmington NC
  'USMIA': '#e11d48',  // Miami
  'USBAL': '#be123c',  // Baltimore

  // Spain
  'ESBCN': '#d97706',  // Barcelona
  'ESVLC': '#b45309',  // Valencia

  // Italy
  'ITGOA': '#10b981',  // Genova
  'ITLIV': '#059669',  // Livorno
};

const FALLBACK_COLORS = [
  '#06b6d4', '#ec4899', '#a78bfa', '#34d399',
  '#fb923c', '#f472b6', '#38bdf8', '#a3e635',
];

export function getPodColor(portCode: string): string {
  if (!portCode) return '#64748b';
  if (POD_COLOR_MAP[portCode]) return POD_COLOR_MAP[portCode];
  // Deterministic hash — unknown port always gets same color
  let hash = 0;
  for (let i = 0; i < portCode.length; i++) {
    hash = portCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

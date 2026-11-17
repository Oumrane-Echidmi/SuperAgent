const PALETTES = [
  ["#f472b6", "#c026d3", "#7c3aed"],
  ["#fb923c", "#ef4444", "#be123c"],
  ["#a3e635", "#22c55e", "#0f766e"],
  ["#38bdf8", "#2563eb", "#4338ca"],
  ["#fde68a", "#f59e0b", "#c2410c"],
  ["#c4b5fd", "#8b5cf6", "#4c1d95"],
  ["#5eead4", "#0d9488", "#155e75"],
  ["#fda4af", "#e11d48", "#881337"],
  ["#f5d0fe", "#d946ef", "#7e22ce"],
  ["#bef264", "#65a30d", "#3f6212"],
  ["#a5b4fc", "#6366f1", "#312e81"],
  ["#fed7aa", "#ea580c", "#7c2d12"],
];

function hash(value) {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) >>> 0;
  }
  return result;
}

export function initialsOf(name = "") {
  const clean = name.trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function avatarPalette(name = "", explicit) {
  if (explicit) return explicit;
  return PALETTES[hash(name) % PALETTES.length];
}

export function gradientFor(name, explicit) {
  const [a, b, c] = avatarPalette(name, explicit);
  return `linear-gradient(138deg, ${a} 0%, ${b} 52%, ${c} 100%)`;
}

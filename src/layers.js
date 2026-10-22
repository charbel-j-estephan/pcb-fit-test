// Work out what each uploaded file is.

export const ROLES = {
  outline: 'Board outline',
  topCopper: 'Top copper',
  bottomCopper: 'Bottom copper',
  topMask: 'Top solder mask',
  bottomMask: 'Bottom solder mask',
  topSilk: 'Top silkscreen',
  bottomSilk: 'Bottom silkscreen',
  drill: 'Drill',
  ignore: 'Not used',
};

const NAME_RULES = [
  // KiCad style names first (most specific)
  [/edge[._]cuts|[-_.]edge\b/, 'outline'],
  [/[-_.]f[._]cu\b|[-_.]f[._]cu\./, 'topCopper'],
  [/[-_.]b[._]cu\b|[-_.]b[._]cu\./, 'bottomCopper'],
  [/[-_.]f[._]mask/, 'topMask'],
  [/[-_.]b[._]mask/, 'bottomMask'],
  [/[-_.]f[._]silks?|[-_.]f[._]silkscreen/, 'topSilk'],
  [/[-_.]b[._]silks?|[-_.]b[._]silkscreen/, 'bottomSilk'],
  [/[-_.](f|b)[._](paste|fab|crtyd|courtyard|adhes)|[-_.]in\d+[._]cu|[-_.](dwgs|cmts|eco\d)[._]user|[-_.]margin|job\.gbrjob$/, 'ignore'],
  // Protel / Altium / EasyEDA / JLC extensions
  [/\.(gko|gm1|gml|gm|oln|out|bor|mil|gm2)$/, 'outline'],
  [/\.(gtl|cmp|top)$/, 'topCopper'],
  [/\.(gbl|sol|bot)$/, 'bottomCopper'],
  [/\.(gts|stc|smt)$/, 'topMask'],
  [/\.(gbs|sts|smb)$/, 'bottomMask'],
  [/\.(gto|plc|sst)$/, 'topSilk'],
  [/\.(gbo|pls|ssb)$/, 'bottomSilk'],
  [/\.(gtp|gbp|crc|crs|g\d+|gp\d|gd\d|gg\d|ipc|apr|rep|rpt|dri|gpi|pdf|png|jpg|csv|xml|json|html?|md|zip|pos|bom)$/, 'ignore'],
  [/\.(drl|xln|exc|drd|xnc|ncd|tap|nc)$/, 'drill'],
  // descriptive names (EasyEDA "Gerber_TopLayer.GTL" etc. are already covered above)
  [/outline|boardoutline|profile|edge/, 'outline'],
  [/top.?silk|silk.?top/, 'topSilk'],
  [/bottom.?silk|silk.?bot/, 'bottomSilk'],
  [/top.?(solder)?mask|mask.?top/, 'topMask'],
  [/bot(tom)?.?(solder)?mask|mask.?bot/, 'bottomMask'],
  [/top.?(layer|copper)|copper.?top/, 'topCopper'],
  [/bot(tom)?.?(layer|copper)|copper.?bot/, 'bottomCopper'],
  [/drill|pth|npth/, 'drill'],
];

function fromX2(text) {
  const m = /%TF\.FileFunction,([^*]*)\*%/.exec(text.slice(0, 4000));
  if (!m) return null;
  const f = m[1].toLowerCase().split(',');
  switch (f[0]) {
    case 'profile': return 'outline';
    case 'copper': return f.includes('top') ? 'topCopper' : f.includes('bot') ? 'bottomCopper' : 'ignore';
    case 'soldermask': return f.includes('top') ? 'topMask' : 'bottomMask';
    case 'legend': return f.includes('top') ? 'topSilk' : 'bottomSilk';
    case 'plated': case 'nonplated': return 'drill';
    default: return 'ignore';
  }
}

export function looksLikeDrill(text) {
  const head = text.slice(0, 2000);
  return /^\s*(%\s*)?M48/m.test(head) || (/^(METRIC|INCH)/m.test(head) && /^T\d+C[\d.]+/m.test(head));
}

export function looksLikeGerber(text) {
  const head = text.slice(0, 4000);
  return /%FS[LT]?[AI]?.*X\d\dY\d\d/.test(head) || /%ADD\d+/.test(head) || /\bD0?[123]\*/.test(head);
}

/** Guess a file's role from its content and name. */
export function identify(name, text) {
  const base = name.split(/[\\/]/).pop().toLowerCase();
  const x2 = fromX2(text);
  if (x2) return x2;
  if (looksLikeDrill(text)) return 'drill';
  if (!looksLikeGerber(text)) return 'ignore';
  for (const [re, role] of NAME_RULES) {
    if (re.test(base)) return role === 'drill' ? 'ignore' : role;
  }
  return 'ignore';
}

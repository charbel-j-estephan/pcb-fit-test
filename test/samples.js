// Synthetic 50 x 30 mm KiCad-style board for the tests. It exercises the tricky
// parts of the formats: macros, regions, clear polarity, arcs, cutouts, slots.

const header = (fn) => `%TF.GenerationSoftware,KiCad,Pcbnew,8.0*%
%TF.FileFunction,${fn}*%
%FSLAX46Y46*%
G04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*
%MOMM*%
%LPD*%
G01*
`;
const n = (v) => Math.round(v * 1e6).toString();
const xy = (x, y) => `X${n(x)}Y${n(y)}`;

const ROUNDRECT = `%AMRoundRect*
0 Rectangle with rounded corners*
0 $1 Rounding radius*
0 $2 $3 $4 $5 $6 $7 $8 $9 X,Y pos of 4 corners*
4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*
1,1,$1+$1,$2,$3*
1,1,$1+$1,$4,$5*
1,1,$1+$1,$6,$7*
1,1,$1+$1,$8,$9*
20,1,$1+$1,$2,$3,$4,$5,0*
20,1,$1+$1,$4,$5,$6,$7,0*
20,1,$1+$1,$6,$7,$8,$9,0*
20,1,$1+$1,$8,$9,$2,$3,0*%
`;

export const edgeCuts = header('Profile,NP') + `%ADD10C,0.100000*%
D10*
${xy(0, 0)}D02*
${xy(50, 0)}D01*
${xy(50, 27)}D01*
G75*
G03*
${xy(47, 30)}I${n(-3)}J0D01*
G01*
${xy(0, 30)}D01*
${xy(0, 0)}D01*
${xy(40, 20)}D02*
${xy(45, 20)}D01*
${xy(45, 25)}D01*
${xy(40, 25)}D01*
${xy(40, 20)}D01*
M02*
`;

export const topCopper = header('Copper,L1,Top') + ROUNDRECT + `%ADD10RoundRect,0.250000X-0.750000X-0.500000X0.750000X-0.500000X0.750000X0.500000X-0.750000X0.500000X0*%
%ADD11C,1.700000*%
%ADD12R,1.700000X1.700000*%
%ADD13C,0.250000*%
%ADD14C,0.600000*%
D12*
${xy(10, 10)}D03*
D11*
${xy(12.54, 10)}D03*
${xy(15.08, 10)}D03*
D10*
${xy(30, 12)}D03*
${xy(30, 15)}D03*
D14*
${xy(25, 15)}D03*
D13*
${xy(12.54, 10)}D02*
${xy(25, 15)}D01*
${xy(30, 15)}D01*
G75*
G02*
${xy(30, 12)}I0J${n(-1.5)}D01*
G01*
G36*
${xy(5, 18)}D02*
${xy(35, 18)}D01*
${xy(35, 27)}D01*
${xy(5, 27)}D01*
${xy(5, 18)}D01*
G37*
%LPC*%
D11*
${xy(20, 22)}D03*
%LPD*%
M02*
`;

export const topMask = header('Soldermask,Top') + ROUNDRECT + `%ADD10RoundRect,0.250000X-0.800000X-0.550000X0.800000X-0.550000X0.800000X0.550000X-0.800000X0.550000X0*%
%ADD11C,1.800000*%
%ADD12R,1.800000X1.800000*%
D12*
${xy(10, 10)}D03*
D11*
${xy(12.54, 10)}D03*
${xy(15.08, 10)}D03*
D10*
${xy(30, 12)}D03*
${xy(30, 15)}D03*
M02*
`;

export const topSilk = header('Legend,Top') + `%ADD10C,0.150000*%
D10*
${xy(8.5, 8.5)}D02*
${xy(16.5, 8.5)}D01*
${xy(16.5, 11.5)}D01*
${xy(8.5, 11.5)}D01*
${xy(8.5, 8.5)}D01*
M02*
`;

export const bottomCopper = header('Copper,L2,Bot') + `%ADD10C,0.500000*%
%ADD11C,1.700000*%
D11*
${xy(10, 10)}D03*
D10*
${xy(10, 10)}D02*
${xy(10, 16)}D01*
M02*
`;

export const pth = `M48
; DRILL file {KiCad 8.0} date 2026-10-22
; FORMAT={-:-/ absolute / metric / decimal}
; #@! TF.FileFunction,Plated,1,2,PTH
FMAT,2
METRIC
T1C0.300
T2C1.000
%
G90
G05
T1
X25.0Y15.0
T2
X10.0Y10.0
X12.54Y10.0
X15.08Y10.0
M30
`;

export const npth = `M48
; DRILL file {KiCad 8.0} date 2026-10-22
; FORMAT={-:-/ absolute / metric / decimal}
; #@! TF.FileFunction,NonPlated,1,2,NPTH
FMAT,2
METRIC
T1C3.200
T2C1.200
%
G90
G05
T1
X4.0Y4.0
X46.0Y4.0
T2
G00X30.0Y5.0
M15
G01X34.0Y5.0
M16
G05
M30
`;

export const files = [
  { name: 'demo-Edge_Cuts.gbr', text: edgeCuts },
  { name: 'demo-F_Cu.gbr', text: topCopper },
  { name: 'demo-F_Mask.gbr', text: topMask },
  { name: 'demo-F_Silkscreen.gbr', text: topSilk },
  { name: 'demo-B_Cu.gbr', text: bottomCopper },
  { name: 'demo-PTH.drl', text: pth },
  { name: 'demo-NPTH.drl', text: npth },
];

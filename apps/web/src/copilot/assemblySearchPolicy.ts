// Shared finite domain. These are search choices, never successful-coordinate hints.
export const SEARCH_LATTICE=[0,1,2].flatMap(axis=>[-12,-6,6,12].map(n=>[0,1,2].map(i=>i===axis?n:0)));
export const SEARCH_PART_IDS=['stand-base','stand-shaft','stand-turntable','stand-support','stand-plate','stand-lip'];
export const axisCoverage=(offsets:number[][])=>[0,1,2].map(axis=>offsets.some(o=>Math.abs(o[axis])>1e-7));

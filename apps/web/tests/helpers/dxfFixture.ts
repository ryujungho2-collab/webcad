/** Independent DXF group-code fixture: a 2-unit semicircle and its closing chord. */
export function curvedDxfFixture(units=4,extra="") {
 return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nProfile\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n${extra}0\nENDSEC\n0\nEOF\n`;
}

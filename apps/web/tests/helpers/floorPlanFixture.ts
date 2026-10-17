/** Centimetre source with a 4 m wall, window component and disposable annotations. */
export const floorPlanDxf = [
  0,"SECTION",2,"HEADER",9,"$INSUNITS",70,5,0,"ENDSEC",
  0,"SECTION",2,"TABLES",0,"LAYER",2,"Unused",0,"ENDSEC",
  0,"SECTION",2,"BLOCKS",
  0,"BLOCK",2,"Window",10,10,20,0,30,0,
  0,"LINE",8,"Window-detail",10,10,20,0,11,110,21,0,
  0,"TEXT",8,"Window-label",1,"W1",40,2,10,10,20,0,0,"ENDBLK",
  0,"BLOCK",2,"UnusedFurniture",0,"LINE",8,"Furniture",10,0,20,0,11,10,21,0,0,"ENDBLK",
  0,"ENDSEC",0,"SECTION",2,"ENTITIES",
  0,"LINE",8,"A-WALL",10,1000,20,2000,11,1400,21,2000,
  0,"INSERT",8,"A-WINDOW",2,"Window",10,1100,20,2000,
  0,"LINE",8,"Furniture",10,1000,20,2020,11,1010,21,2020,
  0,"TEXT",8,"Notes",1,"Assignment",40,2,10,1000,20,2010,
  0,"ENDSEC",0,"EOF",
].join("\n")+"\n";

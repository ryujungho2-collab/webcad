import { identityCoordinates, type ExchangeFixture } from "@agent-webcad/cad-document";
export const exchangeFixture = (): ExchangeFixture => ({
  schema:"webcad.exchange.fixture",version:1,adapter:"webcad-fixture",documentId:"source-survey",
  coordinates:{...identityCoordinates(),unit:"inch",origin:[100,200,3],axes:[[0,1,0],[-1,0,0],[0,0,1]]},
  entities:[{kind:"line",sourceId:"line-A",name:"Survey line",points:[[0,0,0],[2,0,0]]},
    {kind:"rectangle",sourceId:"rectangle-B",name:"Survey plate",points:[[0,0,0],[2,0,0],[2,1,0],[0,1,0]]}],assets:[],losses:[]
});

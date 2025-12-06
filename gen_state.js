// generator_state.js


// ===== Állapot és util =====
const store = {
  gamePrimitives: {},
  groups: {},
  scene: [],
};
window.store = store;   // 




/** @typedef {{ id:string, type:'box'|'cylinder'|'sphere'|'cone'|'quarterTorus'|'arcCyl', color:string, scale:[number,number,number], pos:[number,number,number], rotRYP:[number,number,number], hidden?:boolean, arc?:{inner:number, outer:number, angle:number} }} Part */
/** @typedef {{ name:string, parts: Part[] }} GP */
/** @typedef {{ refType:'gp'|'grp', refName:string, pos:[number,number,number], rotRYP:[number,number,number], scale:[number,number,number], hidden?:boolean }} Ref */
/** @typedef {{ pos:[number,number,number], rotRYP:[number,number,number], style:number, lineStyle:number, iw:number, ow:number }} CP */
/** @typedef {{ name:string, radius:number, style:number, cpRef?:{refType:'gp'|'grp', refName:string}|null, lineRef?:{refType:'gp'|'grp', refName:string}|null, startOffset:number, dL:number, showAux:boolean, showRadius:boolean, hidden?:boolean, points:CP[] }} ControlLine */

// ===== Selection (többes) =====
export const gpSelSet  = new Set();
export const grpSelSet = new Set();
export const scnSelSet = new Set();
export const clSelSet  = new Set(); // ControlLine indexek
export const cpSelSet  = new Set(); // 'lineIdx:pointIdx' kulcsok (string)
export let currentCLIndex = -1;       // melyik ControlLine az aktív


export function setCurrentCLIndex(aaa){currentCLIndex = aaa;}

// ===== common clipboard (global)=====
window.appClipboard = window.appClipboard || { mode: null, items: [] };

const $ = (s) => document.querySelector(s);
const ui = 
{
  mode: $("#mode"),
  minorColor: $("#minorColor"),
  majorColor: $("#majorColor"),
  BGColor: $("#BGColor"),
  gridSize: $("#gridSize"),
  groupBoundsVis: $("#groupBoundsVis"),
  gameVersion: $("#gameVersion"),
  trackName: $("#trackName"),
  trackUUID: $("#trackUUID"),
  genUUID: $("#btnGenUUID"),
  // szerkesztés
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  copyBtn: $("#copyBtn"),
  pasteBtn: $("#pasteBtn"),
  dupBtn: $("#dupBtn"),
  toggleVisBtn: $("#toggleVisBtn"),
  deleteBtn: $("#deleteBtn"),
  // gp
  gpPane: $("#gpPane"),
  gpName: $("#gpName"),
  gpNew: $("#gpNew"),
  gpSave: $("#gpSave"),
  gpDelete: $("#gpDelete"),
  gpList: $("#gpList"),
  partType: $("#partType"),
  addPart: $("#addPart"),
  removePart: $("#removePart"),
  partList: $("#partList"),
  pColor: $("#pColor"),
  pTypeRO: $("#pTypeRO"),
  pRotAxis: $("#pRotAxis"),
  pPosX: $("#pPosX"),
  pPosY: $("#pPosY"),
  pPosZ: $("#pPosZ"),
  pRoll: $("#pRoll"),
  pYaw: $("#pYaw"),
  pPitch: $("#pPitch"),
  pSx: $("#pSx"),
  pSy: $("#pSy"),
  pSz: $("#pSz"),
  applyPart: $("#applyPart"),
  // gp arc
  pInnerR: $("#pInnerR"),
  pOuterR: $("#pOuterR"),
  pAngle: $("#pAngle"),
  // grp
  grpPane: $("#grpPane"),
  grpName: $("#grpName"),
  grpNew: $("#grpNew"),
  grpSave: $("#grpSave"),
  grpDelete: $("#grpDelete"),
  grpList: $("#grpList"),
  grpAddType: $("#grpAddType"),
  grpAddSource: $("#grpAddSource"),

  grpAdd: $("#grpAdd"),
  grpRemove: $("#grpRemove"),
  grpItemList: $("#grpItemList"),
  gRotAxis: $("#gRotAxis"),
  gPosX: $("#gPosX"),
  gPosY: $("#gPosY"),
  gPosZ: $("#gPosZ"),
  gRoll: $("#gRoll"),
  gYaw: $("#gYaw"),
  gPitch: $("#gPitch"),
  gSx: $("#gSx"),
  gSy: $("#gSy"),
  gSz: $("#gSz"),
  applyGrpItem: $("#applyGrpItem"),
  // scn
  scnPane: $("#scnPane"),
  scnAddType: $("#scnAddType"),
  scnAddSource: $("#scnAddSource"),
    scnAddSourceTree: $("#scnAddSourceTree"),
  scnAdd: $("#scnAdd"),
  scnRemove: $("#scnRemove"),
  scnList: $("#scnList"),
  sRotAxis: $("#sRotAxis"),
  sPosX: $("#sPosX"),
  sPosY: $("#sPosY"),
  sPosZ: $("#sPosZ"),
  sRoll: $("#sRoll"),
  sYaw: $("#sYaw"),
  sPitch: $("#sPitch"),
  sSx: $("#sSx"),
  sSy: $("#sSy"),
  sSz: $("#sSz"),
  applySceneItem: $("#applySceneItem"),
  // io
  exportXML: $("#exportXML"),
  saveJSON: $("#saveJSON"),
  loadJSON: $("#loadJSON"),
  saveSceneJSON: $("#saveSceneJSON"),
  loadSceneJSON: $("#loadSceneJSON"),
  exportGameXML: $("#exportGameXML"),
  importGameXML: $("#importGameXML"),
  // diag
  runTests: $("#runTests"),
  diagOut: $("#diagOut"),

  // === Control Lines pane ===
  clPane: $("#clPane"),
  clList: $("#clList"),
  clNew: $("#clNew"),
  clSave: $("#clSave"),
  clDelete: $("#clDelete"),
  clName: $("#clName"),
  clRadius: $("#clRadius"),
  clStyle: $("#clStyle"),
  clStartOffset: $("#clStartOffset"),
  clDL: $("#clDL"),
  clCPRefType: $("#clCPRefType"),
  clCPRefName: $("#clCPRefName"),
  clLineRefType: $("#clLineRefType"),
  clLineRefName: $("#clLineRefName"),
  clShowAux: $("#clShowAux"),
  clShowRadius: $("#clShowRadius"),

  clCPRefAdd:    $("#clCPRefAdd"),
  clCPRefList:   $("#clCPRefList"),

  clLineRefAdd:  $("#clLineRefAdd"),
  clLineRefList: $("#clLineRefList"),

  // === Control Points ===
  cpList: $("#cpList"),
  cpAdd: $("#cpAdd"),
  cpRemove: $("#cpRemove"),
  cpStyle: $("#cpStyle"),
  cpLineStyle: $("#cpLineStyle"),
  cpIW: $("#cpIW"),
  cpOW: $("#cpOW"),
  cpApply: $("#cpApply"),

  clGenerate: $('#clGenerate'),
  // ...
  eulerOrder: $('#eulerOrder'),
  gameR: $('#gameR'),
  gameY: $('#gameY'),
  gameP: $('#gameP'),

    // Supports (alátámasztások)
  clSupportMajorRefType: $("#clSupportMajorRefType"),
  clSupportMajorRefName: $("#clSupportMajorRefName"),
  clSupportMinorRefType: $("#clSupportMinorRefType"),
  clSupportMinorRefName: $("#clSupportMinorRefName"),
  clSupportMajorH: $("#clSupportMajorH"),
  clSupportMinorH: $("#clSupportMinorH"),
  clSupportDecimate: $("#clSupportDecimate"),
  clSupportDecimateOffset: $("#clSupportDecimateOffset"),
  clSupportTopOffset: $("#clSupportTopOffset"),
  clSupportBottomOffset: $("#clSupportBottomOffset"),
  clSupportRotate: $("#clSupportRotate"),

  clSupportMajorRefAdd:   $("#clSupportMajorRefAdd"),
  clSupportMajorRefList:  $("#clSupportMajorRefList"),

  clSupportMinorRefAdd:   $("#clSupportMinorRefAdd"),
  clSupportMinorRefList:  $("#clSupportMinorRefList"),

  //drawingmode 
  clDrawMode : $("#clDrawMode"),
  //
  //gpScalable : $("#gpScalable"),
  gpXsiType: $("#gpXsiType"),
  trackEnvironment : $("#trackEnvironment"),
  //

  scnFilter : $("#scnFilter"),
  grpFilter : $("#grpFilter"),

  //snap and local
  snapEnable: $("#snapEnable"),
  localMove:  $("#localMove"),
  snapX:      $("#snapX"),
  snapY:      $("#snapY"),
  snapZ:      $("#snapZ"),

  saveJSONGRP: $("#saveJSONGRP"),
  breakGRP: $("#breakGRP"),
  makeGRP: $("#makeGRP"),

    // GP meta
  gpMainGroup: $("#gpMainGroup"),
  gpSubGroup:  $("#gpSubGroup"),
  gpType:      $("#gpType"),
  gpBtnColor:  $("#gpBtnColor"),
  gpBtnNr:     $("#gpBtnNr"),

  // Group meta
  grpMainGroup: $("#grpMainGroup"),
  grpSubGroup:  $("#grpSubGroup"),
  grpType:      $("#grpType"),
  grpBtnColor:  $("#grpBtnColor"),
  grpBtnNr:     $("#grpBtnNr"),

  gpVariantIconBar: $("#gpVariantIconBar"),

};
window.ui = ui;        // ez is globális




//-------------------------------------




export function onSelectionChanged() 
{

  try { rebuildAllBounds?.(); } catch {}
  try { refreshGPList?.();       } catch {}
  try { refreshGrpList?.();      } catch {}
  try { refreshScnList?.();      } catch {}
  try { refreshCPList?.();       } catch {}
  try { fillPartEditors?.();     } catch {}
}

export function clearAllSelections() 
{
  gpSelSet.clear();
  grpSelSet.clear();
  scnSelSet.clear();
  cpSelSet.clear();
  onSelectionChanged();
}

export function setSelection(kind, indices, additive = false) {
  const S =
    kind === 'gp'  ? gpSelSet  :
    kind === 'grp' ? grpSelSet :
    kind === 'scn' ? scnSelSet :
    kind === 'cp'  ? cpSelSet  : null;

  if (!S) return;

  if (!additive) S.clear();
  if (Array.isArray(indices)) 
  {
    indices.forEach(i => S.add(i));
  } 
  else if (Number.isFinite(indices)) 
  {
    S.add(indices|0);
  }
  onSelectionChanged();
}

export function toggleSelection(kind, index) 
{
  const S =
    kind === 'gp'  ? gpSelSet  :
    kind === 'grp' ? grpSelSet :
    kind === 'scn' ? scnSelSet :
    kind === 'cp'  ? cpSelSet  : null;

  if (!S) return;
  if (S.has(index)) S.delete(index);
  else S.add(index);
  onSelectionChanged();
}

export function getPrimaryIndex(kind) {
  const S =
    kind === 'gp'  ? gpSelSet  :
    kind === 'grp' ? grpSelSet :
    kind === 'scn' ? scnSelSet :
    kind === 'cp'  ? cpSelSet  : null;

  if (!S || S.size === 0) return -1;
  // “első kijelölt” – determinisztikusan a legkisebb indexet vesszük
  return Math.min(...S);
}








//----------------------------------------





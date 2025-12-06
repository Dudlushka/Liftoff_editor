// generator_controlLines.js
import "./gen_state.js";

// Állapot és UI innen:
const store = window.store;
const ui = window.ui;

import {
  cpSelSet, currentCLIndex, setCurrentCLIndex,
  onSelectionChanged, setSelection, toggleSelection, getPrimaryIndex
} from './gen_state.js';


import{
  rebuildAllBounds,
  fillScnEditors
} from './gen_3d.js'


let currentCL;

import { clRoot } from "./gen_roots.js";
import {snapshot}from './gen_undo.js';


export function selectCP(pointIdx, additive=false) {
  setSelection('cp', pointIdx, additive);
}

export function toggleCP(pointIdx) {
  toggleSelection('cp', pointIdx);
}



const deg = (v) => (v * Math.PI) / 180;

//mindegy melyiket csak az elsőt
function firstSelIndex(set)
{
  for (const i of set) return i;
  return -1;
}

function firstFrom(set)
{
  for (const i of set) return i;
  return -1;
}


//------------------------------

// Globális debug flags
const DBG = {
  cpFrames: true,     // CP-k lokális tengelyei (X=+zöld, -X=piros, Y=fekete, +Z=kék)
  hermiteHandles: true, // P0->P0+T0 és P1->P1+T1 nyilak
  samples: true,      // mintapontok és érintők
  text: true          // kis feliratok a CP-knél és a szegmenseknél
};

function dbgRay(origin, dir, len, color, radius=0.01) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, Math.max(1e-6, len), 8),
    new THREE.MeshStandardMaterial({ color })
  );
  // Cylinder +Y irányban áll; igazítsuk a dir-re:
  const up = new THREE.Vector3(0,1,0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  shaft.quaternion.copy(q);
  shaft.position.y = len/2;
  g.add(shaft);
  g.position.copy(origin);
  return g;
}

function dbgAxesAt(pos, quat, scale=0.35) {
  const g = new THREE.Group();
  const X = new THREE.Vector3(1,0,0).applyQuaternion(quat);
  const Y = new THREE.Vector3(0,1,0).applyQuaternion(quat);
  const Z = new THREE.Vector3(0,0,1).applyQuaternion(quat);

  g.add(dbgRay(pos,  X, +scale, 0x00aa00)); // +X zöld (nálad ez a "kijárat")
  g.add(dbgRay(pos,  X.clone().multiplyScalar(-1), +scale*0.8, 0xaa0000)); // -X piros (belépés)
  g.add(dbgRay(pos,  Y, +scale*0.6, 0x111111)); // +Y fekete
  g.add(dbgRay(pos,  Z, +scale*0.6, 0x0044ff)); // +Z kék
  return g;
}

// apró feliratok a 3D-ben
const dbgLabelCanvas = document.createElement('canvas');
const dbgCtx = dbgLabelCanvas.getContext('2d');
function dbgLabel(text, color='#333') {
  const pad = 4;
  dbgCtx.font = '12px monospace';
  const w = Math.ceil(dbgCtx.measureText(text).width) + pad*2;
  const h = 16 + pad*2;
  dbgLabelCanvas.width = w; dbgLabelCanvas.height = h;
  dbgCtx.fillStyle = 'rgba(255,255,255,0.9)'; dbgCtx.fillRect(0,0,w,h);
  dbgCtx.strokeStyle = '#999'; dbgCtx.strokeRect(0,0,w,h);
  dbgCtx.fillStyle = color; dbgCtx.font = '12px monospace';
  dbgCtx.fillText(text, pad, 12+pad);
  const tex = new THREE.CanvasTexture(dbgLabelCanvas);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(w*0.003, h*0.003, 1);
  return spr;
}



///---------------------------------------
// Listás mocskok
//---------------------------------------

//Refresh options for the 4 innput list:
function refreshCLSourceOptions() 
{
  const gpsAll  = Object.keys(store?.gamePrimitives || {});
  const grpsAll = Object.keys(store?.groups || {});

  // Szűrő szöveg a Scene-filter mezőből
  const filter = (ui.scnFilter?.value || '').trim().toLowerCase();

  // Ha van filter, csak azokat a neveket tartjuk meg, amelyek tartalmazzák
  const gps  = filter ? gpsAll.filter(n  => n.toLowerCase().includes(filter)) : gpsAll;
  const grps = filter ? grpsAll.filter(n => n.toLowerCase().includes(filter)) : grpsAll;

  function fillNameSelect(sel, type) 
  {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';

    // első opció: null
    const add = (val, text) =>
    {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = text;
      sel.appendChild(o);
    };
    add('null', 'null');

    if (type === 'gp')
    {
      gps.forEach(n => add(n, n));
    }
    if (type === 'grp')
    {
      grps.forEach(n => add(n, n));
    }

    // próbáld visszaállítani a korábbi értéket, ha létezik
    if (prev && Array.from(sel.options).some(o => o.value === prev)) 
    {
      sel.value = prev;
    }
    else 
    {
      sel.value = 'null';
    }
  }

  fillNameSelect(ui.clCPRefName,            ui.clCPRefType?.value || 'null');
  fillNameSelect(ui.clLineRefName,          ui.clLineRefType?.value || 'null');
  fillNameSelect(ui.clSupportMajorRefName,  ui.clSupportMajorRefType?.value || 'null');
  fillNameSelect(ui.clSupportMinorRefName,  ui.clSupportMinorRefType?.value || 'null');
}

// típusváltásra újratöltjük a neveket
ui.clCPRefType?.addEventListener('change', refreshCLSourceOptions);
ui.clLineRefType?.addEventListener('change', refreshCLSourceOptions);
ui.clSupportMajorRefType?.addEventListener('change', refreshCLSourceOptions);
ui.clSupportMinorRefType?.addEventListener('change', refreshCLSourceOptions);

ui.scnFilter.addEventListener("input", refreshCLSourceOptions); //2nd call after the (gen_3d.js)

//---------------------------------------------------------------

function refreshCLList()
{
  ui.clList.innerHTML = "";
  store.controlLines.forEach((cl, i) =>
  {
    const li = document.createElement("li");
    li.textContent = cl.name || `CL_${i + 1}`;
    if (i === currentCLIndex) li.classList.add("sel");
    li.onclick = (ev) =>
    {
      if (ev.ctrlKey) return; // (később jöhet többes kijelölés)
      loadCL(i);
    };
    ui.clList.appendChild(li);
  });
}

//---------------------------------------------------------

function loadCL(index)
{
  if (!Array.isArray(store.controlLines)) store.controlLines = [];
  if (index < 0 || index >= store.controlLines.length) return;

  setCurrentCLIndex(index);
  currentCL = store.controlLines[currentCLIndex];

  ui.clName.value        = currentCL.name || "";
  ui.clRadius.value      = currentCL.radius ?? 0.8;
  ui.clStyle.value       = currentCL.style ?? 0;
  ui.clStartOffset.value = currentCL.startOffset ?? 0;
  ui.clDL.value          = currentCL.dL ?? 1.0;
  ui.clShowAux.checked   = !!currentCL.showAux;
  ui.clShowRadius.checked= !!currentCL.showRadius;

  // Listák biztosítása
  currentCL.lineRefs         = Array.isArray(currentCL.lineRefs)         ? currentCL.lineRefs         : [];
  currentCL.cpRefs           = Array.isArray(currentCL.cpRefs)           ? currentCL.cpRefs           : [];
  currentCL.supportMajorRefs = Array.isArray(currentCL.supportMajorRefs) ? currentCL.supportMajorRefs : [];
  currentCL.supportMinorRefs = Array.isArray(currentCL.supportMinorRefs) ? currentCL.supportMinorRefs : [];

  // "első" elem kiválasztása a listából, vagy ha nincs, akkor a legacy single ref
  const firstLine =  currentCL.lineRefs[0]         || currentCL.lineRef         || null;
  const firstCP   =  currentCL.cpRefs[0]           || currentCL.cpRef           || null;
  const firstMaj  =  currentCL.supportMajorRefs[0] || currentCL.supportMajorRef || null;
  const firstMin  =  currentCL.supportMinorRefs[0] || currentCL.supportMinorRef || null;

  // Type selectek
  if (ui.clCPRefType)          ui.clCPRefType.value          = firstCP?.refType  || "null";
  if (ui.clLineRefType)        ui.clLineRefType.value        = firstLine?.refType|| "null";
  if (ui.clSupportMajorRefType)ui.clSupportMajorRefType.value= firstMaj?.refType || "null";
  if (ui.clSupportMinorRefType)ui.clSupportMinorRefType.value= firstMin?.refType || "null";

  // Name selectek újratöltése a type alapján
  refreshCLSourceOptions();

  // Name selectek értéke
  console.log("hakkuh");

 // if (ui.clCPRefName)          ui.clCPRefName.value          = firstCP?.refName  || "null";
 // if (ui.clLineRefName)        ui.clLineRefName.value        = firstLine?.refName|| "null";
 ///if (ui.clSupportMajorRefName)ui.clSupportMajorRefName.value= firstMaj?.refName || "null";
 // if (ui.clSupportMinorRefName)ui.clSupportMinorRefName.value= firstMin?.refName || "null";

  // Support numerikus mezők
  if (ui.clSupportMajorH)
  {
    ui.clSupportMajorH.value         = currentCL.supportMajorH ?? 3.0;
    ui.clSupportMinorH.value         = currentCL.supportMinorH ?? 1.0;
    ui.clSupportDecimate.value       = currentCL.supportDecimate ?? 1;
    ui.clSupportDecimateOffset.value = currentCL.supportDecimateOffset ?? 0;
    ui.clSupportTopOffset.value      = currentCL.supportTopOffset ?? 0;
    ui.clSupportBottomOffset.value   = currentCL.supportBottomOffset ?? 0;
    ui.clSupportRotate.checked       = !!currentCL.supportRotate;
  }

  // Listák kirajzolása
  renderCurrentCLRefLists();

  refreshCPList?.();
  refreshCLList?.();
  drawControlLines?.();
}


window.loadCL = loadCL;


//----------------------------------------------------------------------------------------------------

ui.clNew?.addEventListener("click", () =>
{
  const name =
    ui.clName?.value?.trim() || `CL_${store.controlLines.length + 1}`;

  const fresh = {
    name,
    radius: Number(ui.clRadius?.value) || 0.8,
    style: Number(ui.clStyle?.value) || 0,

    // legacy single ref-ek (visszafelé kompatibilitás miatt maradhatnak)
    cpRef: null,
    lineRef: null,
    supportMajorRef: null,
    supportMinorRef: null,

    // ÚJ: listás referenciák (4 típus)
    lineRefs: [],
    cpRefs: [],
    supportMajorRefs: [],
    supportMinorRefs: [],

    startOffset: Number(ui.clStartOffset?.value) || 0,
    dL: Number(ui.clDL?.value) || 1.0,
    showAux: !!ui.clShowAux?.checked,
    showRadius: !!ui.clShowRadius?.checked,

    // Support numerikus mezők alapértékei (opcionális, de praktikus)
    supportMajorH: 3.0,
    supportMinorH: 1.0,
    supportDecimate: 1,
    supportDecimateOffset: 0,
    supportTopOffset: 0,
    supportBottomOffset: 0,
    supportRotate: false,

    points: [],
  };

  if (!Array.isArray(store.controlLines)) store.controlLines = [];
  store.controlLines.push(fresh);
  loadCL(store.controlLines.length - 1); // kijelöljük és UI-t feltöltjük
  snapshot?.();
});




function saveCLFromUI()
{
  if (!Array.isArray(store.controlLines)) store.controlLines = [];
  if (typeof currentCLIndex !== 'number' ||
      currentCLIndex < 0 || currentCLIndex >= store.controlLines.length) return;

  const cl = store.controlLines[currentCLIndex];

  // --- ide jön a korábbi mentésed teljes törzse ---
  // pl.:
  cl.name         = ui.clName.value.trim() || cl.name || `CL_${currentCLIndex + 1}`;
  cl.radius       = Number(ui.clRadius.value) || 0.8;
  cl.style        = Number(ui.clStyle.value) || 0;
  cl.startOffset  = Number(ui.clStartOffset.value) || 0;
  cl.dL           = Number(ui.clDL.value) || 1.0;
  cl.showAux      = !!ui.clShowAux.checked;
  cl.showRadius   = !!ui.clShowRadius.checked;

  // refs (null támogatással, ha nálad már makeRef / stb. van, azt használd)
  const makeRef = (typeSel, nameSel) => {
    const t = typeSel?.value ?? 'null';
    const n = nameSel?.value ?? 'null';
    return (t === 'null' || n === 'null') ? null : { refType:t, refName:n };
  };

  cl.cpRef        = makeRef(ui.clCPRefType,   ui.clCPRefName);
  cl.lineRef      = makeRef(ui.clLineRefType, ui.clLineRefName);

  // Supports (ha vannak ezek a kontrollok)
  if (ui.clSupportMajorRefType) {
    cl.supportMajorRef        = makeRef(ui.clSupportMajorRefType, ui.clSupportMajorRefName);
    cl.supportMinorRef        = makeRef(ui.clSupportMinorRefType, ui.clSupportMinorRefName);
    cl.supportMajorH          = Number(ui.clSupportMajorH.value) || 0;
    cl.supportMinorH          = Number(ui.clSupportMinorH.value) || 0;
    cl.supportDecimate        = Math.max(1, Number(ui.clSupportDecimate.value) || 1);
    cl.supportDecimateOffset  = Number(ui.clSupportDecimateOffset.value) || 0;
    cl.supportTopOffset       = Number(ui.clSupportTopOffset.value) || 0;
    cl.supportBottomOffset    = Number(ui.clSupportBottomOffset.value) || 0;
    cl.supportRotate          = !!ui.clSupportRotate.checked;
  }

  refreshCLList?.();
  loadCL(currentCLIndex); // UI sync + highlight
  snapshot?.();
}

// 2) A gomb kattintás mostantól csak ezt hívja:
// Mentés gomb továbbra is ezt hívja
ui.clSave?.addEventListener("click", saveCLFromUI);

// Ezekre az elemekre kötünk automata mentést
[
  "clName",
  "clRadius",
  "clStyle",
  "clStartOffset",
  "clDL",

  //"clCPRefType",
  "clCPRefName",
  //"clLineRefType",
  "clLineRefName",

  // Supports
  //"clSupportMajorRefType",
  "clSupportMajorRefName",
  //"clSupportMinorRefType",
  "clSupportMinorRefName",
  "clSupportMajorH",
  "clSupportMinorH",
  "clSupportDecimate",
  "clSupportDecimateOffset",
  "clSupportTopOffset",
  "clSupportBottomOffset",
  "clSupportRotate",

  // Megjelenítés
  "clShowAux",
  "clShowRadius",

  // Nézet mód (ha ezt is menteni szeretnéd)
  "clDrawMode",
].forEach((id) =>
{
  const el = document.getElementById(id);
  if (!el) return;

  // input vs change: szám/slider/tesztmező → 'input', select/checkbox → 'change'
  const ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
  el.addEventListener(ev, saveCLFromUI);
});




ui.clDelete.addEventListener("click", () =>
{
  if (!currentCL) return;
  const idx = store.controlLines.findIndex((c) => c.name === currentCL.name);
  if (idx >= 0)
  {
    store.controlLines.splice(idx, 1);
    currentCL = null;
    ui.cpList.innerHTML = "";
    refreshCLList();
    drawControlLines();
    snapshot();
  }
});

// ===== CP lista és meta =====

export function refreshCPList()
{

  console.log("[refreshCPList]");

  ui.cpList.innerHTML = "";
  cpSelSet.clear();

  if (currentCLIndex < 0) return;
  const cl = store.controlLines[currentCLIndex];
  if (!cl || !Array.isArray(cl.points)) return;

  cl.points.forEach((cp, i) =>
  {
    const li = document.createElement("li");
    const p = (cp.pos || [0, 0, 0]).map((n) => (+n).toFixed(2)).join(", ");
    li.dataset.idx = String(i);
    
    //li.textContent = `${i + 1}. CP  pos(${p})  roll=${(cp.rotRYP?.[0] || 0) | 0}`;
    li.textContent = `${i + 1}`;


    li.onclick = (ev) =>
    {
      console.log("pittyputty");

      if (ev.ctrlKey)
      {
        if (cpSelSet.has(i)) cpSelSet.delete(i);
        else cpSelSet.add(i);
      }
      else
      {
        cpSelSet.clear();
        cpSelSet.add(i);
      }
      refreshCPListHighlight();
      // mezők frissítése az első kiválasztott CP-ről:
      syncSceneEditorsFromFirstCP();


    };
    ui.cpList.appendChild(li);


  });

  refreshCPListHighlight();
}

//-------------------------------------------------------



function AddNewCP()
{

  if (typeof currentCLIndex !== "number" || currentCLIndex < 0) return;

  const cl = store.controlLines[currentCLIndex];
  cl.points = Array.isArray(cl.points) ? cl.points : [];

  const STEP = 5.0; // új CP távolsága

  // segéd: fok → radián
  const deg = (a) => a * Math.PI / 180;

  // ha már van legalább 1 CP → az utolsó +X iránya mentén rakjuk le
  if (cl.points.length > 0)
  {
    const last = cl.points[cl.points.length - 1] || {};
    const p0 = new THREE.Vector3(...(last.pos || [0,0,0]));
    const r  = last.rotRYP || [0,0,0];

    // XYZ sorrendű euler → kvaternió → +X irány világban
    const e = new THREE.Euler(deg(r[0]||0), deg(r[1]||0), deg(r[2]||0), 'XYZ');
    const q = new THREE.Quaternion().setFromEuler(e);
    const dirX = new THREE.Vector3(1,0,0).applyQuaternion(q).normalize();

    const p1 = p0.clone().addScaledVector(dirX, STEP);

    cl.points.push({
      pos: [p1.x, p1.y, p1.z],
      rotRYP: [r[0]||0, r[1]||0, r[2]||0], // örökli az orientációt
      style: (last.style ?? 1),
      lineStyle: (last.lineStyle ?? 1),
      iw: (last.iw ?? 0.5),
      ow: (last.ow ?? 0.5),
    });
  }
  else
  {
    // nincs CP: tegyük a kamera „közép”-ére
    const hasControlsTarget = typeof controls !== 'undefined' && controls?.target instanceof THREE.Vector3;
    let center;

    if (hasControlsTarget)
    {
      center = controls.target.clone();
    }
    else if (typeof camera !== 'undefined' && camera?.getWorldDirection)
    {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      center = camera.position.clone().add(dir.normalize().multiplyScalar(10));
    }
    else
    {
      center = new THREE.Vector3(0,0,0);
    }

    cl.points.push({
      pos: [center.x, center.y, center.z],
      rotRYP: [0, 0, 0],
      style: 1,
      lineStyle: 1,
      iw: 5,
      ow: 5,
    });
  }

  // kijelölés frissítése: csak az utolsó legyen kijelölve
  refreshCPList?.();
  cpSelSet.clear();
  let ID = cl.points.length-1;
  console.log("addpoint selection",ID)
  cpSelSet.add(ID);
  
  refreshCPListHighlight();
  drawControlLines?.();
  rebuildAllBounds?.();
  fillScnEditors?.();
  snapshot?.();
}

//-------------------------------------------------------------------------

ui.cpAdd.addEventListener("click", AddNewCP);



//------------------------------------------

// Csak akkor triggereljük, ha nem szövegbe gépel a user
function isTypingInEditable(ev) {
  const el = ev.target;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

// R gyorsgomb: új CP hozzáadása
document.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;                               // ne ismételjen lenyomva tartva
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return;   // csak „sima” R
  if (isTypingInEditable(ev)) return;                  // gépelés közben ne

  if (ev.key && ev.key.toLowerCase() === 'r') {
    if (typeof AddNewCP === 'function') {
      AddNewCP();
      ev.preventDefault();
    }
  }
});




//------------------------------------------




ui.cpRemove.addEventListener("click", () =>
{
  if (currentCLIndex < 0) return;

  console.debug("torol CP");

  const cl = store.controlLines[currentCLIndex];
  if (!Array.isArray(cl.points)) return;
  const idxs = [...cpSelSet].sort((a, b) => b - a);
  idxs.forEach((i) => cl.points.splice(i, 1));
  cpSelSet.clear();
  refreshCPList();
  drawControlLines?.();
  snapshot?.();
});

//------------------------------

export function refreshCPListHighlight()
{
  ui.cpList.querySelectorAll("li").forEach((li) =>
  {
    const idx = +li.dataset.idx;
    li.classList.toggle("sel", cpSelSet.has(idx));
  });
}
//------------------------------



function applyCPMetaNow()
{
  if (cpSelSet.size === 0) return;

  const cl = store.controlLines?.[currentCLIndex];
  if (!cl || !Array.isArray(cl.points)) return;

  const style = +ui.cpStyle.value | 0;
  const lineStyle = +ui.cpLineStyle.value | 0;
  const iw = Math.max(0, +ui.cpIW.value);
  const ow = Math.max(0, +ui.cpOW.value);

  cpSelSet.forEach((pi) =>
  {
    const cp = cl.points[pi];
    if (!cp) return;
    cp.style = style;
    cp.lineStyle = lineStyle;
    cp.iw = iw;
    cp.ow = ow;
  });

  //refreshCPList();
  drawControlLines();
  snapshot();
}

ui.cpApply.addEventListener("click", applyCPMetaNow);

["cpStyle", "cpLineStyle", "cpIW", "cpOW"].forEach((id) =>
{
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", applyCPMetaNow);
});

//================================================

export function syncSceneEditorsFromFirstCP()
{
  if (currentCLIndex < 0 || cpSelSet.size === 0) return;
  
  const cl = store.controlLines[currentCLIndex];
  if (!cl || !Array.isArray(cl.points)) return;

  const i = firstFrom(cpSelSet);
  const cp = cl.points[i];
  if (!cp) return;

  ui.sPosX.value = cp.pos?.[0] ?? 0;
  ui.sPosY.value = cp.pos?.[1] ?? 0;
  ui.sPosZ.value = cp.pos?.[2] ?? 0;
  ui.sRoll.value = cp.rotRYP?.[0] ?? 0;
  ui.sYaw.value = cp.rotRYP?.[1] ?? 0;
  ui.sPitch.value = cp.rotRYP?.[2] ?? 0;
  ui.sSx.value = 1;
  ui.sSy.value = 1;
  ui.sSz.value = 1;

  ui.cpStyle.value = cp.style;
  ui.cpLineStyle.value = cp.lineStyle;
  ui.cpIW.value = cp.iw;
  ui.cpOW.value = cp.ow;
}

//================================================

function getCurrentCP()
{
  if (currentCLIndex < 0) return null;
  const cl = store.controlLines?.[currentCLIndex];
  if (!cl || !Array.isArray(cl.points)) return null;
  const i = firstSelIndex(cpSelSet);
  if (i < 0 || i >= cl.points.length) return null;
  return { cl, cpIndex: i, cp: cl.points[i] };
}

function applyCPNow()
{
  const got = getCurrentCP();
  if (!got) return;

  const { cl, cpIndex, cp } = got;

  // beolvasás (számokká!)
  const style = ui.cpStyle ? parseInt(ui.cpStyle.value, 10) : (cp.style ?? 0);
  const lineStyle = ui.cpLineStyle
    ? parseInt(ui.cpLineStyle.value, 10)
    : (cp.lineStyle ?? 0);
  const iw = ui.cpIW ? parseFloat(ui.cpIW.value) : (cp.iw ?? 0);
  const ow = ui.cpOW ? parseFloat(ui.cpOW.value) : (cp.ow ?? 0);

  // írás a modellbe
  cp.style = Number.isFinite(style) ? style : 0;
  cp.lineStyle = Number.isFinite(lineStyle) ? lineStyle : 0;
  cp.iw = Number.isFinite(iw) ? iw : 0;
  cp.ow = Number.isFinite(ow) ? ow : 0;

  // vizuál frissítés
  drawControlLines();
  //scheduleRebuildBounds?.();
  rebuildAllBounds?.();
  snapshot?.();
}

// gomb
ui.applyCP?.addEventListener("click", applyCPNow);

// "élő" frissítés gépelés közben
["cpStyle", "cpLineStyle", "cpIW", "cpOW"].forEach((id) =>
{
  const el = ui[id];
  if (!el) return;
  el.addEventListener("input", () =>
  {
    // nem snapshot-olunk minden leütésre — csak kirajzol
    applyCPNow();
  });
});





























//------------------------------------------------------------------------------
// ===== Interpolációs segédek =====
//------------------------------------------------------------------------------

// ===== ControlLine / ControlPoint vizuál =====



const COLOR_CP_BOX = 0xffcc00; // sárga kocka
//const COLOR_CP_BOX = 0x000000; // sárga kocka

const COLOR_OUT = 0x00aa00; // +X zöld nyíl (out)
const COLOR_IN = 0xaa0000; // -X piros nyíl (in)
const COLOR_DOWN = 0x111111; // -Y fekete
const COLOR_RIGHTMZ = 0xaa0000; // -Z piros
const COLOR_LEFTPZ = 0x0044ff; // +Z kék
const COLOR_AUX = 0x888888; // segédpont szürke

function makeArrow(length, radius, color, dir)
{
  const grp = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius,
      radius,
      Math.max(0.0001, length * 0.75),
      8,
    ),
    new THREE.MeshStandardMaterial({ color }),
  );
  shaft.position.y = (length * 0.75) / 2;
  grp.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 2.2, length * 0.25, 12),
    new THREE.MeshStandardMaterial({ color }),
  );
  head.position.y = length * 0.75 + (length * 0.25) / 2;
  grp.add(head);

  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    up,
    dir.clone().normalize(),
  );
  grp.quaternion.copy(q);
  return grp;
}


function makeLine(length, radius, color, dir)
{
  const grp = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, Math.max(0.0001, length), 8),
    new THREE.MeshStandardMaterial({ color }),
  );
  m.position.y = length / 2;
  grp.add(m);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    up,
    dir.clone().normalize(),
  );
  grp.quaternion.copy(q);
  return grp;
}


function makeNumberLabel(text)
{
  const canvasSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = canvasSize;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  ctx.font = '64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // kis fekete kontúr + fehér szöveg
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.fillStyle = '#ffffff';

  ctx.strokeText(text, canvasSize / 2, canvasSize / 2);
  ctx.fillText(text, canvasSize / 2, canvasSize / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });

  const sprite = new THREE.Sprite(material);

  // méretezés – állíthatod, ha nagy/kicsi
  const s = 1;
  sprite.scale.set(s, s, s);

  return sprite;
}



function makeCircleYZ(radius, color)
{
    // RingGeometry alapból XY síkban van (normál +Z),
    // forgatással tesszük YZ síkba (normál +X).

    const geom = new THREE.RingGeometry(radius - 0.05, radius, 32);
    const mat  = new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
}


function makeCPGizmo(cp, radius, labelText, showCircle = false)
{
  const g = new THREE.Group();

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),                  //Central little Box
    new THREE.MeshStandardMaterial({ color: COLOR_CP_BOX }),
  );
  
  box.name= 'cpCenterBox'
  g.add(box);

   if (!g.userData) g.userData = {};
  g.userData.cpCenterBox = box;

  if (cp.ow > 0)
  {
    //g.add(makeArrow(cp.ow, 0.01, COLOR_OUT, new THREE.Vector3(1, 0, 0)));
    g.add(makeLine(cp.ow, 0.005, COLOR_OUT, new THREE.Vector3(1, 0, 0)));
  }
  if (cp.iw > 0)
  {
    //g.add(makeArrow(cp.iw, 0.01, COLOR_IN, new THREE.Vector3(-1, 0, 0)));
    g.add(makeLine(cp.iw, 0.005, COLOR_IN, new THREE.Vector3(-1, 0, 0)));
  }

  if (radius > 0)
  {
    if (showCircle)
    {
      g.add(makeLine(radius, 0.02, COLOR_DOWN, new THREE.Vector3(0, -1, 0)));  //down indicator
      g.add(makeCircleYZ(radius, COLOR_DOWN));  
    }

    // side indicators
    g.add(makeLine(radius, 0.005, COLOR_RIGHTMZ, new THREE.Vector3(0, 0, -1)));
    g.add(makeLine(radius, 0.005, COLOR_LEFTPZ,  new THREE.Vector3(0, 0, 1)));
  }

  // felirat a gizmo fölé
  if (labelText !== undefined && labelText !== null)
  {
    const label = makeNumberLabel(String(labelText));
    label.position.set(0, 0.6, 0);
    g.add(label);
  }

  return g;
}

function makeAuxGizmo(size = 0.09, radius = 0.8)
{
  const node = new THREE.Group();
  node.userData.pickable = false;

  // kis gömb – semleges szürke
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(size / 2, 10, 8),
    new THREE.MeshStandardMaterial({
      color: COLOR_AUX,
      metalness: 0,
      roughness: 1,
    }),
  );
  node.add(ball);

  // segédvonalak: le (−Y = fekete), bal (+Z = kék), jobb (−Z = piros)
  const mk = (len, col, dir) =>
  {
    const grp = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(
        size * 0.12,
        size * 0.12,
        Math.max(0.0001, len),
        8,
      ),
      new THREE.MeshStandardMaterial({ color: col }),
    );
    cyl.position.y = len / 2;
    grp.add(cyl);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(
      up,
      dir.clone().normalize(),
    );
    grp.quaternion.copy(q);
    return grp;
  };

  const r = Math.max(0.0001, radius);
  node.add(mk(r, COLOR_DOWN, new THREE.Vector3(0, -1, 0))); // lefele (−Y) fekete
  node.add(mk(r, COLOR_LEFTPZ, new THREE.Vector3(0, 0, 1))); // bal   (+Z) kék
  node.add(mk(r, COLOR_RIGHTMZ, new THREE.Vector3(0, 0, -1))); // jobb  (−Z) piros

  return node;
}

/*
// Support gizmo – wireframe hasáb + +X irányvonal
function makeSupportGizmo(height, isMinor = false)
{
  const H = Math.max(0.001, Number(height) || 0.001);
  const SIZE_X = 0.35, SIZE_Z = 0.35;

  const colorBody = isMinor ? 0x2bb3ff : 0xff8c2b; // minor: kékes, major: narancs
  const colorAxis = isMinor ? 0x0077cc : 0xcc5500;

  const g = new THREE.Group();

  // hasáb (talpon ül)
  const boxGeo = new THREE.BoxGeometry(SIZE_X, H, SIZE_Z);
  const wfGeo  = new THREE.WireframeGeometry(boxGeo);
  const wfMat  = new THREE.LineBasicMaterial({ color: colorBody });
  const boxWf  = new THREE.LineSegments(wfGeo, wfMat);
  boxWf.position.y = H * 0.5;
  g.add(boxWf);

  // +X irányvonal (pici offset a z-flicker ellen)
  const AXIS_LEN = Math.max(0.6, Math.min(1.5, H * 0.5));
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.01, 0),
    new THREE.Vector3(AXIS_LEN, 0.01, 0),
  ]);
  const axisMat = new THREE.LineBasicMaterial({ color: colorAxis });
  const xLine   = new THREE.Line(axisGeo, axisMat);
  g.add(xLine);

  // Fontos: a group origója a TALP KÖZEPE (Y=0)
  return g;
}
*/

// Support gizmo gyártó – wireframe hasáb + +X irányvonal
// height: a hasáb magassága (m) – a talpa az Y=0 síkon fekszik
// isMinor: true → minor színek; false → major színek
function makeSupportGizmo(height, isMinor = false)
{
  const H = Math.max(0.001, Number(height) || 0.001);

  // egyszerű, karcsú keresztmetszet a hasábhoz (m)
  const SIZE_X = 0.35;
  const SIZE_Z = 0.35;

  // színek
  const colorBody = isMinor ? 0x2bb3ff : 0xff8c2b; // minor: kékes, major: narancs
  const colorAxis = isMinor ? 0x0077cc : 0xcc5500; // irányvonal

  const g = new THREE.Group();

  // --- wireframe hasáb (alapon ül) ---
  const boxGeo = new THREE.BoxGeometry(SIZE_X, H, SIZE_Z);
  const wfGeo  = new THREE.WireframeGeometry(boxGeo);
  const wfMat  = new THREE.LineBasicMaterial({ color: colorBody });
  const boxWf  = new THREE.LineSegments(wfGeo, wfMat);

  // úgy pozicionáljuk, hogy a talpa az Y=0 síkon legyen
  boxWf.position.y = H * 0.5;
  g.add(boxWf);

  // --- +X irányjelző vonal (a talpon, nagyon vékonyan a z-flicker elkerülésére) ---
  const AXIS_LEN = Math.max(0.6, Math.min(1.5, H * 0.5)); // ésszerű hossz
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.01, 0),
    new THREE.Vector3(AXIS_LEN, 0.01, 0),
  ]);
  const axisMat = new THREE.LineBasicMaterial({ color: colorAxis });
  const xLine   = new THREE.Line(axisGeo, axisMat);
  g.add(xLine);

  // fontos: a group origója a talp középpontja (Y=0), így könnyű lesz lerakni
  // (azaz g.position majd az AUX XZ-jére, Y=0-ra kerülhet)

  return g;
}

// --- Vektor segédek ---



function addSceneItem(refType, refName, pos, rotRYP, scale = [1, 1, 1])
{
  store.scene.push({
    refType,
    refName,
    pos: [pos[0], pos[1], pos[2]],
    rotRYP: [rotRYP[0], rotRYP[1], rotRYP[2]],
    scale: [scale[0], scale[1], scale[2]],
  });
}





//--------------------------------------------------------------



// Hermite mintavételezés dL lépéssel, startOffset eltolással.
// Visszaad: [{ pos:[x,y,z], tan:[x,y,z], quat:[qx,qy,qz,qw], active, segIndex, t }]
// Hermite mintavételezés dL lépéssel, startOffset eltolással.
// Visszaad: [{ pos:[x,y,z], tan:[x,y,z], quat:[qx,qy,qz,qw], active, segIndex, t }]
function computeGeneratedPoints(cl)
{
  if (!cl || !Array.isArray(cl.points) || cl.points.length < 2) return [];

  const pts    = cl.points;
  const dL     = (Number.isFinite(cl.dL) && cl.dL > 0) ? cl.dL : 1.0;
  let   target = Number.isFinite(cl.startOffset) ? cl.startOffset : 0;

  const deg = a => a * Math.PI / 180;

  // Editor által használt Euler-sorrend (pl. 'XYZ' vagy 'YXZ')
  const EULER_ORDER = (cl?.eulerOrder || (ui?.eulerOrder?.value) || 'XYZ');

  // Előjelek (ha valaha tükröztél tengelyt)
  const Y_SIGN      = +1;
  const Z_SIGN      = +1;
  const ROLL_SIGN   = +1;
  const BOTTOM_SIGN = +1;   // „alja” = BOTTOM_SIGN * (CP_full.Y)

  // --- Euler → kvaternió, az editor sorrendjével ---
  function eulerToQuat(roll, yaw, pitch)
  {
    const e = new THREE.Euler(
      ROLL_SIGN*deg(roll||0),
      Y_SIGN   *deg(yaw ||0),
      Z_SIGN   *deg(pitch||0),
      EULER_ORDER
    );
    return new THREE.Quaternion().setFromEuler(e);
  }

  // q → (X,Y,Z) bázis, jobbos kényszerrel
  function axesFromQ(q)
  {
    const X = new THREE.Vector3(1,0,0).applyQuaternion(q).normalize();
    const Y = new THREE.Vector3(0,1,0).applyQuaternion(q).normalize();
    const Z = new THREE.Vector3(0,0,1).applyQuaternion(q).normalize();
    const Zc = new THREE.Vector3().crossVectors(X, Y).normalize();
    let   Yc = new THREE.Vector3().crossVectors(Zc, X).normalize();
    if (X.clone().cross(Yc).dot(Zc) < 0) Yc.multiplyScalar(-1);
    return { X, Y:Yc, Z:Zc };
  }

  // Csak a geometriai síkhoz szükséges keret: roll NÉLKÜL (yaw+pitch)
  function axesNoRoll(cp)
  {
    const r = cp.rotRYP || [0,0,0];
    const e = new THREE.Euler(0, Y_SIGN*deg(r[1]||0), Z_SIGN*deg(r[2]||0), EULER_ORDER);
    const q = new THREE.Quaternion().setFromEuler(e);
    return axesFromQ(q);
  }

  // Teljes CP-keret (roll is számít) a „bottom” irányhoz
  function axesFull(cp)
  {
    const r = cp.rotRYP || [0,0,0];
    const q = eulerToQuat(r[0], r[1], r[2]);
    return axesFromQ(q);
  }

  // vektor X-re merőleges komponense, normálva
  function projToNormalPlane(v, X)
  {
    return v.clone().sub( X.clone().multiplyScalar(v.dot(X)) ).normalize();
  }

  // Hermite (p, dp)
  function hermite(P0,T0,P1,T1,t)
  {
    const t2=t*t, t3=t2*t;
    const h00 =  2*t3 - 3*t2 + 1;
    const h10 =      t3 - 2*t2 + t;
    const h01 = -2*t3 + 3*t2;
    const h11 =      t3 -   t2;

    const p = new THREE.Vector3()
      .addScaledVector(P0,h00)
      .addScaledVector(T0,h10)
      .addScaledVector(P1,h01)
      .addScaledVector(T1,h11);

    const dh00 = 6*t2 - 6*t;
    const dh10 = 3*t2 - 4*t + 1;
    const dh01 = -6*t2 + 6*t;
    const dh11 = 3*t2 - 2*t;

    const dp = new THREE.Vector3()
      .addScaledVector(P0,dh00)
      .addScaledVector(T0,dh10)
      .addScaledVector(P1,dh01)
      .addScaledVector(T1,dh11);

    return { p, dp };
  }

  const quatFromBasis = (X,Y,Z) =>
    new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z));

  const out = [];
  let traveledTotal = 0;

  // fázis-kibontás (unwrap) a szegmensek között
  let prevPhiEnd = 0;

  for (let si = 0; si < pts.length-1; si++)
  {
    const A = pts[si], B = pts[si+1];

    const PA = new THREE.Vector3(...(A.pos||[0,0,0]));
    const PB = new THREE.Vector3(...(B.pos||[0,0,0]));

    // Geometriai keretek (roll nélkül) – CSAK ezek határozzák meg a középvonalat
    const aNo = axesNoRoll(A);
    const bNo = axesNoRoll(B);

    // „Bottom” irány a TELJES CP-keretből (roll is számít)
    const aFull = axesFull(A);
    const bFull = axesFull(B);
    const bottomA_world = aFull.Y.clone().multiplyScalar(BOTTOM_SIGN).normalize();
    const bottomB_world = bFull.Y.clone().multiplyScalar(BOTTOM_SIGN).normalize();

    // Hermite tangensek (kapukra merőlegesen lépjen ki/ be)
    const ow = Math.max(0, A.ow||0);
    const iw = Math.max(0, B.iw||0);
    const T0 = aNo.X.clone().multiplyScalar(ow);   // +X_A
    const T1 = bNo.X.clone().multiplyScalar(iw);   // +X_B  (FIGYELEM: belépés B-be → a Hermite így is jól viszi)

    // --- RMF (parallel transport) twist nélkül ---
    const dt = 0.02;
    const samples = [];

    // t=0 (kezdő keret)
    {
      const { p, dp } = hermite(PA,T0,PB,T1,0);
      const X0 = dp.clone().normalize();

      // kezdő N: a bottomA vetítése az X0-ra merőleges síkra → pontos egyezés a kapunál
      let N0 = projToNormalPlane(bottomA_world, X0);
      if (!Number.isFinite(N0.lengthSq()) || N0.lengthSq() < 1e-12) {
        N0 = new THREE.Vector3(0,1,0);
        if (Math.abs(N0.dot(X0)) > 0.99) N0 = new THREE.Vector3(1,0,0);
        N0.sub(X0.clone().multiplyScalar(N0.dot(X0))).normalize();
      }
      const B0 = new THREE.Vector3().crossVectors(X0, N0).normalize();
      samples.push({ t:0, p, S:0, X:X0, N:N0, B:B0 });
    }

    for (let t = dt; t <= 1.000001; t += dt)
    {
      const tt = Math.min(1,t);
      const { p, dp } = hermite(PA,T0,PB,T1,tt);
      const Xk = dp.clone().normalize();

      const prev  = samples[samples.length-1];
      const qStep = new THREE.Quaternion().setFromUnitVectors(prev.X, Xk);

      let Nk = prev.N.clone().applyQuaternion(qStep).normalize();
      let Bk = prev.B.clone().applyQuaternion(qStep).normalize();

      // Orthonormalizálás
      Bk = new THREE.Vector3().crossVectors(Xk, Nk).normalize();
      Nk = new THREE.Vector3().crossVectors(Bk, Xk).normalize();

      const S = prev.S + prev.p.distanceTo(p);
      samples.push({ t:tt, p, S, X:Xk, N:Nk, B:Bk });
    }

    const segLen  = samples[samples.length-1].S;
    const X_end   = samples[samples.length-1].X;
    const N_endRF = samples[samples.length-1].N; // RMF végi N (referencia)

    // Végi „bottom” projektálása a végső X-re merőleges síkba
    const bottomB_proj = projToNormalPlane(bottomB_world, X_end);

    // Előjeles szög a végponton: mennyit kell X_end körül elcsavarni az RMF N-t,
    // hogy pont a bottomB_proj legyen
    const crossEnd = new THREE.Vector3().crossVectors(N_endRF, bottomB_proj);
    let   phiB     = Math.atan2( crossEnd.dot(X_end), N_endRF.dot(bottomB_proj) ); // (-π..π)

    // --- FÁZIS UNWRAP: illesszük a előző szegmens fázisához, hogy folytonos legyen ---
    // Válasszunk olyan 2π-közeli eltolást, ami a legközelebb visz prevPhiEnd-hez
    if (si > 0)
    {
      const TWO_PI = Math.PI * 2;
      // három jelölt: phiB-2π, phiB, phiB+2π
      const cands = [phiB - TWO_PI, phiB, phiB + TWO_PI];
      let best = cands[0], bestErr = Math.abs(cands[0] - prevPhiEnd);
      for (let j=1; j<cands.length; j++) {
        const err = Math.abs(cands[j] - prevPhiEnd);
        if (err < bestErr) { bestErr = err; best = cands[j]; }
      }
      phiB = best;
    }
    prevPhiEnd = phiB;

    // --- Minták dL szerint, egyenletes csavarással: phi(s) = lerp(0, phiB, α) ---
    const activeSeg = ((A.lineStyle|0) !== 0);
    const qBaseAt   = samples.map(s => quatFromBasis(s.X, s.N, s.B));

    let acc = 0;
    for (let k = 1; k < samples.length; k++)
    {
      const A1 = samples[k-1], B1 = samples[k];
      const d  = A1.p.distanceTo(B1.p);

      while (traveledTotal + acc + d >= target)
      {
        const local   = (target - traveledTotal - acc) / d;

        // pozíció
        const p       = new THREE.Vector3().lerpVectors(A1.p, B1.p, local);

        // arány: ívhossz alapján (stabilabb), fallback t-re
        const S_local = THREE.MathUtils.lerp(A1.S, B1.S, local);
        const alpha   = segLen > 1e-9 ? (S_local/segLen) : THREE.MathUtils.lerp(A1.t, B1.t, local);

        // RMF kvaternió (twist nélkül)
        const qBase   = qBaseAt[k-1].clone().slerp(qBaseAt[k], local);

        // +X körüli csavar: phi = lerp(0, phiB, alpha)
        const phi     = alpha * phiB;
        const qTwist  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), phi);

        const q       = qBase.clone().multiply(qTwist);
        const dp      = new THREE.Vector3(1,0,0).applyQuaternion(qBase);

        out.push({
          pos:  [p.x, p.y, p.z],
          tan:  [dp.x, dp.y, dp.z],
          quat: [q.x, q.y, q.z, q.w],
          active: activeSeg,
          segIndex: si,
          t: THREE.MathUtils.lerp(A1.t, B1.t, local)
        });

        target += dL;
      }

      acc += d;
    }

    traveledTotal += segLen;
  }

  return out;
}


//----------------------------------------------------------------------------

function generateCurrentControlLine()
{
  // --- lokális segédek ---
  const num = (v, def = 0) =>
  {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const modSafe = (a, n) => ((a % n) + n) % n;

  function makeRefFromUI(typeSel, nameSel)
  {
    const t = typeSel?.value ?? "null";
    const n = nameSel?.value ?? "null";
    if (t === "null" || n === "null") return null;
    return { refType: t, refName: n };
  }

  function resolveLegacyRef(type, name)
  {
    if (!name) return null;
    if (type === "gp")  return { refType: "gp",  refName: name };
    if (type === "grp") return { refType: "grp", refName: name };
    return null;
  }

  function quatYawFromAuxQuatXYZ(qAux /* THREE.Quaternion */)
  {
    const Zloc = new THREE.Vector3(0, 0, 1).applyQuaternion(qAux);
    const Zp   = new THREE.Vector3(Zloc.x, 0, Zloc.z);
    if (Zp.lengthSq() <= 1e-8) return new THREE.Quaternion(); // identity
    Zp.normalize();
    const Y = new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3().crossVectors(Y, Zp).normalize();
    const M = new THREE.Matrix4().makeBasis(X, Y, Zp);
    return new THREE.Quaternion().setFromRotationMatrix(M);
  }

  function quatToEulerRYPDeg(q /* THREE.Quaternion */)
  {
    const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
    return [ e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI ];
  }

  // --- guardok ---
  if (ui.mode.value !== "scn")
  {
    console.warn("[Generate] Scene módban használd.");
    return;
  }

  if (!Array.isArray(store.controlLines) || store.controlLines.length === 0)
  {
    console.warn("[Generate] Nincs ControlLine.");
    return;
  }

  if (typeof currentCLIndex !== "number" ||
      currentCLIndex < 0 ||
      currentCLIndex >= store.controlLines.length)
  {
    console.warn("[Generate] Nincs kijelölt ControlLine.");
    return;
  }

  const cl  = store.controlLines[currentCLIndex];
  const pts = Array.isArray(cl.points) ? cl.points : [];

  //------------------------------------------------------------------------------
  // --- aktuális Line/CP/Support referencia UI-ból vagy CL-ből (null támogatás) ---
  const uiLineRef =
    (ui.clLineRefType && ui.clLineRefName)
      ? makeRefFromUI(ui.clLineRefType, ui.clLineRefName)
      : null;

  const uiCPRef =
    (ui.clCPRefType && ui.clCPRefName)
      ? makeRefFromUI(ui.clCPRefType, ui.clCPRefName)
      : null;

  const uiSupportMajorRef =
    (ui.clSupportMajorRefType && ui.clSupportMajorRefName)
      ? makeRefFromUI(ui.clSupportMajorRefType, ui.clSupportMajorRefName)
      : null;

  const uiSupportMinorRef =
    (ui.clSupportMinorRefType && ui.clSupportMinorRefName)
      ? makeRefFromUI(ui.clSupportMinorRefType, ui.clSupportMinorRefName)
      : null;

  // Legacy -> objektumos konverzió (ha régi mezők vannak eltárolva)
  const legacyLineRef  = resolveLegacyRef(cl.lineRefType,  cl.lineRefName);
  const legacyCPRef    = resolveLegacyRef(cl.cpRefType,    cl.cpRefName);
  const legacyMajRef   = resolveLegacyRef(cl.supportMajorRefType, cl.supportMajorRefName);
  const legacyMinRef   = resolveLegacyRef(cl.supportMinorRefType, cl.supportMinorRefName);

  // Végső single-referenciák prioritással: UI → új objektumos → legacy → null
  let lineRef  = uiLineRef         ?? cl.lineRef         ?? legacyLineRef ?? null;
  let cpRef    = uiCPRef           ?? cl.cpRef           ?? legacyCPRef   ?? null;
  let majRef   = uiSupportMajorRef ?? cl.supportMajorRef ?? legacyMajRef  ?? null;
  let minRef   = uiSupportMinorRef ?? cl.supportMinorRef ?? legacyMinRef  ?? null;

  // Visszaírjuk az új (objektumos) formát, hogy mentődjön
  cl.lineRef         = lineRef;
  cl.cpRef           = cpRef;
  cl.supportMajorRef = majRef;
  cl.supportMinorRef = minRef;

  // --- ÚJ: több elemű referencia-listák támogatása ---
  const isValidRef = (r) =>
    r &&
    typeof r === "object" &&
    r.refType &&
    r.refName &&
    r.refType !== "null" &&
    r.refName !== "null";

  function resolveRefList(arrayField, single)
  {
    if (Array.isArray(arrayField))
    {
      return arrayField.filter(isValidRef);
    }
    if (isValidRef(single))
    {
      return [single];
    }
    return [];
  }

  const lineRefs = resolveRefList(cl.lineRefs,         lineRef); // pályaelemek
  const cpRefs   = resolveRefList(cl.cpRefs,           cpRef);   // kapuk
  const majRefs  = resolveRefList(cl.supportMajorRefs, majRef);  // Major
  const minRefs  = resolveRefList(cl.supportMinorRefs, minRef);  // Minor
  //------------------------------------------------------------------------------

  // --- Útvonal-elemek lerakása a közös kimenet alapján (lista támogatással) ---
  if (lineRefs.length > 0)
  {
    const gen = computeGeneratedPoints(cl);
    let lineIndex = 0; // hányadik pályaelemet rakjuk le összesen

    for (const g of gen)
    {
      if (!g.active) continue; // lineStyle==0 → kihagyjuk ezt a szakaszt

      const pos = g.pos;  // [x,y,z]
      const q   = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);

      // kvaternion → XYZ euler (RYP fokok a te rendszeredhez)
      const rotRYP = quatToEulerRYPDeg(q);

      // körkörös választás a lineRefs listából: 0,1,2,0,1,2, ...
      const ref = lineRefs[lineIndex % lineRefs.length];

      addSceneItem(
        ref.refType,
        ref.refName,
        [pos[0], pos[1], pos[2]],
        rotRYP,
        [1, 1, 1]
      );

      lineIndex++;
    }
  }

  // --- SUPPORT generálás (Major/Minor) – lista támogatással ---
  {
    const gen = computeGeneratedPoints(cl); // pos/tan/quat/segIndex/active

    const hasMajor = majRefs.length > 0;
    const hasMinor = minRefs.length > 0;
    const Hmaj     = Math.max(0, num(cl.supportMajorH, 0));
    const Hmin     = Math.max(0, num(cl.supportMinorH, 0));
    const topOff   = num(cl.supportTopOffset, 0);
    const botOff   = num(cl.supportBottomOffset, 0);
    const N        = Math.max(1, num(cl.supportDecimate, 1));
    const off      = num(cl.supportDecimateOffset, 0);
    const doYaw    = !!cl.supportRotate;

    let globalAuxIndex  = 0; // TELJES vonal mentén (szakasz-stílustól függetlenül léptetjük)
    let majorPlaceIndex = 0; // hányadik Major darabot rakjuk le összesen
    let minorPlaceIndex = 0; // hányadik Minor darabot rakjuk le összesen

    for (const g of gen)
    {
      const isActive = g.active === true;
      const segStyle = ((pts[g.segIndex]?.lineStyle) | 0) || 0;

      // decimálás globális index alapján
      const take = (modSafe(globalAuxIndex - off, N) === 0);

      if (isActive && take && (segStyle >= 2) && (hasMajor || hasMinor))
      {
        const x = g.pos[0], y = g.pos[1], z = g.pos[2];

        // hasznos függőleges szakasz (offsetekkel)
        const yTop    = y - topOff;
        const yBottom = 0 + botOff;
        const Le      = yTop - yBottom;

        if (Le > 0)
        {
          // yaw (csak Y körül), AUX +Z XZ-vetületével
          let qYaw = new THREE.Quaternion(); // identity
          if (doYaw)
          {
            const qAux = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);
            qYaw = quatYawFromAuxQuatXYZ(qAux);
          }
          const rotRYP = quatToEulerRYPDeg(qYaw);

          // Majorok alulról
          let nMaj = 0;
          if (segStyle >= 2 && hasMajor && Hmaj > 0)
          {
            nMaj = Math.floor(Le / Hmaj);

            for (let k = 0; k < nMaj; k++)
            {
              const yBase = yBottom + k * Hmaj;

              const ref = majRefs[majorPlaceIndex % majRefs.length];
              majorPlaceIndex++;

              addSceneItem(
                ref.refType,
                ref.refName,
                [x, yBase, z],
                rotRYP,
                [1, 1, 1]
              );
            }
          }

          // Minorok a majorok tetejétől felfelé
          if (segStyle >= 3 && hasMinor && Hmin > 0)
          {
            const yMajorTop = yBottom + nMaj * Hmaj;
            const R         = yTop - yMajorTop;

            if (R > 0)
            {
              const nMin = Math.floor(R / Hmin);
              for (let j = 0; j < nMin; j++)
              {
                const yBase = yMajorTop + j * Hmin;

                const ref = minRefs[minorPlaceIndex % minRefs.length];
                minorPlaceIndex++;

                addSceneItem(
                  ref.refType,
                  ref.refName,
                  [x, yBase, z],
                  rotRYP,
                  [1, 1, 1]
                );
              }
            }
          }
        }
      }

      globalAuxIndex++; // mindig léptetjük
    }
  }

  // --- Kapuk a CP-kre (csak ahol cp.style != 0) – lista támogatással ---
  if (cpRefs.length > 0)
  {
    let gateIndex = 0; // hányadik kaput rakjuk le összesen

    for (let i = 0; i < pts.length; i++)
    {
      const cp = pts[i] || { pos: [0, 0, 0], rotRYP: [0, 0, 0], style: 1 };
      if ((cp.style | 0) === 0) continue;

      const p = cp.pos    || [0, 0, 0];
      const r = cp.rotRYP || [0, 0, 0];

      const ref = cpRefs[gateIndex % cpRefs.length];
      gateIndex++;

      addSceneItem(ref.refType, ref.refName, p, r, [1, 1, 1]);
    }
  }

  refreshScnList?.();
  drawScene?.();
  snapshot?.();
  console.info("[Generate] kész.");
}



//----------------------------------

ui.clGenerate.addEventListener("click", generateCurrentControlLine);
//-----------------------------------------



function makeEdgePolyline(points, color)
{
  if (!points || points.length < 2) return null;
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat  = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geom, mat);
}


function drawControlLines_simple()
{
  // Safe-guardok
  if (typeof THREE === "undefined") return;
  if (!clRoot) return;

  // Csak Scene módban vizualizálunk (különben takarítsunk)
  if (ui.mode.value !== "scn")
  {
    clRoot.visible = false;
    clRoot.clear();
    return;
  }
  clRoot.visible = true;

  if (!Array.isArray(store.controlLines)) store.controlLines = [];
  clRoot.clear();

  if (store.controlLines.length === 0) return;

  store.controlLines.forEach((cl, lineIdx) =>
  {
    if (!cl || cl.hidden) return;

    const radius      = Number.isFinite(cl.radius)      ? cl.radius      : 0.8;
    const showAux     = !!cl.showAux;
    const startOffset = Number.isFinite(cl.startOffset) ? cl.startOffset : 0;
    const dL          = Number.isFinite(cl.dL)          ? cl.dL          : 1;

    const parent = new THREE.Group();
    parent.userData = { pickKind: "cl", index: lineIdx };

    // --- CP-k kirajzolása ---
    const pts = Array.isArray(cl.points) ? cl.points : [];
    for (let i = 0; i < pts.length; i++)
    {
      const cp = pts[i] || { pos: [0, 0, 0], rotRYP: [0, 0, 0], iw: 0, ow: 0 };

      // CP tartó: EZZEL pickelünk a listában is
      const node  = new THREE.Group();
      const gizmo = makeCPGizmo(cp, radius, i + 1, cl.showRadius);
      node.add(gizmo);

      node.userData = {
        pickKind:  "cp",
        lineIdx,
        pointIdx:  i,
        cpCenterBox: gizmo.userData?.cpCenterBox || null,
      };

      const p = cp.pos    || [0, 0, 0];
      const r = cp.rotRYP || [0, 0, 0];
      node.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
      node.rotation.set(deg(r[0] || 0), deg(r[1] || 0), deg(r[2] || 0));

      parent.add(node);
    }

    // --- Segédpontok dL lépéssel (egyszerű szegmens-interpoláció) ---
    if (showAux && pts.length >= 2 && dL > 0)
    {
      const gen = computeGeneratedPoints(cl); // közös motor!

      const rightPts = [];
      const leftPts  = [];
      const downPts  = [];

      for (const g of gen)
      {
        const isActive = g.active === true;
        const rr       = isActive ? radius : 0; // ha majd lineStyle==0, itt lesz 0 a sugár

        const giz = makeAuxGizmo(isActive ? 0.09 : 0.06, rr);
        giz.position.set(g.pos[0], g.pos[1], g.pos[2]);

        const q = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);
        giz.quaternion.copy(q);

        parent.add(giz);

        // Ha az adott szakasz stílusa "inaktív" (rr=0 / !active),
        // akkor a széleket se kössük össze ezen a ponton
        if (!isActive || rr <= 0) continue;

        // Bázis pont
        const base = new THREE.Vector3(g.pos[0], g.pos[1], g.pos[2]);

        // Jobb oldal (Z-)
        {
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).multiplyScalar(radius);
          rightPts.push(base.clone().add(dir));
        }

        // Bal oldal (Z+)
        {
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(radius);
          leftPts.push(base.clone().add(dir));
        }

        // Alsó (Y-) – csak ha showRadius igaz (kört is rajzolunk)
        if (cl.showRadius)
        {
          const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(q).multiplyScalar(radius);
          downPts.push(base.clone().add(dir));
        }
      }

      // Szélek összekötése:
      const rightLine = makeEdgePolyline(rightPts, COLOR_RIGHTMZ); // jobb oldali piros
      if (rightLine) parent.add(rightLine);

      const leftLine = makeEdgePolyline(leftPts, COLOR_LEFTPZ);    // bal oldali kék
      if (leftLine) parent.add(leftLine);

      if (cl.showRadius)
      {
        const downLine = makeEdgePolyline(downPts, COLOR_DOWN);    // alsó fekete
        if (downLine) parent.add(downLine);
      }
    }

    clRoot.add(parent);
  });
}






let DrawMode = 0; 


ui.clDrawMode.addEventListener("change", () =>
{

  DrawMode = Number(ui.clDrawMode.value) || 0;
  console.log("Drawmode: ",DrawMode);
  drawControlLines();

});



function drawControlLines()
{
  if(DrawMode === 0){drawControlLines_simple();}
  else if(DrawMode === 1){drawControlLines_all();}
  else
  {
     console.warn('[drawControlLines] Ismeretlen DrawMode:', DrawMode);
  }

}




function drawControlLines_all()
{
  if (typeof THREE === "undefined") return;
  if (!clRoot) return;

  if (ui.mode.value !== "scn")
  {
    clRoot.visible = false;
    clRoot.clear();
    return;
  }
  clRoot.visible = true;

  if (!Array.isArray(store.controlLines)) store.controlLines = [];
  clRoot.clear();
  if (store.controlLines.length === 0) return;

  const deg = a => a * Math.PI / 180;

  store.controlLines.forEach((cl, lineIdx) =>
  {
    if (!cl || cl.hidden) return;

    const radius      = Number.isFinite(cl.radius)      ? cl.radius      : 0.8;
    const showAux     = !!cl.showAux;
    const startOffset = Number.isFinite(cl.startOffset) ? cl.startOffset : 0;
    const dL          = Number.isFinite(cl.dL)          ? cl.dL          : 1;

    const parent = new THREE.Group();
    parent.userData = { pickKind: "cl", index: lineIdx };

    // --- CP-k kirajzolása ---
    const pts = Array.isArray(cl.points) ? cl.points : [];
    for (let i = 0; i < pts.length; i++)
    {
      const cp = pts[i] || { pos: [0, 0, 0], rotRYP: [0, 0, 0], iw: 0, ow: 0 };
      const node  = new THREE.Group();
      const gizmo = makeCPGizmo(cp, radius, i + 1, cl.showRadius);
      node.add(gizmo);

      node.userData = {
        pickKind:  "cp",
        lineIdx,
        pointIdx:  i,
        cpCenterBox: gizmo.userData?.cpCenterBox || null,
      };

      const p = cp.pos    || [0, 0, 0];
      const r = cp.rotRYP || [0, 0, 0];
      node.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
      node.rotation.set(deg(r[0] || 0), deg(r[1] || 0), deg(r[2] || 0));

      parent.add(node);
    }

    // --- Segédpontok és előnézeti gizmók ---
    if (pts.length >= 2 && dL > 0)
    {
      const gen = computeGeneratedPoints(cl); // közös motor

      const rightPts = [];
      const leftPts  = [];
      const downPts  = [];

      let globalAuxIndex = 0; // decimálás a TELJES vonalra

      for (const g of gen)
      {
        const isActive = g.active === true;
        const rr       = isActive ? radius : 0;

        // AUX gizmó (ha kéred)
        if (showAux)
        {
          const ag = makeAuxGizmo(isActive ? 0.09 : 0.06, rr);
          ag.position.set(g.pos[0], g.pos[1], g.pos[2]);
          const q = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);
          ag.quaternion.copy(q);
          parent.add(ag);
        }

        // ======= SUPPORT ELŐNÉZET – módosított logika =======
        // A szegmens stílusát a KEZDŐ CP adja
        const segStyle = ((pts[g.segIndex]?.lineStyle)|0) || 0;
        const wantMajor = (segStyle >= 2) && !!cl.supportMajorRef;
        const wantMinor = (segStyle >= 3) && !!cl.supportMinorRef;

        // Decimálás (globális aux index)
        const N   = Math.max(1, Number(cl.supportDecimate ?? 1));
        const off = Number(cl.supportDecimateOffset ?? 0);
        const take = ((globalAuxIndex - off) % N + N) % N === 0;

        if (isActive && take && (wantMajor || wantMinor))
        {
          const topOff   = Number(cl.supportTopOffset ?? 0);
          const botOff   = Number(cl.supportBottomOffset ?? 0);
          const Hmaj     = Math.max(0, Number(cl.supportMajorH ?? 0));
          const Hmin     = Math.max(0, Number(cl.supportMinorH ?? 0));
          const rotYonly = !!cl.supportRotate;

          // Függőleges szakasz a padlótól az AUX-ig, offsetekkel
          const auxX = g.pos[0], auxY = g.pos[1], auxZ = g.pos[2];
          const yTop    = auxY - topOff;
          const yBottom = 0    + botOff;
          const Le      = yTop - yBottom;

          if (Le > 0)
          {
            // Yaw beállítása (csak Y körül), a lokális +Z XZ-vetülete szerint
            let qYaw = new THREE.Quaternion(); // identity
            if (rotYonly)
            {
              const qAux = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);
              const Zloc = new THREE.Vector3(0,0,1).applyQuaternion(qAux);
              const Zp   = new THREE.Vector3(Zloc.x, 0, Zloc.z);
              if (Zp.lengthSq() > 1e-8)
              {
                Zp.normalize();
                const Y = new THREE.Vector3(0,1,0);
                const X = new THREE.Vector3().crossVectors(Y, Zp).normalize();
                const M = new THREE.Matrix4().makeBasis(X, Y, Zp);
                qYaw.setFromRotationMatrix(M);
              }
            }

            // --- Majorok alulról felfelé (egész darabok) ---
            let nMaj = 0;
            if (wantMajor && Hmaj > 0) nMaj = Math.floor(Le / Hmaj);

            // Majorok lerakása
            for (let k = 0; k < nMaj; k++)
            {
              const yBase = yBottom + k * Hmaj;
              const giz   = makeSupportGizmo(Hmaj, false);
              giz.position.set(auxX, yBase, auxZ);
              if (rotYonly) giz.quaternion.copy(qYaw);
              parent.add(giz);
            }

            // --- Minorok MOSTANTÓL: a Major-ok TETEJÉTŐL felfelé ---
            // Majorok teteje:
            const yMajorTop = yBottom + nMaj * Hmaj;

            // Fennmaradó hely:
            const R = yTop - yMajorTop;

            if (wantMinor && Hmin > 0 && R > 0)
            {
              const nMin = Math.floor(R / Hmin);
              for (let j = 0; j < nMin; j++)
              {
                const yBase = yMajorTop + j * Hmin;
                const giz   = makeSupportGizmo(Hmin, true);
                giz.position.set(auxX, yBase, auxZ);
                if (rotYonly) giz.quaternion.copy(qYaw);
                parent.add(giz);
              }
            }
          }
        }
        // ======= /SUPPORT ELŐNÉZET =======

        // Oldalélek (ne kössük tovább „nem létező” szakaszba) – a jelenlegi
        // gen-sorrenddel ez rendben van: csak az aktív, sugárral bíró pontokat
        // fűzzük fel; utolsó szegmens végén természetesen lezárul a polyline.
        if (!isActive || rr <= 0) { globalAuxIndex++; continue; }

        const base = new THREE.Vector3(g.pos[0], g.pos[1], g.pos[2]);
        const q = new THREE.Quaternion(g.quat[0], g.quat[1], g.quat[2], g.quat[3]);

        // Jobb (Z-)
        {
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).multiplyScalar(radius);
          rightPts.push(base.clone().add(dir));
        }
        // Bal (Z+)
        {
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(radius);
          leftPts.push(base.clone().add(dir));
        }
        // Alsó (Y-) – ha kérted a sugár-vonalat
        if (cl.showRadius)
        {
          const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(q).multiplyScalar(radius);
          downPts.push(base.clone().add(dir));
        }

        globalAuxIndex++;
      }

      // Szélek összekötése
      const rightLine = makeEdgePolyline(rightPts, COLOR_RIGHTMZ);
      if (rightLine) parent.add(rightLine);

      const leftLine = makeEdgePolyline(leftPts,  COLOR_LEFTPZ);
      if (leftLine) parent.add(leftLine);

      if (cl.showRadius)
      {
        const downLine = makeEdgePolyline(downPts, COLOR_DOWN);
        if (downLine) parent.add(downLine);
      }
    }

    clRoot.add(parent);
  });
}



export function RefreshCL_AAA()
{
    refreshCLList?.();
    //fillCLEditors?.(false);
}




//---------------------------------------------------------------------
// list shitting
//---------------------------------------------------------------------

function getCurrentCL()
{
  if (!Array.isArray(store.controlLines)) return null;
  if (typeof currentCLIndex !== "number") return null;
  if (currentCLIndex < 0 || currentCLIndex >= store.controlLines.length) return null;
  return store.controlLines[currentCLIndex];
}

//-----------------------------------------------------------------
//
//-----------------------------------------------------------------
function renderRefList(ulElem, refArray, onRemoveIndex)
{
  if (!ulElem) return;

  // ürítés
  while (ulElem.firstChild)
  {
    ulElem.removeChild(ulElem.firstChild);
  }

  if (!Array.isArray(refArray)) return;

  refArray.forEach((ref, idx) =>
  {
    const li   = document.createElement("li");

    const btn  = document.createElement("button");
    btn.textContent = "x";
    btn.className   = "btn btn-icon"; // vagy simán "btn"
    btn.type        = "button"; // biztos ami biztos, ne submitolja a formot
    btn.addEventListener("click", (ev) =>
    {
      ev.stopPropagation();
      onRemoveIndex(idx);
    });

    const span = document.createElement("span");
    span.textContent = ` ${ref.refType}:${ref.refName}`;

    // Gomb ELŐL, utána a felirat
    li.appendChild(btn);
    li.appendChild(span);

    ulElem.appendChild(li);
  });
}

function renderCurrentCLRefLists()
{
  const cl = getCurrentCL();

  // ha nincs aktuális CL, ürítsük a listákat
  if (!cl)
  {
    if (ui.clLineRefList)          ui.clLineRefList.innerHTML = "";
    if (ui.clCPRefList)            ui.clCPRefList.innerHTML = "";
    if (ui.clSupportMajorRefList)  ui.clSupportMajorRefList.innerHTML = "";
    if (ui.clSupportMinorRefList)  ui.clSupportMinorRefList.innerHTML = "";
    return;
  }

  // biztosítsuk, hogy a listák legalább üres tömbök legyenek
  cl.lineRefs         = Array.isArray(cl.lineRefs)         ? cl.lineRefs         : [];
  cl.cpRefs           = Array.isArray(cl.cpRefs)           ? cl.cpRefs           : [];
  cl.supportMajorRefs = Array.isArray(cl.supportMajorRefs) ? cl.supportMajorRefs : [];
  cl.supportMinorRefs = Array.isArray(cl.supportMinorRefs) ? cl.supportMinorRefs : [];

  renderRefList(ui.clLineRefList, cl.lineRefs, (idx) =>
  {
    cl.lineRefs.splice(idx, 1);
    renderCurrentCLRefLists();
    snapshot?.();
  });

  renderRefList(ui.clCPRefList, cl.cpRefs, (idx) =>
  {
    cl.cpRefs.splice(idx, 1);
    renderCurrentCLRefLists();
    snapshot?.();
  });

  renderRefList(ui.clSupportMajorRefList, cl.supportMajorRefs, (idx) =>
  {
    cl.supportMajorRefs.splice(idx, 1);
    renderCurrentCLRefLists();
    snapshot?.();
  });

  renderRefList(ui.clSupportMinorRefList, cl.supportMinorRefs, (idx) =>
  {
    cl.supportMinorRefs.splice(idx, 1);
    renderCurrentCLRefLists();
    snapshot?.();
  });
}

//===========================================================
//Add buttons
//==========================================================


  function makeRefFromSelects(typeSel, nameSel)
  {
    const t = typeSel?.value ?? "null";
    const n = nameSel?.value ?? "null";
    if (t === "null" || n === "null") return null;
    return { refType: t, refName: n };
  }



  // Line refs
  ui.clLineRefAdd?.addEventListener("click", () =>
  {
    const cl = getCurrentCL();
    if (!cl) return;

    const ref = makeRefFromSelects(ui.clLineRefType, ui.clLineRefName);
    if (!ref) return;

    cl.lineRefs = Array.isArray(cl.lineRefs) ? cl.lineRefs : [];
    cl.lineRefs.push(ref);

    renderCurrentCLRefLists();
    snapshot?.();
  });


  // CP refs (kapuk)
  ui.clCPRefAdd?.addEventListener("click", () =>
  {
    const cl = getCurrentCL();
    if (!cl) return;

    const ref = makeRefFromSelects(ui.clCPRefType, ui.clCPRefName);
    if (!ref) return;

    cl.cpRefs = Array.isArray(cl.cpRefs) ? cl.cpRefs : [];
    cl.cpRefs.push(ref);

    renderCurrentCLRefLists();
    snapshot?.();
  });


  // Major supports
  ui.clSupportMajorRefAdd?.addEventListener("click", () =>
  {
    const cl = getCurrentCL();
    if (!cl) return;

    const ref = makeRefFromSelects(ui.clSupportMajorRefType, ui.clSupportMajorRefName);
    if (!ref) return;

    cl.supportMajorRefs = Array.isArray(cl.supportMajorRefs) ? cl.supportMajorRefs : [];
    cl.supportMajorRefs.push(ref);

    renderCurrentCLRefLists();
    snapshot?.();
  });


  // Minor supports
  ui.clSupportMinorRefAdd?.addEventListener("click", () =>
  {
    const cl = getCurrentCL();
    if (!cl) return;

    const ref = makeRefFromSelects(ui.clSupportMinorRefType, ui.clSupportMinorRefName);
    if (!ref) return;

    cl.supportMinorRefs = Array.isArray(cl.supportMinorRefs) ? cl.supportMinorRefs : [];
    cl.supportMinorRefs.push(ref);

    renderCurrentCLRefLists();
    snapshot?.();
  });

















//---------------------------------------------------------------------
// A fontosabb CL függvények legyenek elérhetők globálisan is:

window.generateCurrentControlLine = generateCurrentControlLine;
window.drawControlLines = drawControlLines;

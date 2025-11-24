// generator_3d.js
import './gen_state.js';

import {
  gpSelSet,
  grpSelSet,
  scnSelSet,
  clSelSet,
  cpSelSet
} from './gen_state.js';

import {
onSelectionChanged,
clearAllSelections,
setSelection,
toggleSelection,
getPrimaryIndex,
} from './gen_state.js';

import {
  buildPrimitiveMesh
}from './gen_primitives.js';

import {snapshot}from './gen_undo.js';


import {currentCLIndex}from './gen_state.js';
import { worldRoot, gpRoot, grpRoot, scnRoot, clRoot } from './gen_roots.js';
import { refreshCPListHighlight, refreshCPList, syncSceneEditorsFromFirstCP, RefreshCL_AAA} from './gen_controlLines.js';


// Ha valamelyik függvény ControlLine rajzolást hív,
// itt egy “proxy”, ami a CL modulban definiált window.drawControlLines-t hívja:

// ---- Active getters (no currentGP/currentGRP globals) ----
export function getActiveGP()
{
  const gpName = (store?.activeGPName ?? ui?.gpName?.value ?? '').trim();
  return gpName ? store?.gamePrimitives?.[gpName] ?? null : null;
}
export function getActiveGRP()
{
  const grpName = (store?.activeGRPName ?? ui?.grpName?.value ?? '').trim();
  return grpName ? store?.groups?.[grpName] ?? null : null;
}

export const drawControlLines = (...args) =>
{
  if (typeof window.drawControlLines === 'function')
  {
    return window.drawControlLines(...args);
  }
};


function ensureCLLoaded(li) {
  if (typeof loadCL === 'function' && currentCLIndex !== li) {
    loadCL(li); // UI és lista frissül
  }
}

function toggleCPSelection(pi, withCtrl) 
{
  if (withCtrl) {
    if (cpSelSet.has(pi)) cpSelSet.delete(pi); else cpSelSet.add(pi);
  } else {
    cpSelSet.clear(); cpSelSet.add(pi);
  }
  refreshCPListHighlight?.();
  fillScnEditors?.();
  rebuildAllBounds?.();
  snapshot?.();
}


//-----------------------------------------------------------------


if (!store.settings)
{
  store.settings =
  {
    eulerOrder: 'YZX',
  };
}

ui.eulerOrder.value = store.settings.eulerOrder || 'YZX';



ui.eulerOrder.addEventListener('change', () =>
{
  store.settings.eulerOrder = ui.eulerOrder.value || 'XYZ';
  // csak frissítsük a kijelzést:
  refreshEditorsEulerGameDisplay();
});

function refreshEditorsEulerGameDisplay()
{
  console.log("EulerOrder →", ui.eulerOrder.value);
};

//------------------------------------------------------------------


function clearCPEditorsUI()
{
  if (ui.cpStyle)     ui.cpStyle.value     = '';
  if (ui.cpLineStyle) ui.cpLineStyle.value = '';
  if (ui.cpIW)        ui.cpIW.value        = '';
  if (ui.cpOW)        ui.cpOW.value        = '';
}

export function fillCPEditors(focusList = true)
{
  // 1) „első” kijelölt CP index a Set-ből
  
  const cpIndex = getPrimaryIndex('cp');
  if (cpIndex < 0)
  {
    clearCPEditorsUI();
    return;
  }

  // 2) CP objektum kigyűjtése az aktuális Control Line-ból
  // (ha nálad máshol élnek a CP-k, itt igazítsd a hozzáférést)
  const cl = store?.controlLines?.[currentCLIndex];
  const cp = cl?.points?.[cpIndex];

  if (!cp)
  {
    clearCPEditorsUI();
    return;
  }

  // 3) UI mezők feltöltése
  if (ui.cpStyle)      ui.cpStyle.value     = String(cp.style ?? 0);
  if (ui.cpLineStyle)  ui.cpLineStyle.value = String(cp.lineStyle ?? 0);
  if (ui.cpIW)         ui.cpIW.value        = String(cp.iw ?? 0);
  if (ui.cpOW)         ui.cpOW.value        = String(cp.ow ?? 0);

  // 4) Lista kiemelés (opcionális)
  if (focusList && ui.cpList)
  {
    ui.cpList.querySelectorAll('li').forEach((li, i) =>
    {
      li.classList.toggle('sel', i === cpIndex);
    });
  }
}



function applySceneEditorsToSelectedCPs() 
{
  if (currentCLIndex < 0 || cpSelSet.size === 0) return;
  const cl = store.controlLines[currentCLIndex];
  if (!cl || !Array.isArray(cl.points)) return;

  console.debug("SZED1");

  const pos = [ +ui.sPosX.value, +ui.sPosY.value, +ui.sPosZ.value ];
  const ryp = [ +ui.sRoll.value, +ui.sYaw.value, +ui.sPitch.value ];

  cpSelSet.forEach(i => {
    const cp = cl.points[i];
    if (!cp) return;
    cp.pos = [...pos];
    cp.rotRYP = [...ryp];
  });

  //refreshCPList();
  drawControlLines?.();
  snapshot?.();
}





//------------------------------------------------------------------------------------------
// 1) Kövesd a betűgombok állapotát globálisan
const rotKey = {
  KeyQ:false, KeyW:false, KeyE:false,
  KeyA:false, KeyS:false, KeyD:false
};

// Mozgatási tengely választáshoz: X/C/V
const moveAxisKey = {
  KeyX:false, // X tengely mentén
  KeyC:false, // Y tengely mentén (mint a Shift)
  KeyV:false  // Z tengely mentén
};

window.addEventListener("keydown", (e) =>
{
  // if (isEditingContext?.(e)) { return; } // inputmezőkben ne zavarjunk

  if (e.code in rotKey)
  {
    rotKey[e.code] = true;
    // console.log("rot on", e.code);
  }

  if (e.code in moveAxisKey)
  {
    moveAxisKey[e.code] = true;
    // console.log("move axis on", e.code);
  }
});

window.addEventListener("keyup", (e) =>
{
  if (e.code in rotKey)
  {
    rotKey[e.code] = false;
    // console.log("rot off", e.code);
  }

  if (e.code in moveAxisKey)
  {
    moveAxisKey[e.code] = false;
    // console.log("move axis off", e.code);
  }
});

// (opcionális) reset fókuszvesztésnél, hogy ne ragadjon be
window.addEventListener("blur", () =>
{
  for (const k in rotKey) { rotKey[k] = false; }
});
document.addEventListener("visibilitychange", () =>
{
  if (document.visibilityState !== "visible") {
    for (const k in rotKey) { rotKey[k] = false; }
  }
});

// 2) Döntsük el: induláskor rotáció vagy move?
function isRotateGesture(e)
{
  if (e.altKey) { return true; } // az Alt működni fog továbbra is

  // betűgombok: Q/W/E (order szerinti), A/S/D (XYZ szerinti)
  return !!(
    rotKey.KeyQ || rotKey.KeyW || rotKey.KeyE ||
    rotKey.KeyA || rotKey.KeyS || rotKey.KeyD
  );
}




const snapAccum = { x: 0, y: 0, z: 0 };

function resetSnapAccum()
{
  snapAccum.x = 0;
  snapAccum.y = 0;
  snapAccum.z = 0;
}





// 3) startDrag: csak ezt cseréld
function startDrag(e) 
{
  // fontos: a vászonnak legyen fókusza, különben nem jön keyup/keydown
  // canvas.tabIndex = 0; canvas.focus();  // ha szükséges
  isLDragging = true;

  dragMode = isRotateGesture(e) ? 'rotate' : 'move';

  setMouseNDC(e);

  resetSnapAccum();

  raycaster.setFromCamera(mouseNDC, camera);
  lastHit = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, lastHit);
  snapshot(); // drag elején snapshot
}

//-------------------------------------------------------------------------------------------------------



function hasAnySelectionForDrag() 
{
  const m = ui.mode.value;
  if (m === 'gp')  return gpSelSet.size  > 0;
  if (m === 'grp') return grpSelSet.size > 0;
  if (m === 'scn') return (scnSelSet.size > 0) || (cpSelSet.size > 0);
  return false;
}


// ===== THREE setup =====
const canvas = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setPixelRatio(devicePixelRatio);

const scene = new THREE.Scene();

const hemi = new THREE.HemisphereLight(0xffffff, 0x999999, 0.8);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 5, 2);
scene.add(dir);

// --- ÚJ: worldRoot, minden ide kerül ---

//const worldRoot = new THREE.Group();


scene.add(worldRoot);
worldRoot.scale.set(1, 1, -1); // << Z tengely tükrözés

let gridMinor, gridMajor;

function rebuildGrids()
{

  scene.background = new THREE.Color(ui.BGColor.value);

  if (gridMinor) worldRoot.remove(gridMinor);
  if (gridMajor) worldRoot.remove(gridMajor);
  const size = Math.max(10, Math.abs(parseFloat(ui.gridSize.value)) | 0);
  gridMinor = new THREE.GridHelper(
    size,
    size,
    new THREE.Color(ui.minorColor.value),
    new THREE.Color(ui.minorColor.value),
  );
  gridMinor.position.y = 0;
  gridMajor = new THREE.GridHelper(
    size,
    size / 10,
    new THREE.Color(ui.majorColor.value),
    new THREE.Color(ui.majorColor.value),
  );
  gridMajor.position.y = 0.001;
  worldRoot.add(gridMinor);
  worldRoot.add(gridMajor);
}

ui.minorColor.addEventListener("input", rebuildGrids);
ui.majorColor.addEventListener("input", rebuildGrids);
ui.gridSize.addEventListener("change", rebuildGrids);
ui.BGColor.addEventListener("change", rebuildGrids);

const axes = new THREE.AxesHelper(1.5);
axes.position.set(0, 0.01, 0);
axes.scale.z = -1;
scene.add(axes);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
let camState = {
  yaw: Math.PI * 0.25,
  pitch: 0.35,
  dist: 14,
  target: new THREE.Vector3(0, 0, 0),
  yOffset: 0,
};

function updateCamera()
{
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  const cx =
    camState.target.x +
    Math.cos(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
  const cy = camState.yOffset + Math.sin(camState.pitch) * camState.dist;
  const cz =
    camState.target.z +
    Math.sin(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(camState.target.x, camState.target.y, camState.target.z);
  camera.updateProjectionMatrix();
}

//scene.add(scnRoot);
//scene.add(gpRoot, grpRoot, scnRoot);

worldRoot.add(gpRoot, grpRoot, scnRoot, clRoot);

// KIZÁRÓLAG ezekre raycastelünk
const pickRoots = [gpRoot, grpRoot, scnRoot, clRoot];


// Picking & drag
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

let lastX = 0,
    lastY = 0;

let isPanning   = false,
    isOrbiting  = false,
    isLDragging = false,
    dragMode    = null;


const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let lastHit = null; // a delta számításhoz multi-move esetén



export function clearSelections()
{
  gpSelSet.clear();
  grpSelSet.clear();
  scnSelSet.clear();
  
  clSelSet.clear();
  cpSelSet.clear();

  // UI frissítések – nálad ezek a nevek vannak:
  refreshPartListHighlight?.();
  refreshGrpItemListHighlight?.();
  refreshScnListHighlight?.();
  refreshCPListHighlight?.();

  rebuildAllBounds?.();

                        //TODO:
  fillPartEditors?.();  //if GP mode
  fillGrpEditors?.();   //if GRP mode
  fillScnEditors?.();   //if SCN mode
}

// --- BOUNDING BOX HELPEREK: minden a worldRoot alá kerül ---

function getModeRoot() {
  const m = ui.mode.value;
  if (m === 'gp')  return gpRoot;
  if (m === 'grp') return grpRoot;
  // Scene:
  return scnRoot;
}

function getActiveRotAxis()
{
  const m = ui.mode.value;
  if (m === "gp")  return ui.pRotAxis.value;
  if (m === "grp") return ui.gRotAxis.value;
                   return ui.sRotAxis.value;
}

//----------------------------


// KELL: egységes helper-jelölés (hogy biztosan törölni tudjuk)
function markHelper(o)
{
    o.userData._isBoundsHelper = true;
    o.userData.pickable = false;
}

// KELL: minden korábbi keret kiszedése (ne maradjanak „szellemdobozok”)
function clearAllBounds()
{
    // Ha mindent worldRoot alá teszel, ez elég:
    if (typeof worldRoot !== 'undefined' && worldRoot)
    {
        const dead = [];
        worldRoot.traverse(o =>
        {
            if (o?.userData?._isBoundsHelper) dead.push(o);
        });
        dead.forEach(o => o.parent?.remove(o));
        return;
    }

    // Ha nincs worldRoot, takaríts külön gyökerek alatt:
    const roots = [gpRoot, grpRoot, scnRoot, (typeof clRoot !== 'undefined' ? clRoot : null)].filter(Boolean);
    roots.forEach(root =>
    {
        const dead = [];
        root.traverse(o =>
        {
            if (o?.userData?._isBoundsHelper) dead.push(o);
        });
        dead.forEach(o => o.parent?.remove(o));
    });
}


function computeLocalBounds(o)
{
    const box = new THREE.Box3();
    let has = false;

    o.traverse(child =>
    {
        if (!child.isMesh || !child.geometry) return;

        const geom = child.geometry;
        if (!geom.boundingBox)
        {
            geom.computeBoundingBox();
        }
        const bb = geom.boundingBox;
        if (!bb) return;

        // child.matrix: child lokál -> o lokál
        const bbChild = bb.clone().applyMatrix4(child.matrix);

        if (!has)
        {
            box.copy(bbChild);
            has = true;
        }
        else
        {
            box.union(bbChild);
        }
    });

    return has ? box : null;
}


function computeLocalBoundsFor(o)
{
    const box = new THREE.Box3();
    let has = false;

    const mAccum = new THREE.Matrix4();

    o.traverse(child =>
    {
        if (!child.isMesh || !child.geometry) return;

        const geom = child.geometry;
        if (!geom.boundingBox)
        {
            geom.computeBoundingBox();
        }
        const bb = geom.boundingBox;
        if (!bb) return;

        // 1) bounding box a child SAJÁT lokál terében
        const bbInO = bb.clone();

        // 2) child lokál -> o lokál:
        //    csak a .matrix láncot gyűjtjük child-tól o-ig (o saját mátrixát NEM!)
        mAccum.identity();
        let n = child;
        while (n && n !== o)
        {
            mAccum.premultiply(n.matrix);  // n.matrix * ... * child.matrix
            n = n.parent;
        }

        bbInO.applyMatrix4(mAccum);

        if (!has)
        {
            box.copy(bbInO);
            has = true;
        }
        else
        {
            box.union(bbInO);
        }
    });

    return has ? box : null;
}




export function rebuildAllBounds()
{
    // 0) takarítás
    clearAllBounds();

    // ha ki van kapcsolva a megjelenítés, lépjünk ki
    const show = (ui.groupBoundsVis?.value === 'on');
    if (!show)
    {
        return;
    }

    // 1) szülő (aktív mód gyökere)
    const mode   = ui.mode.value;
    const parent = getModeRoot(); // gpRoot, grpRoot, scnRoot
    if (!parent)
    {
        return;
    }

    parent.updateMatrixWorld(true);
    const parentWorldInv = parent.matrixWorld.clone().invert();

    // segéd: egy adott userData kiválasztott-e az aktuális módban
    function isSelectedUd(ud)
    {
        if (!ud) return false;
        if (mode === 'gp'  && ud.pickKind === 'gpPart')  return gpSelSet.has(ud.index);
        if (mode === 'grp' && ud.pickKind === 'grpItem') return grpSelSet.has(ud.index);
        if (mode === 'scn' && ud.pickKind === 'scnItem') return scnSelSet.has(ud.index);
        return false;
    }

   const selectedNodes = [];

parent.traverse(o =>
{
    const ud = o?.userData;
    if (!ud) return;

    const pk = ud.pickKind;
    if (pk !== 'gpPart' && pk !== 'grpItem' && pk !== 'scnItem') return;
    if (o.visible === false) return;

    const selected = isSelectedUd(ud);

    // Scene módban csak a kijelölt scene-itemekre rajzoljunk keretet
    if (pk === 'scnItem' && !selected)
    {
        return;
    }

    // Union kerethez eltesszük a kijelölteket
    if (selected)
    {
        selectedNodes.push(o);
    }

    // 1) Lokális bounding box a fenti függvényünkkel
    const boxLocal = computeLocalBoundsFor(o);
    if (!boxLocal) return;

    // 2) Kis keret – O lokál terében, az objektumhoz csatolva
    const color    = selected ? 0xff3333 : 0xffff00; // piros / citromsárga
    const smallBox = new THREE.Box3Helper(boxLocal, color);
    markHelper(smallBox);

    // NINCS saját mátrix buherálás, NINCS matrixAutoUpdate = false
    // egyszerűen gyerek:
    o.add(smallBox);

    // 3) Tengely-hossz a lokális box méretéből
    const size = new THREE.Vector3();
    boxLocal.getSize(size);
    const maxSize      = Math.max(size.x, size.y, size.z) || 1;
    const axisLenLocal = maxSize * 1.5;

    if (selected)
    {
        // 3/a) Lokális tengely – O lokál terében
        const axesLocal = new THREE.AxesHelper(axisLenLocal);
        markHelper(axesLocal);
        o.add(axesLocal);

        // 3/b) Globális tengely – csak ha NINCS bepipálva a localMove
        const useLocalMove = !!ui.localMove?.checked;
        if (!useLocalMove)
        {
            const axisLenGlobal = axisLenLocal * 1.1;

            const axesGlobal = new THREE.AxesHelper(axisLenGlobal);
            markHelper(axesGlobal);

            // Objektum origó világban
            const posW = new THREE.Vector3();
            o.getWorldPosition(posW);

            // Parent lokál (gpRoot/grpRoot/scnRoot)
            const posParent = posW.clone().applyMatrix4(parentWorldInv);

            axesGlobal.position.copy(posParent);
            parent.add(axesGlobal);
        }
    }
});

    // 3) Kijelölt CP-k piros keretei (ez maradhat, ahogy nálad volt)

    let cpNodesForHull = []; // csak akkor tesszük be a unionba, ha ugyanazon szülő alatt vannak
    if (typeof clRoot !== 'undefined' && currentCLIndex >= 0 && cpSelSet?.size > 0)
    {
        const cpParent = clRoot;
        cpParent.updateMatrixWorld(true);
        const cpParentInv = cpParent.matrixWorld.clone().invert();

        const wanted = new Set([...cpSelSet].map(i => `${currentCLIndex}:${i}`));
        const foundCpNodes = [];

        cpParent.traverse(o =>
        {
            const ud = o?.userData;
            if (!ud || ud.pickKind !== 'cp') return;
            if (o.visible === false) return;

            const key = `${ud.lineIdx}:${ud.pointIdx}`;
            if (!wanted.has(key)) return;

            // ha van cpCenterBox, csak azt vegyük a kerethez
            const target = (ud.cpCenterBox instanceof THREE.Object3D)
                ? ud.cpCenterBox
                : o;

            // világ → CP-szülő lokál
            const boxW = new THREE.Box3().setFromObject(target);
            const boxL = boxW.clone().applyMatrix4(cpParentInv);

            const helper = new THREE.Box3Helper(boxL, 0xff3333);
            markHelper(helper);
            cpParent.add(helper);

            foundCpNodes.push(o);
        });

        // csak akkor vesszük bele a CP-ket a nagy „union” keretbe,
        // ha a CP-k ugyanazon parent alatt vannak, mint az aktív kiválasztottak
        if (cpParent === parent)
        {
            cpNodesForHull = foundCpNodes;
        }
    }

    // 4) Összesítő (union) keret a teljes kiválasztott halmaz köré (narancs)
    const hullCandidates = selectedNodes.concat(cpNodesForHull);

    // GP módban NINCS szükség narancssárga union keretre? -> ha mégis kell, vedd ki ezt a feltételt
    if (mode !== 'gp' && hullCandidates.length >= 2)
    {
        let unionL = null;

        hullCandidates.forEach(n =>
        {
            const boxLocal = computeLocalBounds(n);
            if (!boxLocal) return;

            // local -> parent lokál: parentInv * n.matrixWorld
            const m = new THREE.Matrix4().multiplyMatrices(parentWorldInv, n.matrixWorld);
            const boxInParent = boxLocal.clone().applyMatrix4(m);

            unionL = unionL ? unionL.union(boxInParent) : boxInParent;
        });

        if (unionL && !unionL.isEmpty())
        {
            const hull = new THREE.Box3Helper(unionL, 0xff9900); // narancs
            markHelper(hull);
            parent.add(hull);
        }
    }




}





//-------------

ui.groupBoundsVis.addEventListener("change", () =>
{
  console.log("groupBoundsVis →", ui.groupBoundsVis.value);

  drawGPPreview();
  drawGRPPreview();
  drawScene();
});



// a kurzor vásznon belüli pozícióját átszámolja Normalized Device Coordinates-re (NDC), 
// azaz a [-1, +1] × [-1, +1] tartományba. Ezt használja a Three.js/WebGL raycaster és sok kamera-/inputlogika.

function setMouseNDC(evt)
{
  const r = canvas.getBoundingClientRect();
  
  mouseNDC.x = ((evt.clientX - r.left) / r.width) * 2 - 1;
  mouseNDC.y = -((evt.clientY - r.top) / r.height) * 2 + 1;
}

function pick(evt) 
{
  setMouseNDC(evt);
  raycaster.setFromCamera(mouseNDC, camera);

  const meshes = [];
  pickRoots.forEach(root => root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); }));

  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;

  let o = hits[0].object;
  while (o && !o.userData?.pickKind && o.parent) o = o.parent;
  if (!o) return null;

  const kind = o.userData.pickKind;
  if (kind === 'grpItem' || kind === 'scnItem') 
  {
    // sétálj a legfelső azonos pickKind-ig
    while (o.parent && o.parent.userData && o.parent.userData.pickKind === kind) {
      o = o.parent;
    }
  }
  return o;
}

function togglePickSelection(obj)
{
  if (!obj) return;
  const mode = ui.mode.value;
  const idx = obj.userData.index;
  if (mode === "gp")
  {
    if (gpSelSet.has(idx)) gpSelSet.delete(idx);
    else gpSelSet.add(idx);
    refreshPartListHighlight();
    fillPartEditors?.();
  }
  if (mode === "grp")
  {
    if (grpSelSet.has(idx)) grpSelSet.delete(idx);
    else grpSelSet.add(idx);
    refreshGrpItemListHighlight();
    fillGrpEditors?.();
  }
  if (mode === "scn")
  {
    if (scnSelSet.has(idx)) scnSelSet.delete(idx);
    else scnSelSet.add(idx);
    refreshScnListHighlight();
    fillScnEditors?.();
  }

  if (obj.userData.pickKind === 'cp') 
  {
    // váltson át a megfelelő CL-re és jelölje ki a pontot
    if (currentCLIndex !== obj.userData.lineIdx) 
    {
      loadCL(obj.userData.lineIdx);
    }
    const i = obj.userData.pointIdx|0;
    if (e.ctrlKey) { if (cpSelSet.has(i)) cpSelSet.delete(i); else cpSelSet.add(i); }
    else { cpSelSet.clear(); cpSelSet.add(i); }
    refreshCPListHighlight();
    fillCPEditors(false);
    rebuildAllBounds?.();
    fillScnEditors?.();
    return;
  }
}


//----------------------------------------
// GramePrimitive mode
//----------------------------------------
function refreshPartListHighlight()
{
  ui.partList
    .querySelectorAll("li")
    .forEach((li, i) => li.classList.toggle("sel", gpSelSet.has(i)));
}


//----------------------------------------
// GroupEdit mode
//----------------------------------------
function refreshGrpItemListHighlight()
{
  ui.grpItemList
    .querySelectorAll("li")
    .forEach((li, i) => li.classList.toggle("sel", grpSelSet.has(i)));
}

//----------------------------------------
// Scene mode
//----------------------------------------
function refreshScnListHighlight()
{
  ui.scnList
    .querySelectorAll("li")
    .forEach((li, i) => li.classList.toggle("sel", scnSelSet.has(i)));
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

//---------------------------------


function resize()
{
  const rect = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  updateCamera();
}


new ResizeObserver(resize).observe(canvas.parentElement);
rebuildGrids();
resize();
const deg = (v) => (v * Math.PI) / 180;

//---------------------------------


//----------------------------------------------------------------------------
// ---------- Snap + local move helpers ----------

function getSnapConfig()
{
  if (!ui || !ui.snapEnable)
  {
    return { enabled: false, sx: 0, sy: 0, sz: 0 };
  }

  const enabled = !!ui.snapEnable.checked;
  const sx = parseFloat(ui.snapX?.value || '0') || 0;
  const sy = parseFloat(ui.snapY?.value || '0') || 0;
  const sz = parseFloat(ui.snapZ?.value || '0') || 0;

  return { enabled, sx, sy, sz };
}

function snapCoord(v, step)
{
  if (!(step > 0)) return v;
  return Math.round(v / step) * step;
}

function snapPos(pos)
{
  const cfg = getSnapConfig();
  if (!cfg.enabled) return pos;

  const [x, y, z] = pos;
  return [
    snapCoord(x, cfg.sx),
    snapCoord(y, cfg.sy),
    snapCoord(z, cfg.sz),
  ];
}

// dpos: [dx,dy,dz] – ha localMove be van kapcsolva, akkor
// a saját orientáció (rotRYP) szerinti lokális vektorként értelmezzük
function computeWorldDelta(it, dpos)
{
  const useLocal = !!ui.localMove?.checked;
  let [dx, dy, dz] = dpos || [0, 0, 0];

  if (!useLocal || !(dx || dy || dz))
  {
    return [dx, dy, dz];
  }

  const r = it.rotRYP || [0, 0, 0];

  const ex = THREE.MathUtils.degToRad(r[0] || 0);
  const ey = THREE.MathUtils.degToRad(r[1] || 0);
  const ez = THREE.MathUtils.degToRad(r[2] || 0);

  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(ex, ey, ez, "XYZ"),
  );

  const vLocal = new THREE.Vector3(dx, dy, dz);
  const vWorld = vLocal.applyQuaternion(q);

  return [vWorld.x, vWorld.y, vWorld.z];
}

//-----------------------------------------------------------------------------------








export function applyDeltaToSelection({ dpos = [0,0,0], drot = [0,0,0], dscale = [0,0,0] })
{
  const m = ui.mode.value;

// ---------- GP mód: csak GP-partok ----------
  if (m === 'gp')
  {
    const gpName = (store?.activeGPName ?? ui?.gpName?.value ?? '').trim();
    const gp = gpName ? store?.gamePrimitives?.[gpName] : null;
    if (!gp || !Array.isArray(gp.parts)) return;

    gpSelSet.forEach(i =>
    {
      const p = gp.parts[i]; if (!p) return;

      const [dx, dy, dz] = computeWorldDelta(p, dpos);
      const posOld = p.pos || [0, 0, 0];
      
      /*
      const posNew = snapPos([
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ]);*/

      const posNew = [
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ];

      p.pos    = posNew;


      p.rotRYP = [
        (p.rotRYP?.[0] ?? 0) + drot[0],
        (p.rotRYP?.[1] ?? 0) + drot[1],
        (p.rotRYP?.[2] ?? 0) + drot[2],
      ];
      p.scale  = [
        (p.scale?.[0] ?? 1) + dscale[0],
        (p.scale?.[1] ?? 1) + dscale[1],
        (p.scale?.[2] ?? 1) + dscale[2],
      ];
    });

    fillPartEditors?.(false);
    drawGPPreview?.();
    rebuildAllBounds?.();
    snapshot?.();
    return;
  }

  // ---------- GRP mód: csak GRP-itemek ----------
  if (m === 'grp')
  {
    const grpName = (store?.activeGRPName ?? ui?.grpName?.value ?? '').trim();
    const grp = grpName ? store?.groups?.[grpName] : null;
    if (!grp || !Array.isArray(grp.items)) return;

    grpSelSet.forEach(i =>
    {
      const it = grp.items[i]; if (!it) return;

      const [dx, dy, dz] = computeWorldDelta(it, dpos);
      const posOld = it.pos || [0, 0, 0];
      
      
      /*const posNew = snapPos([
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ]);*/

      
      const posNew = [
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ];

      it.pos    = posNew;


      it.rotRYP = [
        (it.rotRYP?.[0] ?? 0) + drot[0],
        (it.rotRYP?.[1] ?? 0) + drot[1],
        (it.rotRYP?.[2] ?? 0) + drot[2],
      ];
      it.scale  = [
        (it.scale?.[0] ?? 1) + dscale[0],
        (it.scale?.[1] ?? 1) + dscale[1],
        (it.scale?.[2] ?? 1) + dscale[2],
      ];
    });

    fillGrpEditors?.(false);
    drawGRPPreview?.();
    rebuildAllBounds?.();
    snapshot?.();
    return;
  }

  // ---------- SCN mód: CP-elsőbbség, különben scene-itemek ----------
  if (m === 'scn')
  {
    // 1) Ha van CP-kijelölés, AZT kezeljük (elsőbbség)
    
 if (cpSelSet.size > 0 && Number.isInteger(currentCLIndex) && currentCLIndex >= 0)
    {
      const cl = store?.controlLines?.[currentCLIndex];
      if (cl && Array.isArray(cl.points))
      {
        cpSelSet.forEach(i =>
        {
          const cp = cl.points[i]; if (!cp) return;

          const [dx, dy, dz] = computeWorldDelta(cp, dpos);
          const posOld = cp.pos || [0, 0, 0];
          
          /*const posNew = snapPos([
            (posOld[0] ?? 0) + dx,
            (posOld[1] ?? 0) + dy,
            (posOld[2] ?? 0) + dz,
          ]);*/
          const posNew = [
            (posOld[0] ?? 0) + dx,
            (posOld[1] ?? 0) + dy,
            (posOld[2] ?? 0) + dz,
          ];

          cp.pos    = posNew;
          cp.rotRYP = [
            (cp.rotRYP?.[0] ?? 0) + drot[0],
            (cp.rotRYP?.[1] ?? 0) + drot[1],
            (cp.rotRYP?.[2] ?? 0) + drot[2],
          ];
          // scale itt továbbra sincs
        });

        syncSceneEditorsFromFirstCP?.();
        drawControlLines?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
      }
    }

    // 2) Különben a Scene-itemek
    scnSelSet.forEach(i =>
    {
      const it = store?.scene?.[i]; if (!it) return;

      const [dx, dy, dz] = computeWorldDelta(it, dpos);
      const posOld = it.pos || [0, 0, 0];
      /*const posNew = snapPos([
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ]);*/
      const posNew = [
        (posOld[0] ?? 0) + dx,
        (posOld[1] ?? 0) + dy,
        (posOld[2] ?? 0) + dz,
      ];

      it.pos    = posNew;
      it.rotRYP = [
        (it.rotRYP?.[0] ?? 0) + drot[0],
        (it.rotRYP?.[1] ?? 0) + drot[1],
        (it.rotRYP?.[2] ?? 0) + drot[2],
      ];
      it.scale  = [
        (it.scale?.[0] ?? 1) + dscale[0],
        (it.scale?.[1] ?? 1) + dscale[1],
        (it.scale?.[2] ?? 1) + dscale[2],
      ];
    });

    fillScnEditors?.(false);
    drawScene?.();          // (CL-ek külön rajzolódnak)
    rebuildAllBounds?.();
    snapshot?.();
  }
}





function refreshGPList()
{
  const activeName = ui?.gpName?.value || ""; // „melyik GP van épp betöltve”
  ui.gpList.innerHTML = "";

  Object.keys(store.gamePrimitives)
    .sort()
    .forEach((name) =>
    {
      const li = document.createElement("li");
      li.textContent = name;

      // Kiemelés: az aktív GP neve alapján (nem currentGP alapján!)
      if (name === activeName) li.classList.add("sel");

      li.onclick = (ev) =>
      {
        if (ev.ctrlKey) return;

        // GP betöltése
        loadGP(name);

        // A GP-n belüli parts-kijelölés (gpSelSet) ürítése – Set az egyetlen igazságforrás
        gpSelSet.clear();
        onSelectionChanged(); // bounds + listák + inspektor frissítése
      };

      ui.gpList.appendChild(li);
    });

  refreshGrpSourceOptions?.();
  refreshScnSourceOptions?.();
}



export function refreshPartList()
{
  ui.partList.innerHTML = "";

  // Aktív GP meghatározása
  const activeName = store?.activeGPName ?? (ui?.gpName?.value || "");
  const gp = activeName ? store?.gamePrimitives?.[activeName] : null;
  if (!gp || !Array.isArray(gp.parts)) return;

  gp.parts.forEach((p, i) =>
  {
    const li = document.createElement("li");
    li.innerHTML = `${i + 1}. ${p.type} ${
      p.hidden ? "<span class=muted>(rejtett)</span>" : ""
    } pos(${p.pos.map((n) => n.toFixed(2)).join(",")})`;

    // Kiemelés a Set alapján
    li.classList.toggle("sel", gpSelSet.has(i));

    li.onclick = (ev) =>
    {
      if (ev.ctrlKey)
      {
        // Többes kijelölés váltása
        toggleSelection('gp', i);
      }
      else
      {
        // Egyetlen kijelölés beállítása
        setSelection('gp', i, /*additive=*/false);
      }

      // Frissítések
      refreshPartListHighlight?.();
      rebuildAllBounds?.();
      fillPartEditors?.();
      drawGPPreview?.();
    };

    ui.partList.appendChild(li);
  });
}


export function drawGPPreview()
{
  gpRoot.clear();

  // Aktív GP kiválasztása: előnyben a store.activeGPName, másodsorban az UI mező.
  const activeName = store?.activeGPName ?? (ui?.gpName?.value || null);
  const gp = activeName ? store?.gamePrimitives?.[activeName] : (getActiveGP());

  if (!gp || !Array.isArray(gp.parts))
  {
    rebuildAllBounds?.();
    return;
  }

  const root = new THREE.Group();

  gp.parts.forEach((p, idx) =>
  {
    const mesh = buildPrimitiveMesh(p);
    mesh.userData = { pickKind: 'gpPart', index: idx };
    mesh.visible = !p.hidden;
    root.add(mesh);

    // --- Kijelölés vizuális jelzése a gpSelSet alapján (opcionális) ---
    
    /*
    if (gpSelSet.has(idx))
    {
      try {
        const box = new THREE.Box3().setFromObject(mesh);
        const helper = new THREE.Box3Helper(box);
        helper.userData = { pickKind: 'none' }; // ne legyen kattintható
        root.add(helper);
      } catch {}
    }*/



  });

  gpRoot.add(root);
  rebuildAllBounds?.();
}

function showArcBoxFor(p)
{
  //const box = $("#pArcBox");
  const box = document.getElementById('pArcBox'); // <- itt a fix
  if (!box) return;
  
  //const on = p.type === "arcCyl";
  // arcCyl és quarterTorus is használja az inner/outer/angle mezőket
  const on = (p.type === "arcCyl") || (p.type === "quarterTorus");
 
  box.style.display = on ? "grid" : "none";
  if (on)
  {
    ui.pInnerR.value = String(p.arc?.inner ?? 0.3);
    ui.pOuterR.value = String(p.arc?.outer ?? 0.5);
    ui.pAngle.value = String(p.arc?.angle ?? 90);
  }
}

function firstSelIndex(set)
{
  for (const i of set) return i;
  return -1;
}

export function fillPartEditors(focus = true)
{

  console.log("[fillPartEditors]");

  // Aktív GP kikeresése
  const activeName = store?.activeGPName ?? (ui?.gpName?.value || "");
  const gp = activeName ? store?.gamePrimitives?.[activeName] : null;
  if (!gp || !Array.isArray(gp.parts))
  {
    // UI mezők feltöltése
    ui.pColor.value   = "#f0f0f0";
    ui.pTypeRO.value  = '';
    ui.pPosX.value    = '';
    ui.pPosY.value    = '';
    ui.pPosZ.value    = '';
    ui.pRoll.value    = '';
    ui.pYaw.value     = '';
    ui.pPitch.value   = '';
    ui.pSx.value      = '';
    ui.pSy.value      = '';
    ui.pSz.value      = '';

    return;
  }
    
  console.log("[fillPartEditors] SZED2");  
    


  // Első (primer) kijelölt part index a Set-ből
  const i = getPrimaryIndex('gp');
  
  if (i < 0 || i >= gp.parts.length)
  {
        // UI mezők feltöltése
    ui.pColor.value   = "#f0f0f0";
    ui.pTypeRO.value  = '';
    ui.pPosX.value    = '';
    ui.pPosY.value    = '';
    ui.pPosZ.value    = '';
    ui.pRoll.value    = '';
    ui.pYaw.value     = '';
    ui.pPitch.value   = '';
    ui.pSx.value      = '';
    ui.pSy.value      = '';
    ui.pSz.value      = '';
    
      return;
  }

  console.log("[fillPartEditors] SZED3");

  const p = gp.parts[i];

  // UI mezők feltöltése
  ui.pColor.value   = p.color;
  ui.pTypeRO.value  = p.type;
  ui.pPosX.value    = p.pos[0];
  ui.pPosY.value    = p.pos[1];
  ui.pPosZ.value    = p.pos[2];
  ui.pRoll.value    = p.rotRYP[0];
  ui.pYaw.value     = p.rotRYP[1];
  ui.pPitch.value   = p.rotRYP[2];
  ui.pSx.value      = p.scale[0];
  ui.pSy.value      = p.scale[1];
  ui.pSz.value      = p.scale[2];

  showArcBoxFor(p);

  if (focus) refreshPartList?.();
}

function loadGP(name)
{
  console.log("Load GP");
  
  const n = String(name || '').trim();
  if (!n)
  { 
    console.log("[loadGP] issue1:",n);
    return;
  }

  if(!store?.gamePrimitives?.[n])
  {
    console.log("[loadGP] issue2:", n);

    // Az összes elérhető GP név
    console.log("[loadGP] keys:",
    Object.keys(store?.gamePrimitives || {}));
    Object.entries(store?.gamePrimitives || {}).forEach(([key, value]) =>{console.log("  GP:", key, " → ", value);});
    return;
  }

  console.log("Load GP #2");

  // Aktív GP beállítása
  store.activeGPName = n;
  console.log("activeGPName",n);

  if (ui?.gpName) ui.gpName.value = n;

  // >>> Itt frissítjük a checkboxot a GP szerint <<<
    // Get GP object by name
  const gp = store.gamePrimitives[n];
  if (ui?.gpScalable){  ui.gpScalable.checked = !!gp.scalable; }

  // Kijelölés törlése és frissítések
  gpSelSet.clear();
  refreshPartList?.();
  drawGPPreview?.();
  refreshGPList?.();
  rebuildAllBounds?.();
}

// Segéd: egyedi név generálása (ha már létezik)
function makeUniqueGPName(base)
{
  let name = base || `GamePrim_${Object.keys(store.gamePrimitives).length + 1}`;
  let k = 1;
  while (store.gamePrimitives[name]) {
    name = `${base}_${++k}`;
  }
  return name;
}

ui.gpNew.addEventListener("click", () =>
{
  // 1) Név eldöntése és egyedivé tétele
  const base = (ui?.gpName?.value || "").trim();
  const name = makeUniqueGPName(base || `GamePrim_${Object.keys(store.gamePrimitives).length + 1}`);
  const scalable = !!ui.gpScalable?.checked;


  // 2) Új GP létrehozása a store-ban
  //store.gamePrimitives[name] = { name, parts: [] };
  store.gamePrimitives[name] = { name, parts: [], scalable};

  // 3) Aktívvá tesszük
  store.activeGPName = name;
  if (ui?.gpName) ui.gpName.value = name;

  // 4) Kijelölés törlése és UI frissítések
  gpSelSet.clear();
  refreshPartList?.();
  drawGPPreview?.();
  refreshGPList?.();
  snapshot?.();
});

ui.gpSave.addEventListener("click", () =>
{
  // 1) Active name and target name
  const oldName = (store?.activeGPName ?? ui?.gpName?.value ?? "").trim();
  if (!oldName) return;

  const gp = store.gamePrimitives[oldName];
  if (!gp) return;

  const newNameInput = (ui?.gpName?.value || "").trim() || oldName;

  // Update scalable flag from UI
  gp.scalable = !!ui.gpScalable?.checked;

  // 2) If rename happens
  if (newNameInput !== oldName)
  {
    const newName = makeUniqueGPName(newNameInput);

    // Rename key in store
    gp.name = newName;
    store.gamePrimitives[newName] = gp;
    delete store.gamePrimitives[oldName];

    store.activeGPName = newName;
    if (ui?.gpName) ui.gpName.value = newName;
  }
  else
  {
    // Only sync name field (if input was empty, oldName remains)
    gp.name = oldName;
  }

  refreshGPList?.();
  snapshot?.();
});

ui.gpDelete.addEventListener("click", () =>
{
  const name = (store?.activeGPName ?? ui?.gpName?.value ?? "").trim();
  if (!name) return;

  if (store.gamePrimitives[name]) {
    delete store.gamePrimitives[name];
  }

  // aktív törlése
  store.activeGPName = "";
  if (ui?.gpName) ui.gpName.value = "";

  // kijelölés törlése + nézet frissítés
  gpSelSet.clear();
  gpRoot.clear?.();
  refreshGPList?.();
  refreshPartList?.();
  drawGPPreview?.();   // üres lesz
  snapshot?.();
});

ui.addPart.addEventListener("click", () =>
{
  // 1) Aktív GP név kiderítése vagy létrehozása
  let name = (store.activeGPName ?? ui?.gpName?.value ?? "").trim();
  if (!name) {
    name = `GamePrim_${Object.keys(store.gamePrimitives).length + 1}`;
  }
  if (!store.gamePrimitives[name]) {
    store.gamePrimitives[name] = { name, parts: [] };
  }
  store.activeGPName = name;
  if (ui?.gpName) ui.gpName.value = name;

  const gp = store.gamePrimitives[name];

  // 2) Új part létrehozása
  const t = ui.partType.value;
  const p = {
    id: crypto.randomUUID(),
    type: t,
    color: "#bdbdbd",
    scale: [1, 1, 1],
    pos: [0, 0, 0],
    rotRYP: [0, 0, 0],
  };
  if (t === "arcCyl") {
    p.arc = { inner: 0.3, outer: 0.5, angle: 90 };
  }

  gp.parts.push(p);
  const newIdx = gp.parts.length - 1;

  // 3) Kijelölés: kizárólag a Set-ekből élünk
  setSelection('gp', newIdx, /*additive=*/false);

  // 4) UI frissítések
  refreshPartList?.();
  fillPartEditors?.();
  drawGPPreview?.();
  snapshot?.();
});

ui.removePart.addEventListener("click", () =>
{
  const __gp = getActiveGP(); if (!__gp || gpSelSet.size === 0) return;
  const sorted = [...gpSelSet].sort((a, b) => b - a);
  sorted.forEach((i) => __gp.parts.splice(i, 1));
  gpSelSet.clear();
  refreshPartList();
  drawGPPreview();
  snapshot();
});

function applyPartNow()
{



  const __gp = getActiveGP(); if (!__gp || gpSelSet.size === 0) return;
  
  gpSelSet.forEach((i) =>
  {
    const p = __gp.parts[i];
    p.color = ui.pColor.value;
    p.pos = [+ui.pPosX.value, +ui.pPosY.value, +ui.pPosZ.value];
    p.rotRYP = [+ui.pRoll.value, +ui.pYaw.value, +ui.pPitch.value];
    p.scale = [+ui.pSx.value, +ui.pSy.value, +ui.pSz.value];
    if (p.type === "arcCyl" || p.type === "quarterTorus")
    {
      const ir = +ui.pInnerR.value;
      const or = +ui.pOuterR.value;
      const ang = +ui.pAngle.value;
      p.arc = {
        inner: Math.max(0, Math.min(ir, or - 1e-4)),
        outer: Math.max(or, ir + 1e-4),
        angle: ang,
      };
    }
  });
  refreshPartList();
  drawGPPreview();
  snapshot();
}


ui.applyPart.addEventListener("click", applyPartNow);
[
  "pColor",
  "pPosX",
  "pPosY",
  "pPosZ",
  "pRoll",
  "pYaw",
  "pPitch",
  "pSx",
  "pSy",
  "pSz",
  "pInnerR",
  "pOuterR",
  "pAngle",
].forEach((id) =>
{
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", applyPartNow);
});

// ===== Group szerkesztő =====


function refreshGrpList()
{
  ui.grpList.innerHTML = "";
  Object.keys(store.groups)
    .sort()
    .forEach((name) =>
    {
      const li = document.createElement("li");
      li.textContent = name;
      if ((store?.activeGRPName ?? ui?.grpName?.value) === name) li.classList.add('sel');
      li.onclick = (ev) =>
      {
        if (ev.ctrlKey) return;
        loadGRP(name);
      };
      ui.grpList.appendChild(li);
    });
  refreshGrpSourceOptions();
  refreshScnSourceOptions();
}

/*
function refreshGrpSourceOptions()
{
  ui.grpAddSource.innerHTML = "";
  const src =
    ui.grpAddType.value === "gp"
      ? Object.keys(store.gamePrimitives)
      : Object.keys(store.groups);
  src.forEach((n) =>
  {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    ui.grpAddSource.appendChild(o);
  });
}
*/
function refreshGrpSourceOptions()
{
  if (!ui.grpAddSource) return;

  ui.grpAddSource.innerHTML = "";

  // Alap lista: vagy GP-k, vagy Groupok – ahogy eddig
  const allNames =
    ui.grpAddType.value === "gp"
      ? Object.keys(store.gamePrimitives)
      : Object.keys(store.groups);

  // Szűrő szöveg (új mező: grpFilter)
  const filter = (ui.grpFilter?.value || "").trim().toLowerCase();

  const src = filter
    ? allNames.filter((n) => n.toLowerCase().includes(filter))
    : allNames;

  src.forEach((n) =>
  {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    ui.grpAddSource.appendChild(o);
  });
}


ui.grpAddType.addEventListener("change", refreshGrpSourceOptions);
ui.grpFilter.addEventListener("input", refreshGrpSourceOptions);



export function refreshGrpItemList()
{
  ui.grpItemList.innerHTML = "";
  if (!getActiveGRP()) return;
  getActiveGRP().items.forEach((it, i) =>
  {
    const li = document.createElement("li");
    li.innerHTML = `${i + 1}. [${it.refType}] ${it.refName} ${
      it.hidden ? "<span class=muted>(rejtett)</span>" : ""
    }`;
    li.classList.toggle("sel", grpSelSet.has(i));
    li.onclick = (ev) =>
    {
      if (ev.ctrlKey)
      {
        if (grpSelSet.has(i)) grpSelSet.delete(i);
        else grpSelSet.add(i);
        refreshGrpItemListHighlight();
        rebuildAllBounds();
      }
      else
      {
        //grpSelSet = new Set([i]);
        grpSelSet.clear();
        grpSelSet.add(i);

        refreshGrpItemListHighlight();
        rebuildAllBounds();
      }
      fillGrpEditors();
      drawGRPPreview();
    };
    ui.grpItemList.appendChild(li);
  });
  drawGRPPreview();
}




// Opcionális: egyedi név generálás
function makeUniqueGRPName(base) {
  let name = base || `Group_${Object.keys(store.groups).length + 1}`;
  let k = 1;
  while (store.groups[name]) name = `${base}_${++k}`;
  return name;
}

//---------------------
// Betöltés
//---------------------
export function loadGRP(name)
{

  console.log("loadGrp",name);

  const n = String(name || '').trim();
  if (!n || !store.groups[n]) return;


  console.log("activeGRPname: ", n);
  store.activeGRPName = n;
  if (ui?.grpName) ui.grpName.value = n;

  grpSelSet.clear();
  refreshGrpItemList?.();
  refreshGrpList?.();
  drawGRPPreview?.();
  rebuildAllBounds?.();
}


//---------------------
// New GRP
//---------------------
ui.grpNew.addEventListener("click", () =>
{
  console.log("GRP new");
  const base = (ui?.grpName?.value || "").trim();
  const name = makeUniqueGRPName(base || `Group_${Object.keys(store.groups).length + 1}`);

  store.groups[name] = { name, items: [] };
  store.activeGRPName = name;
  if (ui?.grpName) ui.grpName.value = name;

  grpSelSet.clear();
  refreshGrpItemList?.();
  refreshGrpList?.();
  drawGRPPreview?.();
  rebuildAllBounds?.();
  snapshot?.();
});


//---------------------
// GRP SAVE/Rename
//---------------------
ui.grpSave.addEventListener("click", () =>
{
  console.log("GRP save");

  const oldName = (store?.activeGRPName ?? ui?.grpName?.value ?? "").trim();
  if (!oldName) return;

  const grp = store.groups[oldName];
  if (!grp) return;

  const desired = (ui?.grpName?.value || "").trim() || oldName;

  if (desired !== oldName) {
    const newName = makeUniqueGRPName(desired);
    grp.name = newName;
    store.groups[newName] = grp;
    delete store.groups[oldName];

    store.activeGRPName = newName;
    if (ui?.grpName) ui.grpName.value = newName;
  } else {
    grp.name = oldName;
  }

  refreshGrpList?.();
  snapshot?.();
});

//---------------------
// GRP delete
//---------------------
ui.grpDelete.addEventListener("click", () =>
{

  console.log("GRP delete whole");
  const name = (store?.activeGRPName ?? ui?.grpName?.value ?? "").trim();
  if (!name) return;

  if (store.groups[name]) delete store.groups[name];

  store.activeGRPName = "";
  if (ui?.grpName) ui.grpName.value = "";

  grpSelSet.clear();
  grpRoot.clear?.();
  rebuildAllBounds?.();
  refreshGrpList?.();
  refreshGrpItemList?.();
  drawGRPPreview?.();
  snapshot?.();
});



//---------------------
// Grp add item
//---------------------

ui.grpAdd.addEventListener("click", () =>
{

  console.log("grp add item");

  const name = (store?.activeGRPName ?? ui?.grpName?.value ?? "").trim();
  
  console.log("aaa:", store.activeGRPName);

  const grp  = name ? store.groups[name] : null;
  if (!grp) return;

    console.log("SZED2 " + name);

  const refType = ui.grpAddType.value;
  const refName = ui.grpAddSource.value;

  const item = {
    refType,
    refName,
    pos:    [0, 0, 0],
    rotRYP: [0, 0, 0],
    scale:  [1, 1, 1],
  };

  grp.items.push(item);
  const newIdx = grp.items.length - 1;

  // KIZÁRÓLAG szám index menjen a Set-be:
  setSelection('grp', newIdx, /*additive=*/false);

  refreshGrpItemList?.();
  drawGRPPreview?.();
  rebuildAllBounds?.();
  snapshot?.();
});


//---------------------
// Elem(ek) eltávolítása
//---------------------

ui.grpRemove.addEventListener("click", () =>
{
    console.log("grp del item");
  const name = (store?.activeGRPName ?? ui?.grpName?.value ?? "").trim();
  const grp  = name ? store.groups[name] : null;
  if (!grp || grpSelSet.size === 0) return;

    console.log("SZED2");

  // Desc sorrendben törlünk, hogy az indexek ne csússzanak
  const sorted = [...grpSelSet].filter(n => Number.isInteger(n)).sort((a, b) => b - a);
  sorted.forEach((i) => { if (i >= 0 && i < grp.items.length) grp.items.splice(i, 1); });

  grpSelSet.clear();
  refreshGrpItemList?.();
  drawGRPPreview?.();
  rebuildAllBounds?.();
  snapshot?.();
});


//=============================================
//
//=============================================

export function fillGrpEditors(focus = true)
{
  if (!getActiveGRP() || grpSelSet.size === 0)
  {
    ui.gPosX.value = '';
    ui.gPosY.value = '';
    ui.gPosZ.value = '';
    ui.gRoll.value = '';
    ui.gYaw.value = '';
    ui.gPitch.value = '';
    ui.gSx.value = '';
    ui.gSy.value = '';
    ui.gSz.value = '';

        return;
  }
    

  const i = firstSelIndex(grpSelSet);
  const it = getActiveGRP().items[i];
  ui.gPosX.value = it.pos[0];
  ui.gPosY.value = it.pos[1];
  ui.gPosZ.value = it.pos[2];
  ui.gRoll.value = it.rotRYP[0];
  ui.gYaw.value = it.rotRYP[1];
  ui.gPitch.value = it.rotRYP[2];
  ui.gSx.value = it.scale[0];
  ui.gSy.value = it.scale[1];
  ui.gSz.value = it.scale[2];
  
  if (focus) refreshGrpItemList();
}


//------------------------------------------------

//------------------------------------------------
function instantiateGP(gp)
{
  if (!gp) return null;
  const root = new THREE.Group();
  gp.parts.forEach((p) =>
  {
    if (p.hidden) return;
    root.add(buildPrimitiveMesh(p));
  });
  return root;
}

function instantiateGroup(grp, pickDepth = 0) {
  if (!grp) return null;
  const root = new THREE.Group();

  grp.items.forEach((it, idx) => {
    const container = new THREE.Group();

    // CSAK az 1. szinten legyen pickelhető konténer
    if (pickDepth === 0) {
      container.userData = { pickKind: 'grpItem', index: idx };
    } else {
      container.userData = container.userData || {};
      container.userData.pickable = false; // mélyebb szinten ne legyen raycast cél
    }

    const node = (it.refType === 'gp')
      ? instantiateGP(store.gamePrimitives[it.refName])
      : instantiateGroup(store.groups[it.refName], pickDepth + 1);

    if (node) container.add(node);
    applyTRS(container, it.pos, it.rotRYP, it.scale);
    container.visible = !it.hidden;
    root.add(container);
  });

  return root;
}


export function drawGRPPreview()
{
  grpRoot.clear();
  if (!getActiveGRP())
  {
    rebuildAllBounds();
    return;
  }
  const group = instantiateGroup(getActiveGRP(),0);
  grpRoot.add(group);
  rebuildAllBounds();
}

function applyGrpNow()
{
  if (!getActiveGRP() || grpSelSet.size === 0) return;
  grpSelSet.forEach((i) =>
  {
    const it = getActiveGRP().items[i];
    it.pos = [+ui.gPosX.value, +ui.gPosY.value, +ui.gPosZ.value];
    it.rotRYP = [+ui.gRoll.value, +ui.gYaw.value, +ui.gPitch.value];
    it.scale = [+ui.gSx.value, +ui.gSy.value, +ui.gSz.value];
  });
  refreshGrpItemList();
  drawGRPPreview();
  snapshot();
}

ui.applyGrpItem.addEventListener("click", applyGrpNow);
[
  "gPosX",
  "gPosY",
  "gPosZ",
  "gRoll",
  "gYaw",
  "gPitch",
  "gSx",
  "gSy",
  "gSz",
].forEach((id) =>
  document.getElementById(id).addEventListener("input", applyGrpNow),
);

// ===== Scene =====
/*
function refreshScnSourceOptions()
{
  ui.scnAddSource.innerHTML = "";
  const src =
    ui.scnAddType.value === "gp"
      ? Object.keys(store.gamePrimitives)
      : Object.keys(store.groups);
  src.forEach((n) =>
  {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    ui.scnAddSource.appendChild(o);
  });
}*/

function refreshScnSourceOptions()
{
  if (!ui.scnAddSource) return;

  ui.scnAddSource.innerHTML = "";

  // Alap lista: vagy GP-k, vagy Groupok – ahogy eddig
  const allNames =
    ui.scnAddType.value === "gp"
      ? Object.keys(store.gamePrimitives)
      : Object.keys(store.groups);

  // Szűrő szöveg (új mező: scnFilter)
  const filter = (ui.scnFilter?.value || "").trim().toLowerCase();

  const src = filter
    ? allNames.filter((n) => n.toLowerCase().includes(filter))
    : allNames;

  src.forEach((n) =>
  {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    ui.scnAddSource.appendChild(o);
  });
}

ui.scnAddType.addEventListener("change", refreshScnSourceOptions);
ui.scnFilter.addEventListener("input", refreshScnSourceOptions);




function refreshScnList()
{
  ui.scnList.innerHTML = "";
  store.scene.forEach((it, i) =>
  {
    const li = document.createElement("li");
    li.innerHTML = `${i + 1}. [${it.refType}] ${it.refName} ${
      it.hidden ? "<span class=muted>(rejtett)</span>" : ""
    }`;
    li.classList.toggle("sel", scnSelSet.has(i));
    li.onclick = (ev) =>
    {
      if (ev.ctrlKey)
      {
        if (scnSelSet.has(i)) scnSelSet.delete(i);
        else scnSelSet.add(i);
        refreshScnListHighlight();
        rebuildAllBounds();
      }
      else
      {
        //scnSelSet = new Set([i]);
        scnSelSet.clear();
        scnSelSet.add(i);

        refreshScnListHighlight();
        rebuildAllBounds();
      }
      fillScnEditors();
      drawScene();
    };
    ui.scnList.appendChild(li);
  });
  drawScene();
}

ui.scnAdd.addEventListener("click", () =>
{
  const refType = ui.scnAddType.value;
  const refName = ui.scnAddSource.value;
  store.scene.push({
    refType,
    refName,
    pos: [0, 0, 0],
    rotRYP: [0, 0, 0],
    scale: [1, 1, 1],
  });
  
  //scnSelSet = new Set([store.scene.length - 1]);
  scnSelSet.clear();
  scnSelSet.add(store.scene.length - 1);
  
  
  refreshScnList();
  snapshot();
});

ui.scnRemove.addEventListener("click", () =>
{
  if (scnSelSet.size === 0) return;
  const sorted = [...scnSelSet].sort((a, b) => b - a);
  sorted.forEach((i) => store.scene.splice(i, 1));
  scnSelSet.clear();
  refreshScnList();
  snapshot();
});

//---------------------------------------------------
function isCPEditingActive()
{
  return ui.mode.value === "scn" && cpSelSet.size > 0;
}





function applySceneEditorsToCPsAbsolute()
{
  if (!isCPEditingActive()) return;
  const P = [+ui.sPosX.value, +ui.sPosY.value, +ui.sPosZ.value];
  const R = [+ui.sRoll.value, +ui.sYaw.value, +ui.sPitch.value];

  cpSelSet.forEach((key) =>
  {
    const [li, pi] = key.split(":").map((n) => +n);
    const cl = store.controlLines[li];
    if (!cl) return;
    const cp = cl.points[pi];
    if (!cp) return;
    cp.pos = [P[0], P[1], P[2]];
    cp.rotRYP = [R[0], R[1], R[2]];
  });
  drawControlLines();
}

//---------------------------------------------------

export function fillScnEditors(focus = true)
{

  if (
  (scnSelSet.size === 0) &&
  (currentCLIndex < 0 || cpSelSet.size === 0)
  )
  {
    if (ui.sPosX)   ui.sPosX.value = '';
    if (ui.sPosY)   ui.sPosY.value = '';
    if (ui.sPosZ)   ui.sPosZ.value = '';
    if (ui.sRoll)   ui.sRoll.value = '';
    if (ui.sYaw)    ui.sYaw.value = '';
    if (ui.sPitch)  ui.sPitch.value = '';
    if (ui.sSx)     ui.sSx.value = '';
    if (ui.sSy)     ui.sSy.value = '';
    if (ui.sSz)     ui.sSz.value = '';

    if (focus)
    {
      refreshScnList();
    }
    return;
  }

  if((currentCLIndex > 0 || cpSelSet.size !== 0)){
    syncSceneEditorsFromFirstCP?.();
    return;
  }

  const i = firstSelIndex(scnSelSet);
  const it = store.scene[i];
  
  ui.sPosX.value = it.pos[0];
  ui.sPosY.value = it.pos[1];
  ui.sPosZ.value = it.pos[2];
  ui.sRoll.value = it.rotRYP[0];
  ui.sYaw.value = it.rotRYP[1];
  ui.sPitch.value = it.rotRYP[2];
  ui.sSx.value = it.scale[0];
  ui.sSy.value = it.scale[1];
  ui.sSz.value = it.scale[2];
  
  if (focus) refreshScnList();
}

function applyTRS(obj, pos, rotRYP, scale)
{
  obj.position.set(pos[0], pos[1], pos[2]);
  obj.rotation.set(deg(rotRYP[0]), deg(rotRYP[1]), deg(rotRYP[2]));
  obj.scale.set(scale[0], scale[1], scale[2]);
}

function drawScene() {
  scnRoot.clear();
  store.scene.forEach((it, idx) => {
    const container = new THREE.Group();
    container.userData = { pickKind: 'scnItem', index: idx };

    const node = (it.refType === 'gp')
      ? instantiateGP(store.gamePrimitives[it.refName])
      : instantiateGroup(store.groups[it.refName], /* pickDepth: */ 1); // nested: ne legyen pickelhető

    if (node) container.add(node);
    applyTRS(container, it.pos, it.rotRYP, it.scale);
    container.visible = !it.hidden;
    scnRoot.add(container);
  });
  rebuildAllBounds();
}

function applySceneNow()
{
  // ÚJ: ha CP szerkesztés aktív, a Scene mezők értékeit CP-kre írjuk
  if (isCPEditingActive())
  {
    applySceneEditorsToCPsAbsolute();
    snapshot();
    return;
  }

  // --- marad ---
  if (scnSelSet.size === 0) return;
  scnSelSet.forEach((i) =>
  {
    const it = store.scene[i];
    if (!it) return;
    it.pos = [+ui.sPosX.value, +ui.sPosY.value, +ui.sPosZ.value];
    it.rotRYP = [+ui.sRoll.value, +ui.sYaw.value, +ui.sPitch.value];
    it.scale = [+ui.sSx.value, +ui.sSy.value, +ui.sSz.value];
  });
  refreshScnList();
  drawScene();
  snapshot();
}

ui.applySceneItem.addEventListener("click", applySceneNow);

['sPosX','sPosY','sPosZ','sRoll','sYaw','sPitch'].forEach(id => 
{
  document.getElementById(id).addEventListener('input', () => {
    if (cpSelSet.size > 0) { applySceneEditorsToSelectedCPs(); }
    else { applySceneNow(); } // régi működés: Scene itemekre
  });
});

// scale mezők továbbra is Scene itemekre menjenek
['sSx','sSy','sSz'].forEach(id => {
  document.getElementById(id).addEventListener('input', applySceneNow);
});




//---------------------------------------------------
// Advanced group rotation – selection-pivot, no globals
//---------------------------------------------------

function getModeAndSelection()
{
    const m = ui.mode.value;

    if (m === "gp")
    {
        const gp = getActiveGP?.();
        if (!gp) { return null; }
        return { mode: "gp", arr: gp.parts ?? [], sel: gpSelSet };
    }

    if (m === "grp")
    {
        const grp = getActiveGRP?.();
        if (!grp) { return null; }
        return { mode: "grp", arr: grp.items ?? [], sel: grpSelSet };
    }

    // scn
    return { mode: "scn", arr: store.scene ?? [], sel: scnSelSet };
}

function setTRSFromEulerDeg(target, posV3, eulerDeg, scaleArr)
{
    target.pos = [posV3.x, posV3.y, posV3.z];
    target.rotRYP = [eulerDeg.x, eulerDeg.y, eulerDeg.z];
    if (scaleArr) { target.scale = [...scaleArr]; }
}



function rotateSelectionAroundPivot(axisChar, dAngDeg)
{
    const ctx = getModeAndSelection();
    if (!ctx) { return; }

    const { arr, sel, mode } = ctx;
    if (!sel || sel.size === 0) { return; }

    // Egyetlen kijelölt → marad a régi "drot" viselkedés
    if (sel.size === 1)
    {
        const drot =
            axisChar === "X"
                ? [dAngDeg, 0, 0]
                : axisChar === "Y"
                    ? [0, dAngDeg, 0]
                    : [0, 0, dAngDeg];

        applyDeltaToSelection?.({ drot });
        return;
    }

    // Pivot: az ELSŐ kijelölt (Set insertion order)
    const pivotIdx = firstSelIndex(sel);
    if (pivotIdx < 0 || pivotIdx >= arr.length) { return; }

    const pivot = arr[pivotIdx];

    // Pivot pozíció és orientáció
    const P = new THREE.Vector3(pivot.pos[0], pivot.pos[1], pivot.pos[2]);
    const pivEuler = new THREE.Euler(
        THREE.MathUtils.degToRad(pivot.rotRYP[0]),
        THREE.MathUtils.degToRad(pivot.rotRYP[1]),
        THREE.MathUtils.degToRad(pivot.rotRYP[2]),
        "XYZ"
    );
    const Qp = new THREE.Quaternion().setFromEuler(pivEuler);

    // Lokális tengely → világ tengely
    const axisLocal =
        axisChar === "X"
            ? new THREE.Vector3(1, 0, 0)
            : axisChar === "Y"
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(0, 0, 1);

    const A = axisLocal.clone().applyQuaternion(Qp).normalize();

    // Elfordítás a világ-tengely körül, pivot ponton át
    const angRad = THREE.MathUtils.degToRad(dAngDeg);
    const Qrot = new THREE.Quaternion().setFromAxisAngle(A, angRad);

    // Kijelöltek frissítése
    sel.forEach((i) =>
    {
        const it = arr[i];
        if (!it) { return; }

        // 1) Pozíció: v' = R*v, pos' = P + v'
        const pos = new THREE.Vector3(it.pos[0], it.pos[1], it.pos[2]);
        const v = pos.clone().sub(P).applyQuaternion(Qrot);
        const posNew = P.clone().add(v);

        // 2) Orientáció: Qn = Qrot * Qo (pre-mult, világ-tengely)
        const eul = new THREE.Euler(
            THREE.MathUtils.degToRad(it.rotRYP[0]),
            THREE.MathUtils.degToRad(it.rotRYP[1]),
            THREE.MathUtils.degToRad(it.rotRYP[2]),
            "XYZ"
        );
        const Qo = new THREE.Quaternion().setFromEuler(eul);
        const Qn = Qrot.clone().multiply(Qo);

        const eNew = new THREE.Euler().setFromQuaternion(Qn, "XYZ");

        // 3) Beírás
        setTRSFromEulerDeg(
            it,
            posNew,
            {
                x: THREE.MathUtils.radToDeg(eNew.x),
                y: THREE.MathUtils.radToDeg(eNew.y),
                z: THREE.MathUtils.radToDeg(eNew.z)
            },
            it.scale
        );
    });

    // UI / nézet frissítés
    if (mode === "gp")
    {
        fillPartEditors?.(false);
        refreshPartList?.();
        drawGPPreview?.();
    }
    else if (mode === "grp")
    {
        fillGrpEditors?.(false);
        refreshGrpItemList?.();
        drawGRPPreview?.();
    }
    else
    {
        fillScnEditors?.(false);
        refreshScnList?.();
        drawScene?.();
    }

    rebuildAllBounds?.();
    snapshot?.();
}




//-----------------------------------------------

function applyMode()
{
  const m = ui.mode.value;
  const isGP  = (m === 'gp');
  const isGRP = (m === 'grp');
  const isSCN = (m === 'scn');

    console.log("Edit mód váltás →", ui.mode.value);

  ui.gpPane.style.display  = isGP  ? 'block' : 'none';
  ui.grpPane.style.display = isGRP ? 'block' : 'none';
  ui.scnPane.style.display = isSCN ? 'block' : 'none';
  if (ui.clPane) ui.clPane.style.display = isSCN ? 'block' : 'none';

  gpRoot.visible  = isGP;
  grpRoot.visible = isGRP;
  scnRoot.visible = isSCN;
  if (typeof clRoot !== 'undefined') clRoot.visible = isSCN;

  if (isGP)  { drawGPPreview?.(); }
  if (isGRP) { drawGRPPreview?.(); }
  if (isSCN) {
    drawScene?.();
    drawControlLines?.();
  }

  rebuildAllBounds?.();

  if (isSCN && typeof cpSelSet !== 'undefined' && cpSelSet.size > 0) {
    fillScnEditors?.();
    syncCPMetaEditorsFromFirst?.();
  }
}

ui.mode.addEventListener("change", applyMode);

//---------------------------------------------------------------



// ===== Seed demo =====

function seedDemoPopulate()
{

}

function tick()
{
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.updateCamera = updateCamera;
window.drawScene    = drawScene;
window.tick         = tick;

window.seedDemoPopulate         = seedDemoPopulate;
window.refreshGPList            = refreshGPList;
window.refreshGrpList           = refreshGrpList;
window.refreshScnSourceOptions  = refreshScnSourceOptions;
window.applyMode                = applyMode;
window.refreshScnList           = refreshScnList;




//------------------------------------------------------

// order: pl. 'XYZ','YXZ', stb. ; which: 0 (első), 1 (második), 2 (harmadik); dAngDeg: fok
function applyDeltaToSelectionByOrder(order, which, dAngDeg, dposLocal = [0, 0, 0])
{
    const m = ui.mode.value;

    // ---- segédek ----
    order = (order || "XYZ").toUpperCase();
    if (!/^[XYZ]{3}$/.test(order)) { order = "XYZ"; }
    which = Math.max(0, Math.min(2, which|0));

    const propOf = (ch) => (ch === "X" ? "x" : (ch === "Y" ? "y" : "z"));
    const axisProp = propOf(order[which]);
    const toRad = THREE.MathUtils.degToRad;
    const toDeg = THREE.MathUtils.radToDeg;

    function applyOne(it)
    {
        if (!it) { return; }

        // 1) jelenlegi orientáció (XYZ) -> kvaternió
        const exyz = new THREE.Euler(
            toRad(it.rotRYP?.[0] ?? 0),
            toRad(it.rotRYP?.[1] ?? 0),
            toRad(it.rotRYP?.[2] ?? 0),
            "XYZ"
        );
        const q = new THREE.Quaternion().setFromEuler(exyz);

        // 2) kvaternió -> választott sorrendű euler
        const eOrd = new THREE.Euler().setFromQuaternion(q, order);

        // 3) kiválasztott sorrend-komponens növelése
        if (dAngDeg)
        {
            eOrd[axisProp] += toRad(dAngDeg);
        }

        // 4) vissza kvaternió, majd XYZ-be
        const qNew = new THREE.Quaternion().setFromEuler(eOrd, order);
        const eNewXYZ = new THREE.Euler().setFromQuaternion(qNew, "XYZ");

        // 5) pozíció – saját tengelyek menti elmozdítás (dposLocal az order 1/2/3 tengelyeire értendő)
        if (dposLocal && (dposLocal[0] || dposLocal[1] || dposLocal[2]))
        {
            // order -> lokális XYZ komponensek
            const axes = order.split(""); // pl. ['Y','X','Z']
            const localXYZ = { X:0, Y:0, Z:0 };
            localXYZ[axes[0]] += (dposLocal[0] || 0);
            localXYZ[axes[1]] += (dposLocal[1] || 0);
            localXYZ[axes[2]] += (dposLocal[2] || 0);

            // lokális -> világ (az ÚJ orientációval)
            const vLocal = new THREE.Vector3(localXYZ.X, localXYZ.Y, localXYZ.Z);
            const vWorld = vLocal.applyQuaternion(qNew);

            const px = (it.pos?.[0] ?? 0) + vWorld.x;
            const py = (it.pos?.[1] ?? 0) + vWorld.y;
            const pz = (it.pos?.[2] ?? 0) + vWorld.z;
            it.pos = [px, py, pz];
        }

        // 6) visszaírás XYZ-ben
        it.rotRYP = [ toDeg(eNewXYZ.x), toDeg(eNewXYZ.y), toDeg(eNewXYZ.z) ];
    }

    // ---------- GP mód ----------
    if (m === "gp")
    {
        const gpName = (store?.activeGPName ?? ui?.gpName?.value ?? "").trim();
        const gp = gpName ? store?.gamePrimitives?.[gpName] : null;
        if (!gp || !Array.isArray(gp.parts)) { return; }

        gpSelSet.forEach((i) => applyOne(gp.parts[i]));

        fillPartEditors?.(false);
        drawGPPreview?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }

    // ---------- GRP mód ----------
    if (m === "grp")
    {
        const grpName = (store?.activeGRPName ?? ui?.grpName?.value ?? "").trim();
        const grp = grpName ? store?.groups?.[grpName] : null;
        if (!grp || !Array.isArray(grp.items)) { return; }

        grpSelSet.forEach((i) => applyOne(grp.items[i]));

        fillGrpEditors?.(false);
        drawGRPPreview?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }

    // ---------- SCN mód ----------
    if (m === "scn")
    {
        // 1) CP-k elsőbbsége
        if (cpSelSet.size > 0 && Number.isInteger(currentCLIndex) && currentCLIndex >= 0)
        {
            const cl = store?.controlLines?.[currentCLIndex];
            if (cl && Array.isArray(cl.points))
            {
                cpSelSet.forEach((i) => applyOne(cl.points[i]));
                fillScnEditors?.();
                drawControlLines?.();
                rebuildAllBounds?.();
                snapshot?.();
                return;
            }
        }

        // 2) Scene-itemek
        scnSelSet.forEach((i) => applyOne(store?.scene?.[i]));

        fillScnEditors?.(false);
        drawScene?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }
}








//-------------------------------------------------------




canvas.addEventListener('mousedown', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;

  //---------------------------------
  // middle button: panning
  //---------------------------------
  if (e.button === 1) {
    isPanning = true;
    return;
  }

  //-------------------------------
  // right button: orbit
  //--------------------------------
  if (e.button === 2) {
    isOrbiting = true;
    return;
  }
  //-------------------------------
  // left button
  //-------------------------------
  if (e.button === 0) 
    {
    const obj = pick(e);

    // 2/A) Ctrl + BAL → KIJELÖLÉS (CP vagy GP/GRP/SCN)
    if (e.ctrlKey) 
    {
      if (obj && obj.userData?.pickKind === 'cp') {
        const li = obj.userData.lineIdx|0;
        const pi = obj.userData.pointIdx|0;
        ensureCLLoaded(li);
        toggleCPSelection(pi, /*withCtrl*/ true);
        return; // csak kijelölünk, nem indítunk drag-et
      }

      if (obj) 
      {
        // a meglévő togglePickSelection a GP/GRP/SCN-re
        togglePickSelection(obj);
        rebuildAllBounds();
        snapshot();
      }
      return; // Ctrl+BAL csak kijelölésre szolgál
    }

    // 2/B) Sima BAL → NEM változtat kijelölést, csak DRAG, ha van kijelölés
    if (!hasAnySelectionForDrag()) 
    {
      return; //nothing selected - do nothing
    }

    startDrag(e); // Ha CP-k vannak kiválasztva, a sima bal katt-ra se töröljük őket.
  }
});

window.addEventListener("mouseup", () =>
{
  isPanning   = false;
  isOrbiting  = false;
  isLDragging = false;
  dragMode    = null;
  lastHit     = null;
});


//---------------------------------------------
// Mouse movement
//---------------------------------------------

function getMoveAxis(e)
{
  // C = Y tengely, ugyanaz a szerepe mint a Shiftnek
  if (e.shiftKey || moveAxisKey.KeyC)
  {
    return "y";
  }

  // X = X tengely
  if (moveAxisKey.KeyX)
  {
    return "x";
  }

  // V = Z tengely
  if (moveAxisKey.KeyV)
  {
    return "z";
  }

  // Nincs tengely-lock: síkban mozgatás (régi viselkedés)
  return "plane";
}


function quantizeDelta(dpos)
{
  const cfg = getSnapConfig();
  if (!cfg.enabled) return dpos;

  let [dx, dy, dz] = dpos;

  // X
  if (cfg.sx > 0)
  {
    snapAccum.x += dx;
    const stepsX = Math.trunc(snapAccum.x / cfg.sx); // lehet negatív is
    dx = stepsX * cfg.sx;
    snapAccum.x -= dx;
  }

  // Y
  if (cfg.sy > 0)
  {
    snapAccum.y += dy;
    const stepsY = Math.trunc(snapAccum.y / cfg.sy);
    dy = stepsY * cfg.sy;
    snapAccum.y -= dy;
  }

  // Z
  if (cfg.sz > 0)
  {
    snapAccum.z += dz;
    const stepsZ = Math.trunc(snapAccum.z / cfg.sz);
    dz = stepsZ * cfg.sz;
    snapAccum.z -= dz;
  }

  return [dx, dy, dz];
}



const ORBIT_INVERT = 1; // +1 vagy -1
const PAN_INVERT = -1; // +1 vagy -1


window.addEventListener("mousemove", (e) =>
{
  const dx = e.clientX - lastX,
    dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  
  
  //---------------------------
  // Mouse - panning
  //---------------------------
  
  if (isPanning)
  {
    const pan = 0.01 * camState.dist;
    const right = new THREE.Vector2(
      Math.cos(camState.yaw + Math.PI / 2),
      Math.sin(camState.yaw + Math.PI / 2),
    );
    const fwd = new THREE.Vector2(
      Math.cos(camState.yaw),
      Math.sin(camState.yaw),
    );
    camState.target.x += PAN_INVERT * (-dx * right.x + dy * fwd.x) * pan;
    camState.target.z += PAN_INVERT * (-dx * right.y + dy * fwd.y) * pan;
    updateCamera();
    return;
  }


  //---------------------------
  // Mouse - orbiting
  //---------------------------

  if (isOrbiting)
  {
    camState.yaw += ORBIT_INVERT * dx * 0.005;
    camState.pitch -= ORBIT_INVERT * dy * 0.005;
    updateCamera();
    return;
  }

  //---------------------------
  // Mouse - drag
  //---------------------------

  if (isLDragging && dragMode)
  {

    //---------------------------
    // Mouse - drag
    //---------------------------
if (dragMode === "move")
{
  // Melyik tengelyen mozgatunk? (Shift/C = Y, X = X, V = Z, egyébként sík)
  const axis = getMoveAxis(e);

  //---------------------------
  // Mouse - Y tengely (fel/le)
  //---------------------------
  if (axis === "y")
  {
    // fel/le mindenkinek – marad a régi logika, csak most axis alapján
    let dY = -dy * 0.02;
    let dposY = quantizeDelta([0, dY, 0]);

    // Ha a snap miatt még nem gyűlt össze lépés, dposY = [0,0,0] lehet
    if (dposY[0] !== 0 || dposY[1] !== 0 || dposY[2] !== 0)
    {
      applyDeltaToSelection({ dpos: dposY });
    }
  }

  //---------------------------
  // Mouse - síkban / X / Z tengelyen
  //---------------------------
  else
  {
    setMouseNDC(e);
    raycaster.setFromCamera(mouseNDC, camera);

    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;

    if (!lastHit)
    {
      lastHit = hit.clone();
      return;
    }

    const d = new THREE.Vector3().subVectors(hit, lastHit);
    lastHit.copy(hit);

    // Alap: síkban mozgatás (régi viselkedés)
    //----------------------------------------------------
    let dxWorld = d.x;
    let dzWorld = -d.z;

    // Ha X/C/V be van nyomva, akkor tengelyre szorítjuk
    if (axis === "x")
    {
      // csak X tengely
      dzWorld = 0;
    }
    else if (axis === "z")
    {
      // csak Z tengely
      dxWorld = 0;
    }

    // Delta-snap alkalmazása
    let dpos = quantizeDelta([dxWorld, 0, dzWorld]);


    // Ha még nincs elég mozgás egy lépéshez, dpos = [0,0,0]
    if (dpos[0] !== 0 || dpos[1] !== 0 || dpos[2] !== 0)
    {
      applyDeltaToSelection({ dpos });
    }
  }

  rebuildAllBounds();
}

//------------------------------
//
//------------------------------
if (dragMode === "rotate")
{
    const dAng = dx * 0.5;
    const ctx  = getModeAndSelection?.();
    const count = ctx?.sel?.size || 0;
    const ord = (store.settings?.eulerOrder || "XYZ").toUpperCase();

    // --- ALT → régi XYZ viselkedés (UI tengely), multi esetben pivot körül
    if (e.altKey)
    {
        const axis = (getActiveRotAxis?.() || "Y").toUpperCase();

        if (count > 1)
        {
            rotateSelectionAroundPivot(axis, dAng);
        }
        else
        {
            const drot =
                axis === "X" ? [dAng, 0, 0] :
                axis === "Y" ? [0, dAng, 0] :
                               [0, 0, dAng];
            applyDeltaToSelection({ drot });
        }
    }
    else
    {
        // --- Q/W/E → eulerOrder 1/2/3. komponense (mindig per-objektum forgatás)
        if (rotKey.KeyQ || rotKey.KeyW || rotKey.KeyE)
        {
            const which = rotKey.KeyQ ? 0 : (rotKey.KeyW ? 1 : 2);
            applyDeltaToSelectionByOrder(ord, which, dAng);
        }
        else
        {
            // --- A/S/D → klasszikus XYZ tengely (multi esetben pivot körül)
            const axis =
                rotKey.KeyA ? "X" :
                rotKey.KeyS ? "Y" :
                rotKey.KeyD ? "Z" : (getActiveRotAxis?.() || "Y");

            if (count > 1)
            {
                rotateSelectionAroundPivot(axis, dAng);
            }
            else
            {
                const drot =
                    axis === "X" ? [dAng, 0, 0] :
                    axis === "Y" ? [0, dAng, 0] :
                                   [0, 0, dAng];
                applyDeltaToSelection({ drot });
            }
        }
    }

    rebuildAllBounds?.();
}





  }
});



//---------------------------------------------
// Mouse Wheel
//---------------------------------------------


canvas.addEventListener(
  "wheel",
  (e) =>
  {
    camState.dist *= 1 + Math.sign(e.deltaY) * 0.1;
    camState.dist = Math.min(Math.max(camState.dist, 1.5), 200);
    updateCamera();

  if (e.ctrlKey) {
    e.preventDefault();
  }

  },
  {
    passive: false, capture: true
  },
);


//---------------------------------------------
// Keys
//---------------------------------------------


window.addEventListener("keydown", (e) =>
{
  if (e.code === "PageUp")
  {
    camState.yOffset += 0.5;
    updateCamera();
  }
  if (e.code === "PageDown")
  {
    camState.yOffset -= 0.5;
    updateCamera();
  }

  //undo redo copy paste in different files


  if (e.key === "Escape")
  {
    e.preventDefault();
    e.stopPropagation();
    clearSelections();

    console.debug("[ESC] nyomkodjuk");
  }
});









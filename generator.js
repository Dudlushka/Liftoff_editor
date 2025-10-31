// ===== Állapot és util =====
const store = {
    gamePrimitives:
    {},
    groups:
    {},
    scene: []
};
/** @typedef {{ id:string, type:'box'|'cylinder'|'sphere'|'cone'|'quarterTorus'|'arcCyl', color:string, scale:[number,number,number], pos:[number,number,number], rotRYP:[number,number,number], hidden?:boolean, arc?:{inner:number, outer:number, angle:number} }} Part */
/** @typedef {{ name:string, parts: Part[] }} GP */
/** @typedef {{ refType:'gp'|'grp', refName:string, pos:[number,number,number], rotRYP:[number,number,number], scale:[number,number,number], hidden?:boolean }} Ref */

const $ = s => document.querySelector(s);
const ui = {
    mode: $('#mode'),
    minorColor: $('#minorColor'),
    majorColor: $('#majorColor'),
    gridSize: $('#gridSize'),
    groupBoundsVis: $('#groupBoundsVis'),
    gameVersion: $('#gameVersion'),
    trackName: $('#trackName'),
    trackUUID: $('#trackUUID'),
    // szerkesztés
    undoBtn: $('#undoBtn'),
    redoBtn: $('#redoBtn'),
    copyBtn: $('#copyBtn'),
    pasteBtn: $('#pasteBtn'),
    dupBtn: $('#dupBtn'),
    toggleVisBtn: $('#toggleVisBtn'),
    deleteBtn: $('#deleteBtn'),
    // gp
    gpPane: $('#gpPane'),
    gpName: $('#gpName'),
    gpNew: $('#gpNew'),
    gpSave: $('#gpSave'),
    gpDelete: $('#gpDelete'),
    gpList: $('#gpList'),
    partType: $('#partType'),
    addPart: $('#addPart'),
    removePart: $('#removePart'),
    partList: $('#partList'),
    pColor: $('#pColor'),
    pTypeRO: $('#pTypeRO'),
    pRotAxis: $('#pRotAxis'),
    pPosX: $('#pPosX'),
    pPosY: $('#pPosY'),
    pPosZ: $('#pPosZ'),
    pRoll: $('#pRoll'),
    pYaw: $('#pYaw'),
    pPitch: $('#pPitch'),
    pSx: $('#pSx'),
    pSy: $('#pSy'),
    pSz: $('#pSz'),
    applyPart: $('#applyPart'),
    // gp arc
    pInnerR: $('#pInnerR'),
    pOuterR: $('#pOuterR'),
    pAngle: $('#pAngle'),
    // grp
    grpPane: $('#grpPane'),
    grpName: $('#grpName'),
    grpNew: $('#grpNew'),
    grpSave: $('#grpSave'),
    grpDelete: $('#grpDelete'),
    grpList: $('#grpList'),
    grpAddType: $('#grpAddType'),
    grpAddSource: $('#grpAddSource'),
    grpAdd: $('#grpAdd'),
    grpRemove: $('#grpRemove'),
    grpItemList: $('#grpItemList'),
    gRotAxis: $('#gRotAxis'),
    gPosX: $('#gPosX'),
    gPosY: $('#gPosY'),
    gPosZ: $('#gPosZ'),
    gRoll: $('#gRoll'),
    gYaw: $('#gYaw'),
    gPitch: $('#gPitch'),
    gSx: $('#gSx'),
    gSy: $('#gSy'),
    gSz: $('#gSz'),
    applyGrpItem: $('#applyGrpItem'),
    // scn
    scnPane: $('#scnPane'),
    scnAddType: $('#scnAddType'),
    scnAddSource: $('#scnAddSource'),
    scnAdd: $('#scnAdd'),
    scnRemove: $('#scnRemove'),
    scnList: $('#scnList'),
    sRotAxis: $('#sRotAxis'),
    sPosX: $('#sPosX'),
    sPosY: $('#sPosY'),
    sPosZ: $('#sPosZ'),
    sRoll: $('#sRoll'),
    sYaw: $('#sYaw'),
    sPitch: $('#sPitch'),
    sSx: $('#sSx'),
    sSy: $('#sSy'),
    sSz: $('#sSz'),
    applySceneItem: $('#applySceneItem'),
    // io
    exportXML: $('#exportXML'),
    saveJSON: $('#saveJSON'),
    loadJSON: $('#loadJSON'),
    saveSceneJSON: $('#saveSceneJSON'),
    loadSceneJSON: $('#loadSceneJSON'),
    exportGameXML: $('#exportGameXML'),
    importGameXML: $('#importGameXML'),
    // diag
    runTests: $('#runTests'),
    diagOut: $('#diagOut')
};

// ===== Undo/Redo (egyszerű snapshot stack) =====
const history = {
    stack: [],
    idx: -1
};

function snapshot()
{
    const snap = JSON.stringify(
    {
        store,
        currentGP,
        currentGRP,
        gpSel: [...gpSelSet],
        grpSel: [...grpSelSet],
        scnSel: [...scnSelSet],
        mode: ui.mode.value
    });
    history.stack = history.stack.slice(0, history.idx + 1);
    history.stack.push(snap);
    history.idx++;
}

function restore(idx)
{
    if (idx < 0 || idx >= history.stack.length) return;
    const state = JSON.parse(history.stack[idx]);
    Object.keys(store).forEach(k => delete store[k]);
    Object.assign(store, state.store);
    currentGP = state.currentGP;
    currentGRP = state.currentGRP;
    gpSelSet = new Set(state.gpSel || []);
    grpSelSet = new Set(state.grpSel || []);
    scnSelSet = new Set(state.scnSel || []);
    ui.mode.value = state.mode || 'scn';
    applyMode();
    refreshGPList();
    refreshGrpList();
    refreshScnSourceOptions();
    refreshScnList();
    fillPartEditors(false);
    fillGrpEditors(false);
    fillScnEditors(false);
    history.idx = idx;
}

function doUndo()
{
    if (history.idx > 0) restore(history.idx - 1);
}

function doRedo()
{
    if (history.idx < history.stack.length - 1) restore(history.idx + 1);
}

// ===== THREE setup =====
const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer(
{
    canvas,
    antialias: true
});
renderer.setPixelRatio(devicePixelRatio);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
const hemi = new THREE.HemisphereLight(0xffffff, 0x999999, 0.8);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 5, 2);
scene.add(dir);

let gridMinor, gridMajor;

function rebuildGrids()
{
    if (gridMinor) scene.remove(gridMinor);
    if (gridMajor) scene.remove(gridMajor);
    const size = Math.max(10, Math.abs(parseFloat(ui.gridSize.value)) | 0);
    gridMinor = new THREE.GridHelper(size, size, new THREE.Color(ui.minorColor.value), new THREE.Color(ui.minorColor.value));
    gridMinor.position.y = 0;
    gridMajor = new THREE.GridHelper(size, size / 10, new THREE.Color(ui.majorColor.value), new THREE.Color(ui.majorColor.value));
    gridMajor.position.y = 0.001;
    scene.add(gridMinor);
    scene.add(gridMajor);
}
ui.minorColor.addEventListener('input', rebuildGrids);
ui.majorColor.addEventListener('input', rebuildGrids);
ui.gridSize.addEventListener('change', rebuildGrids);
const axes = new THREE.AxesHelper(1.5);
axes.position.set(0, 0.01, 0);
scene.add(axes);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
let camState = {
    yaw: Math.PI * 0.25,
    pitch: 0.35,
    dist: 14,
    target: new THREE.Vector3(0, 0, 0),
    yOffset: 0
};

function updateCamera()
{
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    const cx = camState.target.x + Math.cos(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
    const cy = camState.yOffset + Math.sin(camState.pitch) * camState.dist;
    const cz = camState.target.z + Math.sin(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
    camera.position.set(cx, cy, cz);
    camera.lookAt(camState.target.x, camState.target.y, camState.target.z);
    camera.updateProjectionMatrix();
}

const gpRoot = new THREE.Group();
scene.add(gpRoot);
const grpRoot = new THREE.Group();
scene.add(grpRoot);
const scnRoot = new THREE.Group();
scene.add(scnRoot);

scene.add(gpRoot, grpRoot, scnRoot);

// KIZÁRÓLAG ezekre raycastelünk
const pickRoots = [gpRoot, grpRoot, scnRoot]

// ===== Selection (többes) =====
let gpSelSet = new Set();
let grpSelSet = new Set();
let scnSelSet = new Set();

function clearSelections()
{
    gpSelSet.clear();
    grpSelSet.clear();
    scnSelSet.clear();

    // UI frissítések – nálad ezek a nevek vannak:
    refreshPartListHighlight?.();
    refreshGrpItemListHighlight?.();
    refreshScnListHighlight?.();

    rebuildAllBounds?.();
    // Ha szeretnéd, hogy Undo/Redo-ban is megjelenjen a törlés:
    //snapshot?.();
}

// Group bounds helpers
let grpBoundsHelpers = [];

function clearGrpBounds()
{
    grpBoundsHelpers.forEach(h => scene.remove(h));
    grpBoundsHelpers = [];
}

function rebuildAllBounds()
{
    clearGrpBounds();
    const mode = ui.mode.value;
    const root = (mode === 'gp') ? gpRoot : (mode === 'grp') ? grpRoot : scnRoot;
    const isOn = (ui.groupBoundsVis.value === 'on');
    if (!isOn) return;

    function isSelectedUd(ud)
    {
        if (!ud) return false;
        if (mode === 'gp' && ud.pickKind === 'gpPart') return gpSelSet.has(ud.index);
        if (mode === 'grp' && ud.pickKind === 'grpItem') return grpSelSet.has(ud.index);
        if (mode === 'scn' && ud.pickKind === 'scnItem') return scnSelSet.has(ud.index);
        return false;
    }

    root.traverse(o =>
    {
        if (o.userData && (o.userData.pickKind === 'gpPart' || o.userData.pickKind === 'grpItem' || o.userData.pickKind === 'scnItem'))
        {
            const box = new THREE.Box3().setFromObject(o);
            const color = isSelectedUd(o.userData) ? 0xff3333 : 0x0077ff; // piros a kijelölt, kék a többi
            const helper = new THREE.Box3Helper(box, color);
            grpBoundsHelpers.push(helper);
            scene.add(helper);
        }
    });
}






ui.groupBoundsVis.addEventListener('change', () =>
{
    drawGPPreview();
    drawGRPPreview();
    drawScene();
});

// Picking & drag
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let isPanning = false,
    isOrbiting = false,
    isLDragging = false,
    dragMode = null;
let lastX = 0,
    lastY = 0;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let lastHit = null; // a delta számításhoz multi-move esetén

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
    const mode = ui.mode.value;
    const root = (mode === 'gp') ? gpRoot : (mode === 'grp') ? grpRoot : scnRoot;
    const meshes = [];
    root.traverse(o =>
    {
        if (o.isMesh && o.visible) meshes.push(o);
    });
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.pickKind && o.parent) o = o.parent;
    return (o && o.userData.pickKind) ? o : null;
}

function togglePickSelection(obj)
{
    if (!obj) return;
    const mode = ui.mode.value;
    const idx = obj.userData.index;
    if (mode === 'gp')
    {
        if (gpSelSet.has(idx)) gpSelSet.delete(idx);
        else gpSelSet.add(idx);
        refreshPartListHighlight();
    }
    if (mode === 'grp')
    {
        if (grpSelSet.has(idx)) grpSelSet.delete(idx);
        else grpSelSet.add(idx);
        refreshGrpItemListHighlight();
    }
    if (mode === 'scn')
    {
        if (scnSelSet.has(idx)) scnSelSet.delete(idx);
        else scnSelSet.add(idx);
        refreshScnListHighlight();
    }
}




function refreshPartListHighlight()
{
    ui.partList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', gpSelSet.has(i)));
}

function refreshGrpItemListHighlight()
{
    ui.grpItemList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', grpSelSet.has(i)));
}

function refreshScnListHighlight()
{
    ui.scnList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', scnSelSet.has(i)));
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', (e) =>
{
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.button === 1)
    {
        isPanning = true;
        return;
    }
    if (e.button === 2)
    {
        isOrbiting = true;
        return;
    }
    if (e.button === 0)
    {
        // Új kijelölés CSAK Ctrl-lal – többes toggle
        if (e.ctrlKey)
        {
            const obj = pick(e);
            if (obj)
            {
                togglePickSelection(obj);
                rebuildAllBounds();
                snapshot();
            }
        }
        // Drag mindig a LISTÁBAN kijelölte(ke)t mozgatja – ha nincs kiválasztás, nincs drag
        if ((ui.mode.value === 'gp' && gpSelSet.size === 0) || (ui.mode.value === 'grp' && grpSelSet.size === 0) || (ui.mode.value === 'scn' && scnSelSet.size === 0)) return;
        isLDragging = true;
        dragMode = e.altKey ? 'rotate' : 'move';
        setMouseNDC(e);
        raycaster.setFromCamera(mouseNDC, camera);
        lastHit = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, lastHit);
        snapshot(); // drag elején snapshot
    }
});
window.addEventListener('mouseup', () =>
{
    isPanning = false;
    isOrbiting = false;
    isLDragging = false;
    dragMode = null;
    lastHit = null;
});
window.addEventListener('mousemove', (e) =>
{
    const dx = e.clientX - lastX,
        dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (isPanning)
    {
        const pan = 0.01 * camState.dist;
        const right = new THREE.Vector2(Math.cos(camState.yaw + Math.PI / 2), Math.sin(camState.yaw + Math.PI / 2));
        const fwd = new THREE.Vector2(Math.cos(camState.yaw), Math.sin(camState.yaw));
        camState.target.x += (-dx * right.x + dy * fwd.x) * pan;
        camState.target.z += (-dx * right.y + dy * fwd.y) * pan;
        updateCamera();
        return;
    }
    if (isOrbiting)
    {
        camState.yaw += dx * 0.005;
        camState.pitch -= dy * 0.005;
        updateCamera();
        return;
    }
    if (isLDragging && dragMode)
    {
        if (dragMode === 'move')
        {
            if (e.shiftKey)
            { // fel/le mindenkinek
                const dY = -dy * 0.02;
                applyDeltaToSelection(
                {
                    dpos: [0, dY, 0]
                });
            }
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
                applyDeltaToSelection(
                {
                    dpos: [d.x, 0, d.z]
                });
            }
        }
        if (dragMode === 'rotate')
        {
            const axis = getActiveRotAxis();
            const dAng = dx * 0.5;
            const drot = (axis === 'X') ? [dAng, 0, 0] : (axis === 'Y') ? [0, dAng, 0] : [0, 0, dAng];
            applyDeltaToSelection(
            {
                drot
            });
        }
    }
});
canvas.addEventListener('wheel', (e) =>
{
    camState.dist *= (1 + Math.sign(e.deltaY) * 0.1);
    camState.dist = Math.min(Math.max(camState.dist, 1.5), 200);
    updateCamera();
},
{
    passive: true
});
window.addEventListener('keydown', (e) =>
{
    if (e.code === 'PageUp')
    {
        camState.yOffset += 0.5;
        updateCamera();
    }
    if (e.code === 'PageDown')
    {
        camState.yOffset -= 0.5;
        updateCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')
    {
        e.preventDefault();
        doUndo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
    {
        e.preventDefault();
        doRedo();
    }
    if (e.key === 'Delete')
    {
        e.preventDefault();
        deleteSelection();
    }
	
	if (e.key === 'Escape')
    {
		 e.preventDefault();
            e.stopPropagation();
        clearSelections();
		
		console.debug('[ESC] nyomkodjuk');
    }
});



//---------------------------------

function drawClickCross(e) {
  const el = renderer.domElement;
  const r  = el.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.style.position = 'fixed';
  dot.style.left = (e.clientX - 5) + 'px';
  dot.style.top  = (e.clientY - 5) + 'px';
  dot.style.width = '10px';
  dot.style.height= '10px';
  dot.style.border = '2px solid red';
  dot.style.borderRadius = '50%';
  dot.style.pointerEvents = 'none';
  dot.style.zIndex = 999999;
  document.body.appendChild(dot);
  setTimeout(()=> dot.remove(), 400);
}

/*
renderer.domElement.addEventListener('mousedown', (e) => {
  drawClickCross(e); // töröld ki ha már nem kell
}, { capture: true });
*/
//-------------------------------------


let hoverSel = null, hoverBox = null;

function ensureHoverBox() {
  if (!hoverBox) {
    hoverBox = new THREE.Box3Helper(new THREE.Box3(), 0xffff00);
    hoverBox.visible = false;
    hoverBox.userData.pickable = false;
    scene.add(hoverBox);
  }
}

renderer.domElement.addEventListener('mousemove', (e) => {
  setMouseNDC(e);
  raycaster.setFromCamera(mouseNDC, camera);
  scene.updateMatrixWorld(true);

  const hit = raycaster.intersectObjects(pickRoots, true)
    .find(h => h.object?.userData?.pickable !== false);

  ensureHoverBox();

  if (hit) {
    if (hoverSel !== hit.object) {
      hoverSel = hit.object;
      const box = new THREE.Box3().setFromObject(hoverSel);
      hoverBox.box.copy(box);
      hoverBox.visible = true;
      console.debug('[hover]', hoverSel.name || hoverSel.uuid, hit.distance.toFixed(3));
    }
  } else {
    hoverSel = null;
    hoverBox.visible = false;
  }
}, { passive: true });





function getActiveRotAxis()
{
    const m = ui.mode.value;
    if (m === 'gp') return ui.pRotAxis.value;
    if (m === 'grp') return ui.gRotAxis.value;
    return ui.sRotAxis.value;
}

function applyDeltaToSelection(
{
    dpos = [0, 0, 0],
    drot = [0, 0, 0],
    dscale = [0, 0, 0]
})
{
    const m = ui.mode.value;
    if (m === 'gp' && currentGP)
    {
        gpSelSet.forEach(i =>
        {
            const p = currentGP.parts[i];
            if (!p) return;
            p.pos = [p.pos[0] + dpos[0], p.pos[1] + dpos[1], p.pos[2] + dpos[2]];
            p.rotRYP = [p.rotRYP[0] + drot[0], p.rotRYP[1] + drot[1], p.rotRYP[2] + drot[2]];
            p.scale = [p.scale[0] + dscale[0], p.scale[1] + dscale[1], p.scale[2] + dscale[2]];
        });
        fillPartEditors(false);
        drawGPPreview();
    }
    if (m === 'grp' && currentGRP)
    {
        grpSelSet.forEach(i =>
        {
            const it = currentGRP.items[i];
            if (!it) return;
            it.pos = [it.pos[0] + dpos[0], it.pos[1] + dpos[1], it.pos[2] + dpos[2]];
            it.rotRYP = [it.rotRYP[0] + drot[0], it.rotRYP[1] + drot[1], it.rotRYP[2] + drot[2]];
            it.scale = [it.scale[0] + dscale[0], it.scale[1] + dscale[1], it.scale[2] + dscale[2]];
        });
        fillGrpEditors(false);
        drawGRPPreview();
    }
    if (m === 'scn')
    {
        scnSelSet.forEach(i =>
        {
            const it = store.scene[i];
            if (!it) return;
            it.pos = [it.pos[0] + dpos[0], it.pos[1] + dpos[1], it.pos[2] + dpos[2]];
            it.rotRYP = [it.rotRYP[0] + drot[0], it.rotRYP[1] + drot[1], it.rotRYP[2] + drot[2]];
            it.scale = [it.scale[0] + dscale[0], it.scale[1] + dscale[1], it.scale[2] + dscale[2]];
        });
        fillScnEditors(false);
        drawScene();
    }
}

function resize()
{
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    updateCamera();
}
new ResizeObserver(resize).observe(canvas.parentElement);
rebuildGrids();
resize();
const deg = v => v * Math.PI / 180;

// ===== Geometriák =====
function buildArcCylGeometry(inner, outer, angleDeg, height)
{
    const angDeg = Math.max(1, Math.min(359, angleDeg));
    const a = THREE.MathUtils.degToRad(angDeg);
    const s = 0,
        e = a;
    const outerR = Math.max(outer, inner + 1e-4);

    const shape = new THREE.Shape();
    shape.moveTo(outerR * Math.cos(s), outerR * Math.sin(s));
    shape.absarc(0, 0, outerR, s, e, false);
    shape.lineTo(inner * Math.cos(e), inner * Math.sin(e));

    const hole = new THREE.Path();
    hole.moveTo(inner * Math.cos(e), inner * Math.sin(e));
    hole.absarc(0, 0, inner, e, s, true);
    hole.lineTo(outerR * Math.cos(s), outerR * Math.sin(s));
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape,
    {
        depth: height,
        bevelEnabled: false,
        curveSegments: 96
    });
    geo.translate(0, 0, -height / 2);
    geo.rotateX(Math.PI / 2);
    geo.center();
    geo.computeVertexNormals();
    return geo;
}

function buildPrimitiveMesh(p)
{
    let geo;
    if (p.type === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (p.type === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    else if (p.type === 'sphere') geo = new THREE.SphereGeometry(0.5, 24, 16);
    else if (p.type === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 24);
    else if (p.type === 'quarterTorus') geo = new THREE.TorusGeometry(1, 0.25, 16, 64, Math.PI / 2);
    else if (p.type === 'arcCyl')
    {
        const inner = p.arc?.inner ?? 0.3;
        const outer = p.arc?.outer ?? 0.5;
        const ang = p.arc?.angle ?? 90;
        geo = buildArcCylGeometry(inner, outer, ang, 1);
    }
    else geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial(
    {
        color: new THREE.Color(p.color),
        flatShading: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.set(deg(p.rotRYP[0]), deg(p.rotRYP[1]), deg(p.rotRYP[2]));
    return m;
}

// ===== GP szerkesztő =====
let currentGP = null;

function refreshGPList()
{
    ui.gpList.innerHTML = '';
    Object.keys(store.gamePrimitives).sort().forEach(name =>
    {
        const li = document.createElement('li');
        li.textContent = name;
        if (currentGP && currentGP.name === name) li.classList.add('sel');
        li.onclick = (ev) =>
        {
            if (ev.ctrlKey) return;
            loadGP(name);
        };
        ui.gpList.appendChild(li);
    });
    refreshGrpSourceOptions();
    refreshScnSourceOptions();
}

function refreshPartList()
{
    ui.partList.innerHTML = '';
    if (!currentGP) return;
    currentGP.parts.forEach((p, i) =>
    {
        const li = document.createElement('li');
        li.innerHTML = `${i+1}. ${p.type} ${p.hidden?'<span class=muted>(rejtett)</span>':''} pos(${p.pos.map(n=>n.toFixed(2)).join(',')})`;
        li.classList.toggle('sel', gpSelSet.has(i));
        li.onclick = (ev) =>
        {
            if (ev.ctrlKey)
            {
                if (gpSelSet.has(i)) gpSelSet.delete(i);
                else gpSelSet.add(i);
                refreshPartListHighlight();
                rebuildAllBounds();
            }
            else
            {
                gpSelSet = new Set([i]);
                refreshPartListHighlight();
                rebuildAllBounds();
            }
            fillPartEditors();
            drawGPPreview();
        };
        ui.partList.appendChild(li);
    });
}

function drawGPPreview()
{
    gpRoot.clear();
    if (!currentGP)
    {
        clearGrpBounds();
        return;
    }
    const root = new THREE.Group();
    currentGP.parts.forEach((p, idx) =>
    {
        const mesh = buildPrimitiveMesh(p);
        mesh.userData = {
            pickKind: 'gpPart',
            index: idx
        };
        mesh.visible = !p.hidden;
        root.add(mesh);
    });
    gpRoot.add(root);
    rebuildAllBounds();
}

function showArcBoxFor(p)
{
    const box = $('#pArcBox');
    if (!box) return;
    const on = (p.type === 'arcCyl');
    box.style.display = on ? 'grid' : 'none';
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

function fillPartEditors(focus = true)
{
    if (!currentGP || gpSelSet.size === 0) return;
    const i = firstSelIndex(gpSelSet);
    const p = currentGP.parts[i];
    ui.pColor.value = p.color;
    ui.pTypeRO.value = p.type;
    ui.pPosX.value = p.pos[0];
    ui.pPosY.value = p.pos[1];
    ui.pPosZ.value = p.pos[2];
    ui.pRoll.value = p.rotRYP[0];
    ui.pYaw.value = p.rotRYP[1];
    ui.pPitch.value = p.rotRYP[2];
    ui.pSx.value = p.scale[0];
    ui.pSy.value = p.scale[1];
    ui.pSz.value = p.scale[2];
    showArcBoxFor(p);
    if (focus) refreshPartList();
}

function loadGP(name)
{
    currentGP = JSON.parse(JSON.stringify(store.gamePrimitives[name]));
    gpSelSet.clear();
    ui.gpName.value = currentGP.name;
    refreshPartList();
    drawGPPreview();
    refreshGPList();
}

ui.gpNew.addEventListener('click', () =>
{
    const name = ui.gpName.value.trim() || `GamePrim_${Object.keys(store.gamePrimitives).length+1}`;
    currentGP = {
        name,
        parts: []
    };
    gpSelSet.clear();
    refreshPartList();
    drawGPPreview();
    refreshGPList();
    snapshot();
});


ui.gpSave.addEventListener('click', () =>
{
    if (!currentGP) return;
    currentGP.name = ui.gpName.value.trim() || currentGP.name;
    store.gamePrimitives[currentGP.name] = JSON.parse(JSON.stringify(currentGP));
    refreshGPList();
    snapshot();
});


ui.gpDelete.addEventListener('click', () =>
{
    if (!currentGP) return;
    delete store.gamePrimitives[currentGP.name];
    currentGP = null;
    gpRoot.clear();
    refreshGPList();
    refreshPartList();
    snapshot();
});


ui.addPart.addEventListener('click', () =>
{
    if (!currentGP)
    {
        const name = ui.gpName.value.trim() || `GamePrim_${Object.keys(store.gamePrimitives).length+1}`;
        currentGP = {
            name,
            parts: []
        };
    }
    const t = ui.partType.value;
    const p = {
        id: crypto.randomUUID(),
        type: t,
        color: '#bdbdbd',
        scale: [1, 1, 1],
        pos: [0, 0, 0],
        rotRYP: [0, 0, 0]
    };
    if (t === 'arcCyl') p.arc = {
        inner: 0.3,
        outer: 0.5,
        angle: 90
    };
    currentGP.parts.push(p);
    gpSelSet = new Set([currentGP.parts.length - 1]);
    refreshPartList();
    fillPartEditors();
    drawGPPreview();
    snapshot();
});


ui.removePart.addEventListener('click', () =>
{
    if (!currentGP || gpSelSet.size === 0) return;
    const sorted = [...gpSelSet].sort((a, b) => b - a);
    sorted.forEach(i => currentGP.parts.splice(i, 1));
    gpSelSet.clear();
    refreshPartList();
    drawGPPreview();
    snapshot();
});

function applyPartNow()
{
    if (!currentGP || gpSelSet.size === 0) return;
    gpSelSet.forEach(i =>
    {
        const p = currentGP.parts[i];
        p.color = ui.pColor.value;
        p.pos = [+ui.pPosX.value, +ui.pPosY.value, +ui.pPosZ.value];
        p.rotRYP = [+ui.pRoll.value, +ui.pYaw.value, +ui.pPitch.value];
        p.scale = [+ui.pSx.value, +ui.pSy.value, +ui.pSz.value];
        if (p.type === 'arcCyl')
        {
            const ir = +ui.pInnerR.value;
            const or = +ui.pOuterR.value;
            const ang = +ui.pAngle.value;
            p.arc = {
                inner: Math.max(0, Math.min(ir, or - 1e-4)),
                outer: Math.max(or, ir + 1e-4),
                angle: ang
            };
        }
    });
    refreshPartList();
    drawGPPreview();
    snapshot();
}
ui.applyPart.addEventListener('click', applyPartNow);;
['pColor', 'pPosX', 'pPosY', 'pPosZ', 'pRoll', 'pYaw', 'pPitch', 'pSx', 'pSy', 'pSz', 'pInnerR', 'pOuterR', 'pAngle'].forEach(id =>
{
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyPartNow);
});

// ===== Group szerkesztő =====
let currentGRP = null;

function refreshGrpList()
{
    ui.grpList.innerHTML = '';
    Object.keys(store.groups).sort().forEach(name =>
    {
        const li = document.createElement('li');
        li.textContent = name;
        if (currentGRP && currentGRP.name === name) li.classList.add('sel');
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

function refreshGrpSourceOptions()
{
    ui.grpAddSource.innerHTML = '';
    const src = ui.grpAddType.value === 'gp' ? Object.keys(store.gamePrimitives) : Object.keys(store.groups);
    src.forEach(n =>
    {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        ui.grpAddSource.appendChild(o);
    });
}
ui.grpAddType.addEventListener('change', refreshGrpSourceOptions);

function refreshGrpItemList()
{
    ui.grpItemList.innerHTML = '';
    if (!currentGRP) return;
    currentGRP.items.forEach((it, i) =>
    {
        const li = document.createElement('li');
        li.innerHTML = `${i+1}. [${it.refType}] ${it.refName} ${it.hidden?'<span class=muted>(rejtett)</span>':''}`;
        li.classList.toggle('sel', grpSelSet.has(i));
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
                grpSelSet = new Set([i]);
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

function loadGRP(name)
{
    currentGRP = JSON.parse(JSON.stringify(store.groups[name]));
    grpSelSet.clear();
    ui.grpName.value = currentGRP.name;
    refreshGrpItemList();
    refreshGrpList();
}
ui.grpNew.addEventListener('click', () =>
{
    const name = ui.grpName.value.trim() || `Group_${Object.keys(store.groups).length+1}`;
    currentGRP = {
        name,
        items: []
    };
    grpSelSet.clear();
    refreshGrpItemList();
    refreshGrpList();
    snapshot();
});
ui.grpSave.addEventListener('click', () =>
{
    if (!currentGRP) return;
    currentGRP.name = ui.grpName.value.trim() || currentGRP.name;
    store.groups[currentGRP.name] = JSON.parse(JSON.stringify(currentGRP));
    refreshGrpList();
    snapshot();
});
ui.grpDelete.addEventListener('click', () =>
{
    if (!currentGRP) return;
    delete store.groups[currentGRP.name];
    currentGRP = null;
    grpRoot.clear();
    clearGrpBounds();
    refreshGrpList();
    refreshGrpItemList();
    snapshot();
});
ui.grpAdd.addEventListener('click', () =>
{
    if (!currentGRP) return;
    const refType = ui.grpAddType.value;
    const refName = ui.grpAddSource.value;
    const item = {
        refType,
        refName,
        pos: [0, 0, 0],
        rotRYP: [0, 0, 0],
        scale: [1, 1, 1]
    };
    currentGRP.items.push(item);
    grpSelSet = new Set([currentGRP.items.length - 1]);
    refreshGrpItemList();
    snapshot();
});
ui.grpRemove.addEventListener('click', () =>
{
    if (!currentGRP || grpSelSet.size === 0) return;
    const sorted = [...grpSelSet].sort((a, b) => b - a);
    sorted.forEach(i => currentGRP.items.splice(i, 1));
    grpSelSet.clear();
    refreshGrpItemList();
    snapshot();
});

function fillGrpEditors(focus = true)
{
    if (!currentGRP || grpSelSet.size === 0) return;
    const i = firstSelIndex(grpSelSet);
    const it = currentGRP.items[i];
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

function instantiateGP(gp)
{
    if (!gp) return null;
    const root = new THREE.Group();
    gp.parts.forEach(p =>
    {
        if (p.hidden) return;
        root.add(buildPrimitiveMesh(p));
    });
    return root;
}

function instantiateGroup(grp)
{
    if (!grp) return null;
    const root = new THREE.Group();
    grp.items.forEach((it, idx) =>
    {
        const container = new THREE.Group();
        container.userData = {
            pickKind: 'grpItem',
            index: idx
        };
        const node = (it.refType === 'gp') ? instantiateGP(store.gamePrimitives[it.refName]) : instantiateGroup(store.groups[it.refName]);
        if (node) container.add(node);
        applyTRS(container, it.pos, it.rotRYP, it.scale);
        container.visible = !it.hidden;
        root.add(container);
    });
    return root;
}

function drawGRPPreview()
{
    grpRoot.clear();
    if (!currentGRP)
    {
        clearGrpBounds();
        return;
    }
    const group = instantiateGroup(currentGRP);
    grpRoot.add(group);
    rebuildAllBounds();
}

function applyGrpNow()
{
    if (!currentGRP || grpSelSet.size === 0) return;
    grpSelSet.forEach(i =>
    {
        const it = currentGRP.items[i];
        it.pos = [+ui.gPosX.value, +ui.gPosY.value, +ui.gPosZ.value];
        it.rotRYP = [+ui.gRoll.value, +ui.gYaw.value, +ui.gPitch.value];
        it.scale = [+ui.gSx.value, +ui.gSy.value, +ui.gSz.value];
    });
    refreshGrpItemList();
    drawGRPPreview();
    snapshot();
}

ui.applyGrpItem.addEventListener('click', applyGrpNow);;
['gPosX', 'gPosY', 'gPosZ', 'gRoll', 'gYaw', 'gPitch', 'gSx', 'gSy', 'gSz'].forEach(id => document.getElementById(id).addEventListener('input', applyGrpNow));

// ===== Scene =====
function refreshScnSourceOptions()
{
    ui.scnAddSource.innerHTML = '';
    const src = ui.scnAddType.value === 'gp' ? Object.keys(store.gamePrimitives) : Object.keys(store.groups);
    src.forEach(n =>
    {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        ui.scnAddSource.appendChild(o);
    });
}
ui.scnAddType.addEventListener('change', refreshScnSourceOptions);

function refreshScnList()
{
    ui.scnList.innerHTML = '';
    store.scene.forEach((it, i) =>
    {
        const li = document.createElement('li');
        li.innerHTML = `${i+1}. [${it.refType}] ${it.refName} ${it.hidden?'<span class=muted>(rejtett)</span>':''}`;
        li.classList.toggle('sel', scnSelSet.has(i));
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
                scnSelSet = new Set([i]);
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


ui.scnAdd.addEventListener('click', () =>
{
    const refType = ui.scnAddType.value;
    const refName = ui.scnAddSource.value;
    store.scene.push(
    {
        refType,
        refName,
        pos: [0, 0, 0],
        rotRYP: [0, 0, 0],
        scale: [1, 1, 1]
    });
    scnSelSet = new Set([store.scene.length - 1]);
    refreshScnList();
    snapshot();
});


ui.scnRemove.addEventListener('click', () =>
{
    if (scnSelSet.size === 0) return;
    const sorted = [...scnSelSet].sort((a, b) => b - a);
    sorted.forEach(i => store.scene.splice(i, 1));
    scnSelSet.clear();
    refreshScnList();
    snapshot();
});

function fillScnEditors(focus = true)
{
    if (scnSelSet.size === 0) return;
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

function drawScene()
{
    scnRoot.clear();
    store.scene.forEach((it, idx) =>
    {
        const container = new THREE.Group();
        container.userData = {
            pickKind: 'scnItem',
            index: idx
        };
        const node = (it.refType === 'gp') ? instantiateGP(store.gamePrimitives[it.refName]) : instantiateGroup(store.groups[it.refName]);
        if (node) container.add(node);
        applyTRS(container, it.pos, it.rotRYP, it.scale);
        container.visible = !it.hidden;
        scnRoot.add(container);
    });
    rebuildAllBounds();
}

function applySceneNow()
{
    if (scnSelSet.size === 0) return;
    scnSelSet.forEach(i =>
    {
        const it = store.scene[i];
        it.pos = [+ui.sPosX.value, +ui.sPosY.value, +ui.sPosZ.value];
        it.rotRYP = [+ui.sRoll.value, +ui.sYaw.value, +ui.sPitch.value];
        it.scale = [+ui.sSx.value, +ui.sSy.value, +ui.sSz.value];
    });
    refreshScnList();
    drawScene();
    snapshot();
}
ui.applySceneItem.addEventListener('click', applySceneNow);;
['sPosX', 'sPosY', 'sPosZ', 'sRoll', 'sYaw', 'sPitch', 'sSx', 'sSy', 'sSz'].forEach(id => document.getElementById(id).addEventListener('input', applySceneNow));

// ===== Copy / Paste / Duplicate / Visibility / Delete =====
let clipboard = null; // {mode, items: deep-cloned}
function getSelectionInMode()
{
    const m = ui.mode.value;
    if (m === 'gp') return {
        mode: m,
        idxs: [...gpSelSet].sort((a, b) => a - b)
    };
    if (m === 'grp') return {
        mode: m,
        idxs: [...grpSelSet].sort((a, b) => a - b)
    };
    return {
        mode: m,
        idxs: [...scnSelSet].sort((a, b) => a - b)
    };
}

function copySelection()
{
    const sel = getSelectionInMode();
    if (sel.idxs.length === 0) return;
    if (sel.mode === 'gp' && currentGP)
    {
        clipboard = {
            mode: 'gp',
            items: sel.idxs.map(i => JSON.parse(JSON.stringify(currentGP.parts[i])))
        };
    }
    if (sel.mode === 'grp' && currentGRP)
    {
        clipboard = {
            mode: 'grp',
            items: sel.idxs.map(i => JSON.parse(JSON.stringify(currentGRP.items[i])))
        };
    }
    if (sel.mode === 'scn')
    {
        clipboard = {
            mode: 'scn',
            items: sel.idxs.map(i => JSON.parse(JSON.stringify(store.scene[i])))
        };
    }
}

function pasteClipboard()
{
    if (!clipboard) return;
    snapshot();
    const off = [0.2, 0, 0.2];
    if (clipboard.mode === 'gp' && currentGP)
    {
        clipboard.items.forEach(it =>
        {
            const p = JSON.parse(JSON.stringify(it));
            p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
            currentGP.parts.push(p);
        });
        gpSelSet = new Set([...Array(clipboard.items.length).keys()].map((k) => currentGP.parts.length - clipboard.items.length + k));
        refreshPartList();
        drawGPPreview();
    }
    if (clipboard.mode === 'grp' && currentGRP)
    {
        clipboard.items.forEach(it =>
        {
            const p = JSON.parse(JSON.stringify(it));
            p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
            currentGRP.items.push(p);
        });
        grpSelSet = new Set([...Array(clipboard.items.length).keys()].map((k) => currentGRP.items.length - clipboard.items.length + k));
        refreshGrpItemList();
    }
    if (clipboard.mode === 'scn')
    {
        clipboard.items.forEach(it =>
        {
            const p = JSON.parse(JSON.stringify(it));
            p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
            store.scene.push(p);
        });
        scnSelSet = new Set([...Array(clipboard.items.length).keys()].map((k) => store.scene.length - clipboard.items.length + k));
        refreshScnList();
    }
}

function duplicateSelection()
{
    copySelection();
    pasteClipboard();
}

function toggleVisibility()
{
    const m = ui.mode.value;
    snapshot();
    if (m === 'gp' && currentGP)
    {
        gpSelSet.forEach(i =>
        {
            const p = currentGP.parts[i];
            p.hidden = !p.hidden;
        });
        refreshPartList();
        drawGPPreview();
    }
    if (m === 'grp' && currentGRP)
    {
        grpSelSet.forEach(i =>
        {
            const it = currentGRP.items[i];
            it.hidden = !it.hidden;
        });
        refreshGrpItemList();
        drawGRPPreview();
    }
    if (m === 'scn')
    {
        scnSelSet.forEach(i =>
        {
            const it = store.scene[i];
            it.hidden = !it.hidden;
        });
        refreshScnList();
        drawScene();
    }
}

function deleteSelection()
{
    const m = ui.mode.value;
    if ((m === 'gp' && gpSelSet.size === 0) || (m === 'grp' && grpSelSet.size === 0) || (m === 'scn' && scnSelSet.size === 0)) return;
    snapshot();
    if (m === 'gp' && currentGP)
    {
        const sorted = [...gpSelSet].sort((a, b) => b - a);
        sorted.forEach(i => currentGP.parts.splice(i, 1));
        gpSelSet.clear();
        refreshPartList();
        drawGPPreview();
    }
    if (m === 'grp' && currentGRP)
    {
        const sorted = [...grpSelSet].sort((a, b) => b - a);
        sorted.forEach(i => currentGRP.items.splice(i, 1));
        grpSelSet.clear();
        refreshGrpItemList();
        drawGRPPreview();
    }
    if (m === 'scn')
    {
        const sorted = [...scnSelSet].sort((a, b) => b - a);
        sorted.forEach(i => store.scene.splice(i, 1));
        scnSelSet.clear();
        refreshScnList();
        drawScene();
    }
}

ui.copyBtn.addEventListener('click', copySelection);
ui.pasteBtn.addEventListener('click', pasteClipboard);
ui.dupBtn.addEventListener('click', duplicateSelection);
ui.toggleVisBtn.addEventListener('click', toggleVisibility);
ui.deleteBtn.addEventListener('click', deleteSelection);
ui.undoBtn.addEventListener('click', doUndo);
ui.redoBtn.addEventListener('click', doRedo);

// ===== Export / Import =====
function exportSceneFlattenXML()
{
    const out = [];

    function addNode(node, parentMatrix)
    {
        const M = new THREE.Matrix4();
        const Rx = new THREE.Matrix4().makeRotationX(deg(node.rotRYP[0]));
        const Ry = new THREE.Matrix4().makeRotationY(deg(node.rotRYP[1]));
        const Rz = new THREE.Matrix4().makeRotationZ(deg(node.rotRYP[2]));
        const S = new THREE.Matrix4().makeScale(node.scale[0], node.scale[1], node.scale[2]);
        const T = new THREE.Matrix4().makeTranslation(node.pos[0], node.pos[1], node.pos[2]);
        M.multiply(parentMatrix).multiply(T).multiply(Rx).multiply(Ry).multiply(Rz).multiply(S);
        if (node.refType === 'gp')
        {
            const gp = store.gamePrimitives[node.refName];
            if (!gp) return;
            gp.parts.forEach(p =>
            {
                const m = new THREE.Matrix4();
                const Rx2 = new THREE.Matrix4().makeRotationX(deg(p.rotRYP[0]));
                const Ry2 = new THREE.Matrix4().makeRotationY(deg(p.rotRYP[1]));
                const Rz2 = new THREE.Matrix4().makeRotationZ(deg(p.rotRYP[2]));
                const S2 = new THREE.Matrix4().makeScale(p.scale[0], p.scale[1], p.scale[2]);
                const T2 = new THREE.Matrix4().makeTranslation(p.pos[0], p.pos[1], p.pos[2]);
                m.multiply(M).multiply(T2).multiply(Rx2).multiply(Ry2).multiply(Rz2).multiply(S2);
                const pos = new THREE.Vector3();
                const quat = new THREE.Quaternion();
                const scl = new THREE.Vector3();
                m.decompose(pos, quat, scl);
                const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
                out.push(
                {
                    type: p.type,
                    color: p.color,
                    size: [scl.x, scl.y, scl.z],
                    pos: [pos.x, pos.y, pos.z],
                    rotRYP: [eul.x * 180 / Math.PI, eul.y * 180 / Math.PI, eul.z * 180 / Math.PI]
                });
            });
        }
        else
        {
            const grp = store.groups[node.refName];
            if (!grp) return;
            grp.items.forEach(child => addNode(child, M));
        }
    }
    const I = new THREE.Matrix4();
    store.scene.forEach(root => addNode(root, I));
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scene>
`;
    out.forEach((p, i) =>
    {
        xml += `  <Primitive index="${i}" type="${p.type}">
`;
        xml += `    <color>${p.color}</color>
`;
        xml += `    <size x="${p.size[0].toFixed(6)}" y="${p.size[1].toFixed(6)}" z="${p.size[2].toFixed(6)}"/>
`;
        xml += `    <position x="${p.pos[0].toFixed(6)}" y="${p.pos[1].toFixed(6)}" z="${p.pos[2].toFixed(6)}"/>
`;
        xml += `    <rotation roll="${p.rotRYP[0].toFixed(6)}" yaw="${p.rotRYP[1].toFixed(6)}" pitch="${p.rotRYP[2].toFixed(6)}"/>
`;
        xml += `  </Primitive>
`;
    });
    xml += `</Scene>
`;
    downloadText('scene_export.xml', xml);
}

function exportGameXML()
{
    const name = ui.trackName.value.trim() || 'Unnamed';
    const uuid = ui.trackUUID.value.trim() || '00000000-0000-0000-0000-000000000000';
    const ver = ui.gameVersion.value.trim() || '1.6.17';
    let xml = `<?xml version=\"1.0\" encoding=\"utf-8\"?>
<Track xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">`;
    xml += `
  <gameVersion>${ver}</gameVersion>
  <localID>
    <str>${uuid}</str>
    <version>1</version>
    <type>TRACK</type>
  </localID>
  <name>${name}</name>
  <description />
  <dependencies />
  <environment>TheDrawingBoard</environment>
  <blueprints>`;
    xml += `
`;
    let instanceID = 1;

    function addNode(node, parentMatrix)
    {
        const M = new THREE.Matrix4();
        const Rx = new THREE.Matrix4().makeRotationX(deg(node.rotRYP[0]));
        const Ry = new THREE.Matrix4().makeRotationY(deg(node.rotRYP[1]));
        const Rz = new THREE.Matrix4().makeRotationZ(deg(node.rotRYP[2]));
        const S = new THREE.Matrix4().makeScale(node.scale[0], node.scale[1], node.scale[2]);
        const T = new THREE.Matrix4().makeTranslation(node.pos[0], node.pos[1], node.pos[2]);
        M.multiply(parentMatrix).multiply(T).multiply(Rx).multiply(Ry).multiply(Rz).multiply(S);
        if (node.refType === 'gp')
        {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scl = new THREE.Vector3();
            M.decompose(pos, quat, scl);
            const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
            xml += `    <TrackBlueprint xsi:type=\"TrackBlueprintFlag\">
`;
            xml += `      <itemID>${node.refName}</itemID>
`;
            xml += `      <instanceID>${instanceID++}</instanceID>
`;
            xml += `      <position>
        <x>${pos.x}</x>
        <y>${pos.y}</y>
        <z>${pos.z}</z>
      </position>
`;
            xml += `      <rotation>
        <x>${eul.x*180/Math.PI}</x>
        <y>${eul.y*180/Math.PI}</y>
        <z>${eul.z*180/Math.PI}</z>
      </rotation>
`;
            xml += `    </TrackBlueprint>
`;
        }
        else
        {
            const grp = store.groups[node.refName];
            if (!grp) return;
            grp.items.forEach(child => addNode(child, M));
        }
    }
    const I = new THREE.Matrix4();
    store.scene.forEach(root => addNode(root, I));
    xml += `  </blueprints>
  <hideDefaultSpawnpoint>false</hideDefaultSpawnpoint>
</Track>
`;
    downloadText('track_export.xml', xml);
}

function importGameXML(file)
{
    const reader = new FileReader();
    reader.onload = () =>
    {
        try
        {
            const text = String(reader.result);
            const dom = new DOMParser().parseFromString(text, 'application/xml');
            const name = dom.querySelector('Track > name')?.textContent || 'Imported';
            const uuid = dom.querySelector('Track > localID > str')?.textContent || '00000000-0000-0000-0000-000000000000';
            const ver = dom.querySelector('Track > gameVersion')?.textContent || '1.6.17';
            ui.trackName.value = name;
            ui.trackUUID.value = uuid;
            ui.gameVersion.value = ver;
            store.scene.length = 0;
            dom.querySelectorAll('blueprints > TrackBlueprint').forEach(bp =>
            {
                const itemID = bp.querySelector('itemID')?.textContent || 'UnknownItem';
                const px = parseFloat(bp.querySelector('position > x')?.textContent || '0');
                const py = parseFloat(bp.querySelector('position > y')?.textContent || '0');
                const pz = parseFloat(bp.querySelector('position > z')?.textContent || '0');
                const rx = parseFloat(bp.querySelector('rotation > x')?.textContent || '0');
                const ry = parseFloat(bp.querySelector('rotation > y')?.textContent || '0');
                const rz = parseFloat(bp.querySelector('rotation > z')?.textContent || '0');
                if (!store.gamePrimitives[itemID])
                {
                    store.gamePrimitives[itemID] = {
                        name: itemID,
                        parts: [
                        {
                            id: crypto.randomUUID(),
                            type: 'box',
                            color: '#9aa7b1',
                            scale: [1, 1, 1],
                            pos: [0, 0, 0],
                            rotRYP: [0, 0, 0]
                        }]
                    };
                }
                store.scene.push(
                {
                    refType: 'gp',
                    refName: itemID,
                    pos: [px, py, pz],
                    rotRYP: [rx, ry, rz],
                    scale: [1, 1, 1]
                });
            });
            refreshGPList();
            refreshGrpList();
            refreshScnSourceOptions();
            refreshScnList();
            snapshot();
        }
        catch (e)
        {
            alert('XML import hiba.');
        }
    };
    reader.readAsText(file);
}

function saveJSON()
{
    const data = {
        gamePrimitives: store.gamePrimitives,
        groups: store.groups
    };
    downloadText('library.json', JSON.stringify(data, null, 2));
}

function loadJSON(file)
{
    const reader = new FileReader();
    reader.onload = () =>
    {
        try
        {
            const data = JSON.parse(String(reader.result));
            if (data.gamePrimitives) store.gamePrimitives = data.gamePrimitives;
            if (data.groups) store.groups = data.groups;
            currentGP = null;
            currentGRP = null;
            grpRoot.clear();
            gpRoot.clear();
            refreshGPList();
            refreshGrpList();
            refreshScnSourceOptions();
            snapshot();
        }
        catch (e)
        {
            alert('Hibás JSON.');
        }
    };
    reader.readAsText(file);
}

function saveSceneJSON()
{
    downloadText('scene.json', JSON.stringify(
    {
        scene: store.scene
    }, null, 2));
}

function loadSceneJSON(file)
{
    const reader = new FileReader();
    reader.onload = () =>
    {
        try
        {
            const data = JSON.parse(String(reader.result));
            if (Array.isArray(data.scene))
            {
                store.scene = data.scene;
                refreshScnList();
                snapshot();
            }
        }
        catch (e)
        {
            alert('Hibás Scene JSON.');
        }
    };
    reader.readAsText(file);
}

function downloadText(name, text)
{
    const blob = new Blob([text],
    {
        type: 'text/plain'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}

function applyMode()
{
    const m = ui.mode.value;
    ui.gpPane.style.display = (m === 'gp') ? 'block' : 'none';
    ui.grpPane.style.display = (m === 'grp') ? 'block' : 'none';
    ui.scnPane.style.display = (m === 'scn') ? 'block' : 'none';
    gpRoot.visible = (m === 'gp');
    grpRoot.visible = (m === 'grp');
    scnRoot.visible = (m === 'scn');
    drawGPPreview();
    drawGRPPreview();
    drawScene();
}
ui.mode.addEventListener('change', applyMode);

ui.exportXML.addEventListener('click', exportSceneFlattenXML);
ui.saveJSON.addEventListener('click', saveJSON);
ui.loadJSON.addEventListener('change', () =>
{
    if (ui.loadJSON.files[0]) loadJSON(ui.loadJSON.files[0]);
});
ui.saveSceneJSON.addEventListener('click', saveSceneJSON);
ui.loadSceneJSON.addEventListener('change', () =>
{
    if (ui.loadSceneJSON.files[0]) loadSceneJSON(ui.loadSceneJSON.files[0]);
});
ui.exportGameXML.addEventListener('click', exportGameXML);
ui.importGameXML.addEventListener('change', () =>
{
    if (ui.importGameXML.files[0]) importGameXML(ui.importGameXML.files[0]);
});

ui.undoBtn.addEventListener('click', doUndo);
ui.redoBtn.addEventListener('click', doRedo);

// ===== Seed demo =====
(function seedDemo()
{
    const demo = {
        name: 'DrawingBoardCube0.5mx0.5m04',
        parts: [
        {
            id: crypto.randomUUID(),
            type: 'box',
            color: '#c77f3a',
            scale: [0.8, 0.8, 1.8],
            pos: [0, 0.4, 0],
            rotRYP: [0, 0, 0]
        }]
    };
    store.gamePrimitives[demo.name] = demo;
    const elbowGP = {
        name: 'ArcPalast90',
        parts: [
        {
            id: crypto.randomUUID(),
            type: 'arcCyl',
            arc:
            {
                inner: 0.4,
                outer: 0.6,
                angle: 90
            },
            color: '#6aa6d6',
            scale: [1, 1, 1],
            pos: [0, 0.5, 0],
            rotRYP: [0, 0, 0]
        }]
    };
    store.gamePrimitives[elbowGP.name] = elbowGP;
    const column = {
        name: 'Column3',
        items: [
        {
            refType: 'gp',
            refName: demo.name,
            pos: [0, 0, 0],
            rotRYP: [0, 0, 0],
            scale: [1, 1, 1]
        },
        {
            refType: 'gp',
            refName: demo.name,
            pos: [0, 0, 2.0],
            rotRYP: [0, 0, 0],
            scale: [1, 1, 1]
        },
        {
            refType: 'gp',
            refName: demo.name,
            pos: [0, 0, 4.0],
            rotRYP: [0, 0, 0],
            scale: [1, 1, 1]
        }]
    };
    store.groups[column.name] = column;
    store.scene.push(
    {
        refType: 'grp',
        refName: 'Column3',
        pos: [-2, 0, -2],
        rotRYP: [0, 0, 0],
        scale: [1, 1, 1]
    });
    store.scene.push(
    {
        refType: 'gp',
        refName: demo.name,
        pos: [2, 0, 2],
        rotRYP: [0, 45, 0],
        scale: [1, 1, 1]
    });
    store.scene.push(
    {
        refType: 'gp',
        refName: 'ArcPalast90',
        pos: [-3, 0, 3],
        rotRYP: [0, 0, 0],
        scale: [1, 1, 1]
    });
    refreshGPList();
    refreshGrpList();
    refreshScnSourceOptions();
    applyMode();
    refreshScnList();
    snapshot();
})();

// ===== Önellenőrző tesztek =====
function diag(msg, ok)
{
    const li = document.createElement('li');
    li.className = ok ? 'pass' : 'fail';
    li.textContent = (ok ? 'PASS: ' : 'FAIL: ') + msg;
    ui.diagOut.appendChild(li);
}

function clearDiag()
{
    ui.diagOut.innerHTML = '';
}

function runSelfTests()
{
    clearDiag();
    try
    {
        const g = buildArcCylGeometry(0.3, 0.5, 90, 1);
        diag('ArcCyl geometry létrejött és BufferGeometry', g instanceof THREE.BufferGeometry);
    }
    catch (e)
    {
        diag('ArcCyl geometry kivétel nélkül fut', false);
    }
    try
    {
        rebuildAllBounds();
        diag('rebuildAllBounds lefut hiba nélkül', true);
    }
    catch (e)
    {
        diag('rebuildAllBounds hiba nélkül', false);
    }
    try
    {
        drawScene();
        diag('drawScene lefut', true);
    }
    catch (e)
    {
        diag('drawScene lefut', false);
    }
    try
    {
        copySelection();
        diag('Másolás üres kijelölésnél nem omlik', true);
    }
    catch (e)
    {
        diag('Másolás üres kijelölésnél', false);
    }
    try
    {
        snapshot();
        doUndo();
        doRedo();
        diag('Undo/Redo stack működik', true);
    }
    catch (e)
    {
        diag('Undo/Redo stack hiba', false);
    }
    try
    {
        diag('Globális script betöltve', !!window.__scriptLoaded);
    }
    catch (e)
    {
        diag('Globális script betöltve', false);
    }
}

ui.runTests.addEventListener('click', runSelfTests);

function tick()
{
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}

updateCamera();
drawScene();
window.__scriptLoaded = true;
tick();
// *** PATCHED by ChatGPT on 2025-11-11 ***
// Original filename: gen_3d.js
// Summary: remove reliance on window.currentGP/currentGRP; use active name + selection Sets only.

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



function composeTRS(parent, child)
{
    const toRad = THREE.MathUtils.degToRad;
    const toDeg = THREE.MathUtils.radToDeg;

    const tParent = new THREE.Vector3(parent.pos[0], parent.pos[1], parent.pos[2]);
    const tChild  = new THREE.Vector3(child.pos[0],  child.pos[1],  child.pos[2]);

    const eParent = new THREE.Euler(
        toRad(parent.rotRYP[0]),
        toRad(parent.rotRYP[1]),
        toRad(parent.rotRYP[2]),
        "XYZ"
    );
    const eChild = new THREE.Euler(
        toRad(child.rotRYP[0]),
        toRad(child.rotRYP[1]),
        toRad(child.rotRYP[2]),
        "XYZ"
    );

    const qParent = new THREE.Quaternion().setFromEuler(eParent);
    const qChild  = new THREE.Quaternion().setFromEuler(eChild);

    const sParent = new THREE.Vector3(parent.scale[0], parent.scale[1], parent.scale[2]);
    const sChild  = new THREE.Vector3(child.scale[0],  child.scale[1],  child.scale[2]);

    const mParent = new THREE.Matrix4().compose(tParent, qParent, sParent);
    const mChild  = new THREE.Matrix4().compose(tChild,  qChild,  sChild);

    const mCombined = new THREE.Matrix4().multiplyMatrices(mParent, mChild);

    const tOut = new THREE.Vector3();
    const qOut = new THREE.Quaternion();
    const sOut = new THREE.Vector3();
    mCombined.decompose(tOut, qOut, sOut);

    const eOut = new THREE.Euler().setFromQuaternion(qOut, "XYZ");

    return {
        pos:    [tOut.x,                 tOut.y,                 tOut.z],
        rotRYP: [toDeg(eOut.x),          toDeg(eOut.y),          toDeg(eOut.z)],
        scale:  [sOut.x,                 sOut.y,                 sOut.z],
    };
}


function flattenGroupInstanceToScene(grpName, parentTRS, parentHidden, out)
{
    const grp = store.groups?.[grpName];
    if (!grp || !Array.isArray(grp.items))
    {
        return;
    }

    grp.items.forEach((it) =>
    {
        const childTRS =
        {
            pos:    it.pos    || [0, 0, 0],
            rotRYP: it.rotRYP || [0, 0, 0],
            scale:  it.scale  || [1, 1, 1],
        };

        const combinedTRS = composeTRS(parentTRS, childTRS);
        const combinedHidden = !!(parentHidden || it.hidden);

        if (it.refType === "gp")
        {
            out.push(
            {
                refType: "gp",
                refName: it.refName,
                pos:     combinedTRS.pos,
                rotRYP:  combinedTRS.rotRYP,
                scale:   combinedTRS.scale,
                hidden:  combinedHidden,

                userActionValue: it.userActionValue ?? "",
            });
        }
        else if (it.refType === "grp")
        {
            // rekurzív lebontás további groupokra
            flattenGroupInstanceToScene(it.refName, combinedTRS, combinedHidden, out);
        }
        else
        {
            // ismeretlen típus – most kihagyjuk
        }
    });
}



function breakSelectedSceneGroups()
{
    // Csak Scene módban
    if (ui.mode.value !== "scn")
    {
        return;
    }

    if (scnSelSet.size === 0)
    {
        return;
    }

    const newScene = [];

    store.scene.forEach((it, idx) =>
    {
        const selected = scnSelSet.has(idx);

        // Ha nem kijelölt, vagy nem group -> változatlanul átvesszük
        if (!selected || it.refType !== "grp")
        {
            newScene.push(it);
            return;
        }

        // Kijelölt group: lebontjuk gp szintig
        const baseTRS =
        {
            pos:    it.pos    || [0, 0, 0],
            rotRYP: it.rotRYP || [0, 0, 0],
            scale:  it.scale  || [1, 1, 1],
        };
        const baseHidden = !!it.hidden;

        const flattened = [];
        flattenGroupInstanceToScene(it.refName, baseTRS, baseHidden, flattened);

        // amit visszakaptunk, az már csak gp-re hivatkozik
        flattened.forEach((item) => newScene.push(item));
    });

    store.scene = newScene;
    scnSelSet.clear();

    refreshScnList();
    snapshot();
}
ui.breakGRP.addEventListener("click", breakSelectedSceneGroups);



function matrixFromTRS(trs)
{
    const toRad = THREE.MathUtils.degToRad;

    const t = new THREE.Vector3(
        trs.pos?.[0] ?? 0,
        trs.pos?.[1] ?? 0,
        trs.pos?.[2] ?? 0
    );

    const e = new THREE.Euler(
        toRad(trs.rotRYP?.[0] ?? 0),
        toRad(trs.rotRYP?.[1] ?? 0),
        toRad(trs.rotRYP?.[2] ?? 0),
        "XYZ"
    );

    const q = new THREE.Quaternion().setFromEuler(e);

    const s = new THREE.Vector3(
        trs.scale?.[0] ?? 1,
        trs.scale?.[1] ?? 1,
        trs.scale?.[2] ?? 1
    );

    const m = new THREE.Matrix4();
    m.compose(t, q, s);
    return m;
}

function trsFromMatrix(m)
{
    const toDeg = THREE.MathUtils.radToDeg;

    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    m.decompose(t, q, s);

    const e = new THREE.Euler().setFromQuaternion(q, "XYZ");

    return {
        pos:    [t.x,          t.y,          t.z],
        rotRYP: [toDeg(e.x),   toDeg(e.y),   toDeg(e.z)],
        scale:  [s.x,          s.y,          s.z],
    };
}


function generateNewGroupName()
{
    if (!store.groups)
    {
        store.groups = {};
    }

    let i = 1;
    for (;;)
    {
        const name = "GRP_" + String(i).padStart(3, "0");
        if (!store.groups[name])
        {
            return name;
        }
        i++;
    }
}

function makeGroupFromSceneSelection()
{
    // Csak Scene módban működjön
    if (ui.mode.value !== "scn")
    {
        return;
    }

    if (!store.scene || !Array.isArray(store.scene))
    {
        return;
    }

    if (!scnSelSet || scnSelSet.size === 0)
    {
        return;
    }

    // Kijelölt Scene indexek (0..N-1), rendezve
    const scene = store.scene;
    const selIndices = Array.from(scnSelSet)
        .filter(i => i >= 0 && i < scene.length)
        .sort((a, b) => a - b);

    if (selIndices.length === 0)
    {
        return;
    }

    // Legelső kijelölt elem legyen az új group "origója"
    const baseIdx  = selIndices[0];
    const baseItem = scene[baseIdx];

    // Csak gp/grp típusokkal foglalkozunk
    if (baseItem.refType !== "gp" && baseItem.refType !== "grp")
    {
        return;
    }

    const baseTRS =
    {
        pos:    baseItem.pos    || [0, 0, 0],
        rotRYP: baseItem.rotRYP || [0, 0, 0],
        scale:  baseItem.scale  || [1, 1, 1],
    };

    const mBase    = matrixFromTRS(baseTRS);
    const mBaseInv = new THREE.Matrix4().copy(mBase).invert();

    // Új group tagjai
    const newGroupItems = [];

    selIndices.forEach(idx =>
    {
        const it = scene[idx];

        if (it.refType !== "gp" && it.refType !== "grp")
        {
            // ismeretlen típus – kihagyhatjuk
            return;
        }

        const childTRS =
        {
            pos:    it.pos    || [0, 0, 0],
            rotRYP: it.rotRYP || [0, 0, 0],
            scale:  it.scale  || [1, 1, 1],
        };

        const mChild  = matrixFromTRS(childTRS);
        const mLocal  = new THREE.Matrix4().multiplyMatrices(mBaseInv, mChild);
        const localTRS = trsFromMatrix(mLocal);

        newGroupItems.push(
        {
            refType: it.refType,
            refName: it.refName,
            pos:     localTRS.pos,
            rotRYP:  localTRS.rotRYP,
            scale:   localTRS.scale,
            hidden:  !!it.hidden,

                        // Itt hozzuk magunkkal az action értéket is:
            userActionValue: it.userActionValue ?? "",
        });
    });

    if (newGroupItems.length === 0)
    {
        return;
    }

    // Új group név és definíció
    const grpName = generateNewGroupName();

    if (!store.groups)
    {
        store.groups = {};
    }

    store.groups[grpName] =
    {
        items: newGroupItems,
    };

    // Új Scene elem, ami az új groupot hivatkozza
    const newSceneItem =
    {
        refType: "grp",
        refName: grpName,
        pos:     baseTRS.pos.slice(),
        rotRYP:  baseTRS.rotRYP.slice(),
        scale:   baseTRS.scale.slice(),
        hidden:  !!baseItem.hidden,
    };

    // Scene lista újraépítése:
    // - a legkisebb index helyére kerül az új group
    // - a többi kijelölt elem eltűnik
    const newScene     = [];
    const selIndexSet  = new Set(selIndices);
    let   inserted     = false;
    let   newIndex     = -1;

    scene.forEach((it, idx) =>
    {
        if (idx === baseIdx)
        {
            newIndex = newScene.length;
            newScene.push(newSceneItem);
            inserted = true;
        }

        if (selIndexSet.has(idx))
        {
            // Ezt már az új group képviseli -> nem vesszük át
            return;
        }

        // Nem kijelölt elem -> változatlanul átmegy
        newScene.push(it);
    });

    store.scene = newScene;

    // Kijelölés: csak az új group legyen kijelölve
    scnSelSet.clear();
    if (newIndex >= 0)
    {
        scnSelSet.add(newIndex);
    }

    refreshScnList();
    snapshot();
}

    ui.makeGRP.addEventListener("click", () =>
    {
        makeGroupFromSceneSelection();
    });
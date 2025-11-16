// generator_3d.js
import './gen_state.js';
import './gen_3d.js';

import {
  gpSelSet,
  grpSelSet,
  scnSelSet,
  clSelSet,
  cpSelSet
} from './gen_state.js';

import {
getActiveGP,
getActiveGRP,
refreshPartList,
refreshGrpItemList,
drawGPPreview,
clearSelections,
rebuildAllBounds,
drawGRPPreview,
}from './gen_3d.js';



// ===== Copy / Paste / Duplicate / Visibility / Delete =====
//let clipboard = null; // {mode, items: deep-cloned}


//get context by mode
function getCtxByMode(mode = ui.mode.value)
{
    if (mode === "gp")
    {
        const gp = getActiveGP?.();
        if (!gp) { return null; }
        return { mode: "gp", arr: gp.parts ?? [], sel: gpSelSet };
    }
    if (mode === "grp")
    {
        const grp = getActiveGRP?.();
        if (!grp) { return null; }
        return { mode: "grp", arr: grp.items ?? [], sel: grpSelSet };
    }
    return { mode: "scn", arr: store.scene ?? [], sel: scnSelSet };
}


// ===== COPY =====
function copySelection()
{
    const ctx = getCtxByMode();
    if (!ctx || !ctx.sel || ctx.sel.size === 0) { return; }

    const { mode, arr, sel } = ctx;
    const indices = Array.from(sel);
    const items = [];

    for (const i of indices)
    {
        const it = arr[i];
        if (it) { items.push(cloneDeep(it)); }
    }
    if (items.length === 0) { return; }

    window.appClipboard.mode  = mode;
    window.appClipboard.items = items;
    // console.log("COPY ok:", mode, items.length);
}



function pasteClipboard(targetMode = ui.mode.value)
{
     console.log("[Paste]");

    targetMode = ui.mode.value
    const clipboard = window.appClipboard;





    if (!clipboard || !Array.isArray(clipboard.items) || clipboard.items.length === 0)
    {
        return;
    }

    console.log("[Paste](2)");
    console.log("targetmode:",targetMode);


    snapshot?.();

    //const off = [0.2, 0, 0.2]; // kis eltolás, hogy látszódjon az új példány
    const off = [0.0, 0.0, 0.0]; // kis eltolás, hogy látszódjon az új példány


    // -------- GP cél --------
    if (targetMode === "gp")
    {
        const gp = getActiveGP?.();
        if (!gp) { return; }

        const base = gp.parts.length;

        console.log("[Paste](2b - gp)");

        clipboard.items.forEach((it) =>
        {
            console.log("[Paste](3)");
            const p = cloneDeep(it);
            p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
            gp.parts.push(p);
        });

        const newIdx = Array.from({ length: clipboard.items.length }, (_, k) => base + k);

        clearSelections?.();
        setSelect(gpSelSet, newIdx);

        refreshPartList?.();
        drawGPPreview?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }

    // -------- GRP cél --------
    if (targetMode === "grp")
    {

        const grp = getActiveGRP?.();
        if (!grp) { return; }

        const activeName = getActiveGRPName();
        const base = grp.items.length;
        const appendedIndices = [];

        if (clipboard.mode === "grp")
        {

            console.log("[Paste](grp / grp)");

            let acc = 0;
            clipboard.items.forEach((it) =>
            {
                console.log("[Paste](3)");

                const t = it.refType ?? "gp";

                if (isSelfGrpRef(t, it.refName, activeName))
                {
                    console.warn("GRP→GRP paste: saját csoport önbeágyazás tiltva:", it.refName);
                    return;
                }

                const p = normalizeGrpItemLike(it);
                p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];

                grp.items.push(p);
                appendedIndices.push(base + acc);
                acc++;
            });
        }
        else if (clipboard.mode === "scn")
        {
          console.log("[Paste](grp / scn)");
            let acc = 0;
            clipboard.items.forEach((it) =>
            {
                const mapped = mapScnItemToGrpItem(it, activeName);
                if (!mapped) { return; }

                mapped.pos = [mapped.pos[0] + off[0], mapped.pos[1] + off[1], mapped.pos[2] + off[2]];
                grp.items.push(mapped);
                appendedIndices.push(base + acc);
                acc++;
            });
        }
        else if (clipboard.mode === "gp")
        {
          console.log("[Paste](grp / gp)");
            let acc = 0;
            clipboard.items.forEach((part) =>
            {
                const mapped = mapGpPartToGrpItem(part);
                if (!mapped) { return; }

                mapped.pos = [mapped.pos[0] + off[0], mapped.pos[1] + off[1], mapped.pos[2] + off[2]];
                grp.items.push(mapped);
                appendedIndices.push(base + acc);
                acc++;
            });
        }

        clearSelections?.();

        if (appendedIndices.length > 0)
        {
            setSelect(grpSelSet, appendedIndices);
        }

        refreshGrpItemList?.();
        drawGRPPreview?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }

    // -------- SCN cél --------
    if (targetMode === "scn")
    {
        const base = store.scene.length;

        clipboard.items.forEach((it) =>
        {
            const p = cloneDeep(it);
            p.pos = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
            store.scene.push(p);
        });

        const newIdx = Array.from({ length: clipboard.items.length }, (_, k) => base + k);

        clearSelections?.();
        setSelect(scnSelSet, newIdx);

        refreshScnList?.();
        drawScene?.();
        rebuildAllBounds?.();
        snapshot?.();
        return;
    }
}


function duplicateSelection()
{
 console.log("[duupliiicate]");

  copySelection();
  pasteClipboard();
}

function toggleVisibility()
{
  const m = ui.mode.value;
  snapshot();
  if (m === "gp" && getActiveGP())
  {
    gpSelSet.forEach((i) =>
    {
      const p = getActiveGP().parts[i];
      p.hidden = !p.hidden;
    });
    refreshPartList();
    drawGPPreview();
  }
  if (m === "grp" && getActiveGRP())
  {
    grpSelSet.forEach((i) =>
    {
      const it = getActiveGRP().items[i];
      it.hidden = !it.hidden;
    });
    refreshGrpItemList();
    drawGRPPreview();
  }
  if (m === "scn")
  {
    scnSelSet.forEach((i) =>
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
  if (
    (m === "gp" && gpSelSet.size === 0) ||
    (m === "grp" && grpSelSet.size === 0) ||
    (m === "scn" && scnSelSet.size === 0)
  )
    return;
  snapshot();
  if (m === "gp" && getActiveGP())
  {
    const sorted = [...gpSelSet].sort((a, b) => b - a);
    sorted.forEach((i) => getActiveGP().parts.splice(i, 1));
    gpSelSet.clear();
    refreshPartList();
    drawGPPreview();
  }
  if (m === "grp" && getActiveGRP())
  {
    const sorted = [...grpSelSet].sort((a, b) => b - a);
    sorted.forEach((i) => getActiveGRP().items.splice(i, 1));
    grpSelSet.clear();
    refreshGrpItemList();
    drawGRPPreview();
  }
  if (m === "scn")
  {
    const sorted = [...scnSelSet].sort((a, b) => b - a);
    sorted.forEach((i) => store.scene.splice(i, 1));
    scnSelSet.clear();
    refreshScnList();
    drawScene();
  }
}






//============================================================================
//Helpers


// --- helpers ---

function getActiveGRPName()
{
    const grp = getActiveGRP?.();
    return grp?.name ?? ui.grpName?.value ?? null;
}

function cloneDeep(o)
{
    return JSON.parse(JSON.stringify(o));
}

// csak a közvetlen önbeágyazást tiltjuk
function isSelfGrpRef(itemRefType, itemRefName, activeGrpName)
{
    if (!activeGrpName) { return false; }
    return itemRefType === "grp" && itemRefName === activeGrpName;
}

// opcionális: egy helyen rendbe tesszük a mezőket
function normalizeGrpItemLike(src)
{
    return {
        refType : src.refType,                  // "gp" vagy "grp"
        refName : src.refName ?? "Unknown",     // hivatkozott név
        pos     : [...(src.pos ?? [0, 0, 0])],
        rotRYP  : [...(src.rotRYP ?? [0, 0, 0])],
        scale   : [...(src.scale ?? [1, 1, 1])],
        vis     : src.vis ?? true
    };
}

// Scene item -> GRP item (SHALLOW): engedjük "gp" és "grp" typet is
function mapScnItemToGrpItem(scnItem, activeGrpName)
{
    const t = scnItem.refType;
    if (t !== "gp" && t !== "grp")
    {
        console.warn("Scene→Group paste: ismeretlen refType, átugorva:", t, scnItem.refName);
        return null;
    }

    if (isSelfGrpRef(t, scnItem.refName, activeGrpName))
    {
        console.warn("Scene→Group paste: saját csoport önbeágyazás tiltva:", scnItem.refName);
        return null;
    }

    return normalizeGrpItemLike(scnItem);
}

// GP part -> GRP item (ha használod)
function mapGpPartToGrpItem(part, activeGrpName)
{
    // alapértelmezett: GP példányt csinálunk belőle
    const mapped = {
        refType : "gp",
        refName : part.refName ?? part.name ?? "UnknownGP",
        pos     : [...(part.pos ?? [0, 0, 0])],
        rotRYP  : [...(part.rotRYP ?? [0, 0, 0])],
        scale   : [...(part.scale ?? [1, 1, 1])],
        vis     : part.vis ?? true
    };
    // GP sosem „önmagát” referálja, itt nem kell tiltás
    return mapped;
}

function setSelect(setRef, indices)
{
    setRef.clear();
    for (const i of indices)
    {
        setRef.add(i);
    }
}



// SELECT ALL – gp/grp/scn módokra egységesen
function selectAll(targetMode = ui.mode.value)
{
    // 1) biztonsági deselect (ha van ilyen helpered)
    clearSelections?.();

    // 2) mód-specifikus kijelölés
    if (targetMode === "gp")
    {
        const gp = getActiveGP?.();
        if (!gp) { return; }

        const n = gp.parts?.length ?? 0;
        gpSelSet.clear();
        for (let i = 0; i < n; ++i)
        {
            gpSelSet.add(i);
        }

        refreshPartList?.();
        drawGPPreview?.();
    }
    else if (targetMode === "grp")
    {
        const grp = getActiveGRP?.();
        if (!grp) { return; }

        const n = grp.items?.length ?? 0;
        grpSelSet.clear();
        for (let i = 0; i < n; ++i)
        {
            grpSelSet.add(i);
        }

        refreshGrpItemList?.();
        drawGRPPreview?.();
    }
    else // "scn"
    {
        // kérés szerint: CP-k törlése scene módban
        cpSelSet?.clear?.();

        const n = store.scene?.length ?? 0;
        scnSelSet.clear();
        for (let i = 0; i < n; ++i)
        {
            scnSelSet.add(i);
        }

        refreshScnList?.();
        drawScene?.();
    }

    rebuildAllBounds?.();
    snapshot?.();
}













//------------------------------------------------------


(function setupClipboardDump()
{
    // Próbáljuk mindkettőt: globális és lokális név
    function getClipboard()
    {
        return (window.appClipboard && Array.isArray(window.appClipboard.items))
            ? window.appClipboard
            : (typeof clipboard !== "undefined" ? clipboard : null);
    }

    function briefItem(it, idx)
    {
        if (!it || typeof it !== "object") { return { idx, type: typeof it, value: it }; }

        // GP/GRP/SCN jellegű objektumok rövid összefoglalója
        const refType = it.refType ?? (it.refName ? "gp?" : undefined);
        const pos     = Array.isArray(it.pos) ? it.pos.map(n=>+n.toFixed(3)) : it.pos;
        const rotRYP  = Array.isArray(it.rotRYP) ? it.rotRYP.map(n=>+n.toFixed(3)) : it.rotRYP;
        const scale   = Array.isArray(it.scale) ? it.scale.map(n=>+n.toFixed(3)) : it.scale;

        return {
            idx,
            refType,
            refName : it.refName,
            name    : it.name,
            pos,
            rotRYP,
            scale,
            vis     : it.vis
        };
    }

    function briefSet(s)
    {
        if (!s || typeof s.size !== "number") { return []; }
        return Array.from(s.values());
    }

    function dumpClipboard()
    {
        const cb = getClipboard();
        console.groupCollapsed("%c[CLIPBOARD DUMP]", "color:#0bf;font-weight:bold");
        console.log("ui.mode:", ui?.mode?.value);
        console.log("Active GP name:", getActiveGP?.()?.name);
        console.log("Active GRP name:", getActiveGRP?.()?.name ?? ui?.grpName?.value);

        if (!cb)
        {
            console.warn("Nincs clipboard objektum (window.appClipboard / clipboard).");
            console.groupEnd();
            return;
        }

        console.log("clipboard.mode:", cb.mode);
        console.log("clipboard.items length:", Array.isArray(cb.items) ? cb.items.length : "n/a");
        if (Array.isArray(cb.items))
        {
            console.table(cb.items.map(briefItem));
        }

        // Kijelölés halmazok gyors ellenőrzése
        console.log("gpSelSet:", briefSet(window.gpSelSet));
        console.log("grpSelSet:", briefSet(window.grpSelSet));
        console.log("scnSelSet:", briefSet(window.scnSelSet));

        console.groupEnd();
    }

    // Kényelmi aliasok és globál hozzáférés
    window.dumpClipboard = dumpClipboard;
    window.dc = dumpClipboard;

    // Gyorsbillentyű: Ctrl+Shift+D
    window.addEventListener("keydown", (ev) =>
    {
        if (ev.ctrlKey && ev.shiftKey && (ev.key === "D" || ev.key === "d"))
        {
            try { dumpClipboard(); } catch (e) { console.error(e); }
        }
    });
})();



ui.copyBtn.addEventListener("click", copySelection);
ui.pasteBtn.addEventListener("click", pasteClipboard);
ui.dupBtn.addEventListener("click", duplicateSelection);
ui.toggleVisBtn.addEventListener("click", toggleVisibility);
ui.deleteBtn.addEventListener("click", deleteSelection);
ui.undoBtn.addEventListener("click", doUndo);
ui.redoBtn.addEventListener("click", doRedo);







function isTextLikeInput(el)
{
    if (!el || el.disabled) { return false; }
    const tag = el.tagName;
    if (tag === "TEXTAREA") { return !el.readOnly; }
    if (tag === "INPUT")
    {
        const t = (el.type || "").toLowerCase();
        // csak a „gépelős” típusok számítanak text-szerkesztésnek
        return !el.readOnly && (
            t === "text" || t === "search" || t === "email" ||
            t === "url"  || t === "tel"    || t === "password" ||
            t === "number" // számmezőknél is engedjük a törlést a mezőben
        );
    }
    // contenteditable elemek
    if (el.isContentEditable) { return true; }
    const ce = el.closest('[contenteditable="true"]');
    return !!ce;
}

function isEditingContext(ev)
{
    const t = ev.target;
    if (!(t instanceof Element)) { return false; }
    // ha bármi .no-global-shortcuts ősszülő alatt vagyunk, tiltjuk a globálokat
    if (t.closest(".no-global-shortcuts")) { return true; }
    return isTextLikeInput(t);
}


window.addEventListener("keydown", (ev) =>
{
    //------------------------------------
    // ctrl+A select ALL
    //------------------------------------
  
    if (ev.ctrlKey && (ev.key === "a" || ev.key === "A"))
    {
        ev.preventDefault();
        //ev.stopPropagation?.();
        selectAll(ui.mode.value);
    }


    //------------------------------------
    // delete - delete selected items
    //------------------------------------

    if (ev.key === "Delete")
    {

    if (isEditingContext(ev))
    {
        return; // semmit nem csinálunk, a mező megkapja a Delete-et
    }

      ev.preventDefault();
      deleteSelection();
    }

});

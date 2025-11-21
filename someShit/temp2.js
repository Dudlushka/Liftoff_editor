export function rebuildAllBounds()
{
    // 0) takarítás
    clearAllBounds();

    // ha ki van kapcsolva a megjelenítés, lépjünk ki
    const show = (ui.groupBoundsVis?.value === 'on');
    if (!show) return;

    // 1) szülő (aktív mód gyökere)
    const mode = ui.mode.value;
    const parent = getModeRoot(); // gpRoot,grpRoot,ScnRoot
    if (!parent) return;

    parent.updateMatrixWorld(true);
    
    //const parentWorldInv = parent.matrixWorld.clone().invert();
    const parentWorldInv = parent.matrixWorld.clone();



    // segéd: egy adott userData kiválasztott-e az aktuális módban
    function isSelectedUd(ud)
    {
        if (!ud) return false;
        if (mode === 'gp'  && ud.pickKind === 'gpPart')  return gpSelSet.has(ud.index);
        if (mode === 'grp' && ud.pickKind === 'grpItem') return grpSelSet.has(ud.index);
        if (mode === 'scn' && ud.pickKind === 'scnItem') return scnSelSet.has(ud.index);
        return false;
    }

    // ide gyűjtjük a kiválasztott node-okat az összesítő (union) kerethez
    const selectedNodes = [];

    // 2) GP/GRP/SCN objektumok keretei – CSAK az aktív gyökérben
    parent.traverse(o =>
    {
        const ud = o?.userData;
        if (!ud) return;

        const pk = ud.pickKind;

        if (pk !== 'gpPart' && pk !== 'grpItem' && pk !== 'scnItem') return;
        if (o.visible === false) return;

        //TODO: majd rendesen, hogy a groupok azért látszódjanak
       const selected = isSelectedUd(ud);
        if (pk === 'scnItem' && !selected)
        {
            return;
        }

        // világ AABB → aktív gyökér lokáltér
        
        const boxW = new THREE.Box3().setFromObject(o);
        const boxL = boxW.clone().applyMatrix4(parentWorldInv);
        const color = isSelectedUd(ud) ? 0xff3333 : 0x0077ff; // piros = kijelölt, kék = nem
        const helper = new THREE.Box3Helper(boxL, color);
        markHelper(helper);
        parent.add(helper);
        

        if (isSelectedUd(ud)) selectedNodes.push(o);
    });

    // 3) Kijelölt CP-k piros keretei
    // Megjegyzés: ha a CP-k külön clRoot alatt vannak, ott számolunk és oda is tesszük.

    let cpNodesForHull = []; // csak akkor teszünk be a unionba, ha ugyanazon szülő alatt vannak
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

                  // DEBUG: nézzük meg, mik jönnek
                  /*
                  console.log('CP traverse', {
                    name: o.name,
                    ud,
                    visible: o.visible,
                    isCP: ud?.pickKind === 'cp',
                    lineIdx: ud?.lineIdx,
                    pointIdx: ud?.pointIdx,
                  });
                  */


            // >>> Itt a lényeg: ha van cpCenterBox, csak azt vegyük a kerethez
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
        if (cpParent === parent) cpNodesForHull = foundCpNodes;
    }

    // 4) Összesítő (union) keret a teljes kiválasztott halmaz köré (narancs)
    const hullCandidates = selectedNodes.concat(cpNodesForHull);
    if (hullCandidates.length >= 2)
    {
        let unionL = null;
        hullCandidates.forEach(n =>
        {
            const bW = new THREE.Box3().setFromObject(n);
            const bL = bW.clone().applyMatrix4(parentWorldInv);
            unionL = unionL ? unionL.union(bL) : bL;
        });
        if (unionL && !unionL.isEmpty())
        {
            const hull = new THREE.Box3Helper(unionL, 0xff9900); // narancs
            markHelper(hull);
            parent.add(hull);
        }
    }
}



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
      p.pos    = [ (p.pos?.[0]??0)+dpos[0],  (p.pos?.[1]??0)+dpos[1],  (p.pos?.[2]??0)+dpos[2] ];
      p.rotRYP = [ (p.rotRYP?.[0]??0)+drot[0], (p.rotRYP?.[1]??0)+drot[1], (p.rotRYP?.[2]??0)+drot[2] ];
      p.scale  = [ (p.scale?.[0]??1)+dscale[0], (p.scale?.[1]??1)+dscale[1], (p.scale?.[2]??1)+dscale[2] ];
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
      it.pos    = [ (it.pos?.[0]??0)+dpos[0],  (it.pos?.[1]??0)+dpos[1],  (it.pos?.[2]??0)+dpos[2] ];
      it.rotRYP = [ (it.rotRYP?.[0]??0)+drot[0], (it.rotRYP?.[1]??0)+drot[1], (it.rotRYP?.[2]??0)+drot[2] ];
      it.scale  = [ (it.scale?.[0]??1)+dscale[0], (it.scale?.[1]??1)+dscale[1], (it.scale?.[2]??1)+dscale[2] ];
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
          cp.pos    = [ (cp.pos?.[0]??0)+dpos[0],  (cp.pos?.[1]??0)+dpos[1],  (cp.pos?.[2]??0)+dpos[2] ];
          cp.rotRYP = [ (cp.rotRYP?.[0]??0)+drot[0], (cp.rotRYP?.[1]??0)+drot[1], (cp.rotRYP?.[2]??0)+drot[2] ];
          // (CP-ket tipikusan nem scale-eljük; ha kell, itt kezeld)
        });

        fillScnEditors?.();
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
      it.pos    = [ (it.pos?.[0]??0)+dpos[0],  (it.pos?.[1]??0)+dpos[1],  (it.pos?.[2]??0)+dpos[2] ];
      it.rotRYP = [ (it.rotRYP?.[0]??0)+drot[0], (it.rotRYP?.[1]??0)+drot[1], (it.rotRYP?.[2]??0)+drot[2] ];
      it.scale  = [ (it.scale?.[0]??1)+dscale[0], (it.scale?.[1]??1)+dscale[1], (it.scale?.[2]??1)+dscale[2] ];
    });

    fillScnEditors?.(false);
    drawScene?.();          // (CL-ek külön rajzolódnak)
    rebuildAllBounds?.();
    snapshot?.();
  }
}

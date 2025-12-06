
//----------------------------------
import { worldRoot, gpRoot, grpRoot, scnRoot, clRoot } from './gen_roots.js';
import {
  gpSelSet,
  grpSelSet,
  scnSelSet,
  clSelSet,
  cpSelSet
} from './gen_state.js';
import {currentCLIndex,setCurrentCLIndex}from './gen_state.js';
import { refreshCPListHighlight, refreshCPList, syncSceneEditorsFromFirstCP, RefreshCL_AAA} from './gen_controlLines.js';
import {snapshot}from './gen_undo.js';

const deg = (v) => (v * Math.PI) / 180;

// ===== Export / Import =====



ui.saveJSON.addEventListener("click", saveJSON);
ui.loadJSON.addEventListener("change", () =>
{
  if (ui.loadJSON.files[0]) loadJSON(ui.loadJSON.files[0]);
});
ui.saveSceneJSON.addEventListener("click", saveSceneJSON);
ui.loadSceneJSON.addEventListener("change", () =>
{
  if (ui.loadSceneJSON.files[0]) loadSceneJSON(ui.loadSceneJSON.files[0]);
});
ui.exportGameXML.addEventListener("click", exportGameXML);
ui.importGameXML.addEventListener("change", () =>
{
  if (ui.importGameXML.files[0]) importGameXML(ui.importGameXML.files[0]);
});



//--------------------------------------------------------------------------

function generateUUIDv4()
{
    // Biztonságosabb: crypto.getRandomValues, ha van
    
    if (window.crypto && window.crypto.getRandomValues)
    {
      console.log("with cripto lib");
        const buf = new Uint8Array(16);
        window.crypto.getRandomValues(buf);

        // RFC 4122: version (4) és variant bitek beállítása
        buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
        buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10xx

        const hex = Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");

        return (
            hex.slice(0, 8) + "-" +
            hex.slice(8, 12) + "-" +
            hex.slice(12, 16) + "-" +
            hex.slice(16, 20) + "-" +
            hex.slice(20)
        );
    }

    // Fallback: ha nincs crypto, akkor sima Math.random (kevésbé szép, de elég editorhoz)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c =>
    {
      console.log("no cripto lib");

        const r = Math.random() * 16 | 0;
        const v = (c === "x") ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

//------------------------------------------------------------------------------

ui.genUUID?.addEventListener("click", () =>
{
    ui.trackUUID.value = generateUUIDv4();
});




function getTrackExportFilename()
{
    let uuid = (ui.trackUUID?.value || "").trim();

    // ha nincs UUID beírva, generálunk egyet és beírjuk a mezőbe is
    if (!uuid)
    {
        uuid = generateUUIDv4?.() || "noname";
        if (ui.trackUUID)
        {
            ui.trackUUID.value = uuid;
        }
    }

    // ha valamiért nem UUID-szerű, akkor is elmegy névnek
    return `${uuid}_0001.track`;
}

//asdasd





function exportGameXML()
{
  const name = ui.trackName.value.trim() || "Unnamed";
  const uuid =
    ui.trackUUID.value.trim() || "00000000-0000-0000-0000-000000000000";
  const ver = ui.gameVersion.value.trim() || "1.6.17";

  const env = ui.trackEnvironment.value.trim() || "TheDrawingBoard";

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
  <environment>${env}</environment>
  <blueprints>
`;
  let instanceID = 1;

  const radToDeg = THREE.MathUtils?.radToDeg
    ? THREE.MathUtils.radToDeg
    : (r) => (r * 180) / Math.PI;

  function normalizeDeg(d)
  {
    d = d % 360;
    if (d < 0) d += 360;
    return d;
  }

  function isUnitScale(v)
  {
    const eps = 1e-4;
    return (
      Math.abs(v.x - 1) < eps &&
      Math.abs(v.y - 1) < eps &&
      Math.abs(v.z - 1) < eps
    );
  }

  function exportNode(node, parentMatrix)
  {
    const M  = new THREE.Matrix4();
    const Rx = new THREE.Matrix4().makeRotationX(deg(node.rotRYP[0]));
    const Ry = new THREE.Matrix4().makeRotationY(deg(node.rotRYP[1]));
    const Rz = new THREE.Matrix4().makeRotationZ(deg(node.rotRYP[2]));
    const S  = new THREE.Matrix4().makeScale(
      node.scale[0],
      node.scale[1],
      node.scale[2],
    );
    const T  = new THREE.Matrix4().makeTranslation(
      node.pos[0],
      node.pos[1],
      node.pos[2],
    );

    M.multiply(parentMatrix)
      .multiply(T)
      .multiply(Rx)
      .multiply(Ry)
      .multiply(Rz)
      .multiply(S);

    if (node.refType === "gp")
    {
      const pos  = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl  = new THREE.Vector3();
      M.decompose(pos, quat, scl);

      // Game uses YXZ intrinsic order
      const eul = new THREE.Euler().setFromQuaternion(quat, "YXZ");

      let ex = normalizeDeg(radToDeg(eul.x));
      let ey = normalizeDeg(radToDeg(eul.y));
      let ez = normalizeDeg(radToDeg(eul.z));

      // Look up GP
      const gp = store.gamePrimitives?.[node.refName];

      // XSI type közvetlenül a GP-n
      // Fallback régi scalable flag alapján, hogy a régi projektek se dőljenek el
      let xsiType = gp?.xsiType;
      if (!xsiType)
      {
        const legacyScalable = !!gp?.scalable;
        xsiType = legacyScalable
          ? "TrackBlueprintFlexibleFlag"
          : "TrackBlueprintFlag";
      }

      // Skála export szabály:
      // - csak akkor írunk <scale>-t, ha:
      //   - TrackBlueprintAction, vagy
      //   - TrackBlueprintFlexibleFlag
      const exportScale =
        xsiType === "TrackBlueprintAction" ||
        xsiType === "TrackBlueprintFlexibleFlag";

      // Warn, ha Flag-hez nem egységskála tartozik (a játék úgysem skálázza)
      if (!exportScale && !isUnitScale(scl))
      {
        console.warn(
          "[exportGameXML] GP instance has non-unit scale but blueprint type does not support scaling. " +
          "Scaling will be ignored.",
          {
            refName: node.refName,
            xsiType,
            pos: { x: pos.x, y: pos.y, z: pos.z },
            scale: { x: scl.x, y: scl.y, z: scl.z }
          }
        );
      }

      xml += `    <TrackBlueprint xsi:type=\"${xsiType}\">
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
        <x>${ex}</x>
        <y>${ey}</y>
        <z>${ez}</z>
      </rotation>
`;

      if (exportScale)
      {
        xml += `      <scale>
        <x>${scl.x}</x>
        <y>${scl.y}</y>
        <z>${scl.z}</z>
      </scale>
`;
      }

      xml += `    </TrackBlueprint>
`;
    }
    else
    {
      const grp = store.groups[node.refName];
      if (!grp) return;
      grp.items.forEach((child) => exportNode(child, M));
    }
  }

  const I = new THREE.Matrix4();
  store.scene.forEach((root) => exportNode(root, I));

  xml += `  </blueprints>
  <hideDefaultSpawnpoint>false</hideDefaultSpawnpoint>
</Track>
`;
  
  //downloadText("track_export.track", xml);

  const fname = getTrackExportFilename();
  downloadText(fname, xml);
}




//--------------------------------------------------
//YXZ to our XYZ
//--------------------------------------------------
function importGameXML(file)
{
  console.log("import track file:",file);
  const reader = new FileReader();
  reader.onload = () =>
  {
    try
    {
      const text = String(reader.result);
      const dom = new DOMParser().parseFromString(text, "application/xml");

      const name = dom.querySelector("Track > name")?.textContent || "Imported";
      const uuid = dom.querySelector("Track > localID > str")?.textContent || "00000000-0000-0000-0000-000000000000";
      const ver = dom.querySelector("Track > gameVersion")?.textContent || "1.6.17";
      const env = dom.querySelector("Track > environment")?.textContent || "error";

      ui.trackName.value    = name;
      ui.trackUUID.value    = uuid;
      ui.gameVersion.value  = ver;
      ui.trackEnvironment.value = env;

      store.scene.length = 0;

      const degToRad = THREE.MathUtils?.degToRad
        ? THREE.MathUtils.degToRad
        : (d) => d * Math.PI / 180;
      const radToDeg = THREE.MathUtils?.radToDeg
        ? THREE.MathUtils.radToDeg
        : (r) => r * 180 / Math.PI;

      dom.querySelectorAll("blueprints > TrackBlueprint").forEach((bp) =>
      {
        // blueprint type: pl. TrackBlueprintFlag / TrackBlueprintFlexibleFlag / TrackBlueprintAction
        const bpType = bp.getAttribute("xsi:type") || "";

        // --- itemID, trimmed ---
        let rawItemID =
          bp.querySelector("itemID")?.textContent || "UnknownItem";

        let itemID = String(rawItemID);
        const trimmedItemID = itemID.trim();

        if (trimmedItemID !== itemID)
        {
          console.log(
            "[importGameXML] itemID trimmed:",
            JSON.stringify(itemID),
            "->",
            JSON.stringify(trimmedItemID)
          );
        }
        itemID = trimmedItemID;

        // --- position ---
        const px = parseFloat(bp.querySelector("position > x")?.textContent || "0");
        const py = parseFloat(bp.querySelector("position > y")?.textContent || "0");
        const pz = parseFloat(bp.querySelector("position > z")?.textContent || "0");

        // --- rotation from game (YXZ intrinsic) ---
        const rxGame = parseFloat(bp.querySelector("rotation > x")?.textContent || "0");
        const ryGame = parseFloat(bp.querySelector("rotation > y")?.textContent || "0");
        const rzGame = parseFloat(bp.querySelector("rotation > z")?.textContent || "0");

        const eGame = new THREE.Euler(
          degToRad(rxGame),
          degToRad(ryGame),
          degToRad(rzGame),
          "YXZ"
        );
        const q = new THREE.Quaternion().setFromEuler(eGame);

        // Convert to editor's XYZ euler
        const eLocal = new THREE.Euler().setFromQuaternion(q, "XYZ");

        const rxLocal = radToDeg(eLocal.x);
        const ryLocal = radToDeg(eLocal.y);
        const rzLocal = radToDeg(eLocal.z);

        // --- scale (if present) ---
        const sx = parseFloat(bp.querySelector("scale > x")?.textContent || "1");
        const sy = parseFloat(bp.querySelector("scale > y")?.textContent || "1");
        const sz = parseFloat(bp.querySelector("scale > z")?.textContent || "1");
        const scaleArr = [sx, sy, sz];

        // Ensure GP exists
        if (!store.gamePrimitives[itemID])
        {
          store.gamePrimitives[itemID] = {
            name: itemID,
            parts: [
              {
                id: crypto.randomUUID(),
                type: "box",
                color: "#9aa7b1",
                scale: [1, 1, 1],
                pos: [0, 0, 0],
                rotRYP: [0, 0, 0],
              },
            ],
            // ÚJ: XSI_Type közvetlenül a GP szinten
            xsiType: bpType || "TrackBlueprintFlag",
          };
        }
        else
        {
          const gp = store.gamePrimitives[itemID];

          // Ha még nincs beállítva az xsiType, vegyük át az importált típust
          if (!gp.xsiType && bpType)
          {
            gp.xsiType = bpType;
          }
        }

        // Add scene node, now using imported scale
        store.scene.push({
          refType: "gp",
          refName: itemID,
          pos: [px, py, pz],
          rotRYP: [rxLocal, ryLocal, rzLocal],
          scale: scaleArr,
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
      console.error(e);
      alert("XML import hiba.");
    }
  };
  reader.readAsText(file);

  console.log("import finished",file);
}






function saveJSON()
{
  const data = {
    gamePrimitives: store.gamePrimitives,
    groups: store.groups,
  };
  downloadText("library.json", JSON.stringify(data, null, 2));
}



function saveJSON_GRPonly()
{
  const data = {
    //gamePrimitives: store.gamePrimitives,
    groups: store.groups,
  };
  downloadText("GRPlibrary.json", JSON.stringify(data, null, 2));
}
ui.saveJSONGRP.addEventListener("click", saveJSON_GRPonly);




function applyLibraryDataObject(data)
{
  if (data.gamePrimitives) store.gamePrimitives = data.gamePrimitives;
  if (data.groups) store.groups = data.groups;


  grpRoot.clear();
  gpRoot.clear();

  refreshGPList();
  refreshGrpList();
  refreshScnSourceOptions();
  // itt még nem snapshot-olunk; azt a hívó döntse el
}









function deepClone(obj)
{
  return JSON.parse(JSON.stringify(obj));
}







function normalizeGPXsiType(gp)
{
  if (!gp || typeof gp !== "object")
  {
    return;
  }

  const hasXsi =
    typeof gp.xsiType === "string" &&
    gp.xsiType.trim() !== "";

  if (!hasXsi)
  {
    console.log("noXsi")
    // régi scalable alapján döntünk
    if (gp.scalable === true)
    {
      gp.xsiType = "TrackBlueprintFlexibleFlag";
    }
    else
    {
      gp.xsiType = "TrackBlueprintFlag";
    }
  }
  else
  {
    console.log("hasXsi")
  }

  // scalable mező eltakarítása
  if ("scalable" in gp)
  {
    delete gp.scalable;
  }
}

function migrateExistingGPsXsiType()
{
  const gps = store.gamePrimitives || {};
  for (const gp of Object.values(gps))
  {
    normalizeGPXsiType(gp);
  }
}




/**
 * data: { gamePrimitives?: Record<string, GP>, groups?: Record<string, GRP> }
 * Viselkedés:
 *  - ha a név létezik: felülírjuk az újból kapottal (deep clone)
 *  - ha nincs: hozzáadjuk
 *  - semmit nem törlünk a meglévőkből
 */
/*
function mergeLibraryData(data)
{
  if (data?.gamePrimitives && typeof data.gamePrimitives === "object")
  {
    for (const [name, gp] of Object.entries(data.gamePrimitives))
    {
      store.gamePrimitives[name] = deepClone(gp);
    }
  }
  if (data?.groups && typeof data.groups === "object")
  {
    for (const [name, grp] of Object.entries(data.groups))
    {
      store.groups[name] = deepClone(grp);
    }
  }
}*/

function mergeLibraryData(data)
{
  if (data?.gamePrimitives && typeof data.gamePrimitives === "object")
  {
    for (const [name, gp] of Object.entries(data.gamePrimitives))
    {
      // előbb normalizáljuk (xsiType + scalable törlése)
      const cloned = deepClone(gp);
      normalizeGPXsiType(cloned);
      store.gamePrimitives[name] = cloned;
    }
  }

  if (data?.groups && typeof data.groups === "object")
  {
    for (const [name, grp] of Object.entries(data.groups))
    {
      store.groups[name] = deepClone(grp);
    }
  }
}


function loadJSON(file)
{
  const reader = new FileReader();
  reader.onload = () =>
  {
    try
    {
      const data = JSON.parse(String(reader.result));

      // *** itt a merge, nincs törlés ***
      mergeLibraryData(data);

      refreshGPList();
      refreshGrpList();
      refreshScnSourceOptions();
      snapshot();
      console.info("[library] JSON merge kész a fájlból:", file.name);
    }
    catch (e)
    {
      console.error(e);
      alert("Hibás JSON.");
    }
  };
  reader.readAsText(file);
}



//------------------------------------------------
// 
//------------------------------------------------

async function loadLibraryFromURL(url)
{

  console.log("picsa");

  try
  {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return false;
    const data = await res.json();
    applyLibraryDataObject(data);
    console.log("[init] Könyvtár betöltve:", url);
    migrateExistingGPsXsiType();
    return true;
  }
  catch (err)
  {
    console.warn("[init] Könyvtár nem tölthető:", url, err);
    return false;
  }


  
}

window.loadLibraryFromURL       = loadLibraryFromURL;

//------------------------------------------------
// 
//------------------------------------------------


function saveSceneJSON()
{
  const payload = {
    scene: store.scene,
    controlLines: Array.isArray(store.controlLines) ? store.controlLines : [],
  };
  downloadText("scene.json", JSON.stringify(payload, null, 2));
}


//------------------------------------------------
// 
//------------------------------------------------

function loadSceneJSON(file)
{
  const reader = new FileReader();
  reader.onload = () =>
  {
    //try{
      const data = JSON.parse(String(reader.result));
      
      if (Array.isArray(data.scene))
      {
        store.scene = data.scene;
        refreshScnList();
        snapshot();
      }



      if( Array.isArray(data.controlLines))
      {
        store.controlLines = data.controlLines;


        cpSelSet?.clear?.();
        setCurrentCLIndex(-1);

      // Ha vannak saját CL-pane frissítők, hívd meg őket biztonságosan:
        drawControlLines?.();
        RefreshCL_AAA()
      }

    //}catch (e){alert("Hibás Scene JSON.");}
  
  


  };
  reader.readAsText(file);
}


//------------------------------------------------
// 
//------------------------------------------------

function downloadText(name, text)
{
  const blob = new Blob([text], {
    type: "text/plain",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
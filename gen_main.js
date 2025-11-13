// main_generator.js
import './gen_state.js';
import './gen_3d.js';
import './gen_controlLines.js';
import './gen_CopyPaste.js';
import './gen_files.js';
import './gen_ui.js'

async function boot()
{
  // próbáljuk meg betölteni az alap könyvtárat
  
  
  const loaded = await window.loadLibraryFromURL("library_1.json");

  if (!loaded)
  {

    const loaded2 = await window.loadLibraryFromURL("/public/library_1.json");

    if(!loaded2)
    {
      console.warn("[init] library_1.json nem található – seed demó töltése");
      window.seedDemoPopulate();
    }
  }
  else
  {
    console.log("Hello - Loading Default Library OK");
  }

  ui.eulerOrder.value = "YXZ";

  // UI és megjelenítés frissítés – egységesen
  window.refreshGPList();
  window.refreshGrpList();
  window.refreshScnSourceOptions();
  window.applyMode();
  window.refreshScnList();
  window.snapshot();
}

// indítás
boot().then(() =>
{
  window.updateCamera();
  window.drawScene();
  window.__scriptLoaded = true;
  window.tick();
});

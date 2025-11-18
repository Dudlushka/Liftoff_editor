import './gen_state.js';

import {
  gpSelSet,
  grpSelSet,
  scnSelSet,
  clSelSet,
  cpSelSet
} from './gen_state.js';



import {
fillPartEditors,
fillGrpEditors,
fillScnEditors
} from './gen_3d.js';


//--------------------------------------------------------------
 const MAX_HISTORY = 200;   
//--------------------------------------------------------------

const history = {
  stack: [],
  idx: -1,
};

export function snapshot()
{
  const snap = JSON.stringify({
    store,
    gpSel: [...gpSelSet],
    grpSel: [...grpSelSet],
    scnSel: [...scnSelSet],
    mode: ui.mode.value,
  });

  // cut the "future" if we are after an undo
  history.stack = history.stack.slice(0, history.idx + 1);

  //Store the new state
  history.stack.push(snap);
  history.idx = history.stack.length - 1;

  //if too long: drop the end
  if (history.stack.length > MAX_HISTORY)
  {
    history.stack.shift();
    history.idx--;
  }
}



//----------------------------------------------------------------




function restore(idx)
{
  console.log("undo/redo:",idx);

  if (idx < 0 || idx >= history.stack.length) return;

  const state = JSON.parse(history.stack[idx]);
  
  Object.keys(store).forEach((k) => delete store[k]);
  Object.assign(store, state.store);
  //gpSelSet = new Set(state.gpSel || []);
  //grpSelSet = new Set(state.grpSel || []);
  //scnSelSet = new Set(state.scnSel || []);
  gpSelSet.clear();
  grpSelSet.clear();
  scnSelSet.clear();
  cpSelSet.clear();

  ui.mode.value = state.mode || "scn";
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
  console.log("[doUndo]");
  if (history.idx > 0) restore(history.idx - 1);
}

function doRedo()
{
  console.log("[doRedo]");
  if (history.idx < history.stack.length - 1) restore(history.idx + 1);
}


ui.undoBtn.addEventListener("click", doUndo);
ui.redoBtn.addEventListener("click", doRedo);


window.addEventListener("keydown", (e) =>
{
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")
  {
    e.preventDefault();
    doUndo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
  {
    e.preventDefault();
    doRedo();
  }
});

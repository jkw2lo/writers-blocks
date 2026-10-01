import { P, state } from './state.js';
import { changed } from '../project/files.js';
import { render } from '../ui/shell.js';

// ---- undo for structural changes ---------------------------------------------

export function snapshot() {
  state.undo.push({ json: JSON.stringify(P()), selectedId: state.selectedId });
  if (state.undo.length > 40) state.undo.shift();
}
export function restoreUndo() {
  const s = state.undo.pop();
  if (!s) return;
  state.project = JSON.parse(s.json);
  state.selectedId = P().nodes[s.selectedId] ? s.selectedId : 'root';
  changed();
  render();
}

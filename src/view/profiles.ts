import { HARDWARE } from './hardware';
import {
  PRESETS,
  parseProfile,
  coverage,
  suggestProfiles,
  type KeyboardProfile,
} from '../core/profile';
import { DIGITS } from '../core/keyboard';
import type { Finger } from '../core/types';
export function profileControls(
  root: HTMLElement,
  initial: KeyboardProfile,
  customs: KeyboardProfile[],
  change: (p: KeyboardProfile, customs: KeyboardProfile[]) => void,
) {
  let selected = initial,
    draft: KeyboardProfile | undefined;
  root.innerHTML = `<div class="profile-toolbar"><label>Keyboard <select id="keyboard-profile"></select></label><button id="detect-layout">Detect layout</button><button id="custom-layout">Custom…</button><button id="export-profile">Export</button><label class="import-label">Import JSON <input id="import-profile" type="file" accept="application/json,.json"></label></div><p id="hardware-description"></p><p id="profile-status" role="status"></p><div id="profile-editor" hidden><label>Profile name <input id="profile-name" maxlength="80"></label><label>Physical key <select id="edit-key"></select></label><label>Mapping <input id="capture-key" placeholder="Focus here and press a key" readonly></label><p>Press the selected position, with Shift or AltGr if needed. That modifier mapping is replaced; others are kept.</p><label>Standard finger <select id="standard-finger"></select></label><label>Alternate finger <select id="alternate-finger"></select></label><button id="save-profile">Save & select</button><button id="delete-profile">Delete custom</button><button id="cancel-profile">Cancel</button><p id="edit-status" role="status"></p></div>`;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const status = (s: string) => {
    el('profile-status').textContent = s;
  };
  const select = el<HTMLSelectElement>('keyboard-profile');
  const refresh = () => {
    const groups = ['mac', 'pc', 'custom'].map((family) => {
      const group = document.createElement('optgroup');
      group.label =
        family === 'mac'
          ? 'MacBook Air M2 / Pro 2021+'
          : family === 'pc'
            ? 'Keychron V6 · PC reference'
            : 'Custom hardware';
      const profiles = [...PRESETS, ...customs].filter(
        (p) => (HARDWARE[p.id]?.family ?? 'custom') === family,
      );
      group.replaceChildren(
        ...profiles.map((p) => new Option(HARDWARE[p.id]?.language ?? p.name, p.id)),
      );
      return group;
    });
    select.replaceChildren(...groups);
    select.value = selected.id;
    const reference = HARDWARE[selected.id];
    el('hardware-description').textContent = reference
      ? `Typing block · ${reference.model}. Match both your physical keyboard and input language. Other hardware: use Custom.`
      : 'Custom keyboard · your saved geometry and mappings.';
  };
  const commit = (p: KeyboardProfile) => {
    selected = p;
    draft = undefined;
    refresh();
    change(p, customs);
    el('profile-editor').hidden = true;
  };
  refresh();
  select.onchange = () => {
    commit([...PRESETS, ...customs].find((p) => p.id === select.value)!);
  };
  el('detect-layout').onclick = async () => {
    const api = (
      navigator as Navigator & { keyboard?: { getLayoutMap: () => Promise<Map<string, string>> } }
    ).keyboard;
    if (!api?.getLayoutMap) {
      status('Detection is unavailable in this browser. Select your keyboard manually.');
      return;
    }
    status('Checking available character mappings…');
    try {
      const matches = suggestProfiles(await api.getLayoutMap());
      status(
        matches.length === 1
          ? `Suggestion: ${matches[0]!.name}. Select it above if correct; detection cannot identify hardware geometry.`
          : matches.length
            ? `Ambiguous: ${matches.map((p) => p.name).join(', ')}. Choose manually; hardware geometry is not detected.`
            : 'No exact preset match. Choose manually or create Custom.',
      );
    } catch {
      status('Detection was unavailable or denied. Manual selection is unchanged.');
    }
  };
  const editKey = el<HTMLSelectElement>('edit-key');
  for (const id of ['standard-finger', 'alternate-finger'])
    el<HTMLSelectElement>(id).replaceChildren(
      ...['left', 'right'].flatMap((h) => DIGITS.map((d) => new Option(`${h} ${d}`, `${h}-${d}`))),
    );
  const showKey = () => {
    const k = draft!.keys.find((k) => k.code === editKey.value)!;
    el<HTMLInputElement>('capture-key').value = k.outputs
      .map(
        (o) =>
          `${o.shift ? 'Shift+' : ''}${o.altGr ? 'AltGr+' : ''}${o.text === ' ' ? 'space' : o.text}`,
      )
      .join(' · ');
    for (const m of ['standard', 'alternate'] as const) {
      const s = el<HTMLSelectElement>(`${m}-finger`);
      s.value = k[m][0]!;
      s.disabled = k.code === 'Space';
    }
    el('edit-status').textContent = '';
  };
  editKey.onchange = showKey;
  el('custom-layout').onclick = () => {
    if (draft) {
      el('profile-editor').hidden = false;
      return;
    }
    draft = structuredClone(selected);
    if (PRESETS.some((p) => p.id === draft!.id)) {
      draft.id = `custom-${crypto.randomUUID()}`;
      draft.name = `${draft.name} copy`;
    }
    el<HTMLInputElement>('profile-name').value = draft.name;
    editKey.replaceChildren(...draft.keys.map((k) => new Option(`${k.code} · ${k.label}`, k.code)));
    el('profile-editor').hidden = false;
    showKey();
  };
  el('capture-key').onkeydown = (e) => {
    if (
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.metaKey ||
      ((e.ctrlKey || e.altKey) && !e.getModifierState('AltGraph'))
    )
      return;
    e.preventDefault();
    if (!draft || e.repeat) return;
    const k = draft.keys.find((k) => k.code === editKey.value)!;
    if (
      e.isComposing ||
      e.key === 'Dead' ||
      e.key.length !== 1 ||
      e.code !== k.code ||
      e.metaKey ||
      ((e.ctrlKey || e.altKey) && !e.getModifierState('AltGraph'))
    ) {
      el('edit-status').textContent =
        `Press ${k.code} directly. Dead keys/composition and shortcuts cannot be mapped.`;
      return;
    }
    const altGr = e.getModifierState('AltGraph');
    k.outputs = k.outputs.filter((o) => o.shift !== e.shiftKey || o.altGr !== altGr);
    k.outputs.push({ text: e.key, shift: e.shiftKey, altGr });
    k.label = k.outputs.map((o) => (o.text === ' ' ? 'space' : o.text)).join(' / ');
    showKey();
    el('edit-status').textContent = 'Mapping captured. Save to apply.';
  };
  for (const m of ['standard', 'alternate'] as const)
    el<HTMLSelectElement>(`${m}-finger`).onchange = () => {
      draft!.keys.find((k) => k.code === editKey.value)![m] = [
        el<HTMLSelectElement>(`${m}-finger`).value as Finger,
      ];
    };
  el('save-profile').onclick = () => {
    try {
      draft!.name = el<HTMLInputElement>('profile-name').value;
      const valid = parseProfile(JSON.stringify(draft));
      const missing = coverage(valid);
      if (missing.length)
        throw Error(`Missing passage characters: ${missing.join(' ')}. Map them before saving.`);
      if (customs.length >= 20 && !customs.some((p) => p.id === valid.id))
        throw Error('Maximum 20 custom profiles. Delete one first.');
      customs = [...customs.filter((p) => p.id !== valid.id), valid];
      commit(valid);
      status('Custom profile saved locally.');
    } catch (e) {
      el('edit-status').textContent = (e as Error).message;
    }
  };
  el('delete-profile').onclick = () => {
    if (!draft || !customs.some((p) => p.id === draft!.id)) {
      el('edit-status').textContent = 'Only saved custom profiles can be deleted.';
      return;
    }
    customs = customs.filter((p) => p.id !== draft!.id);
    commit(selected.id === draft.id ? PRESETS[0]! : selected);
    status('Custom profile deleted.');
  };
  el('cancel-profile').onclick = () => {
    el('profile-editor').hidden = true;
    draft = undefined;
  };
  el('export-profile').onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el<HTMLInputElement>('import-profile').onchange = async () => {
    const input = el<HTMLInputElement>('import-profile'),
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw Error('Profile exceeds 100 KB.');
      const p = parseProfile(await file.text());
      p.id = `custom-${crypto.randomUUID()}`;
      if (customs.length >= 20) throw Error('Maximum 20 custom profiles.');
      const missing = coverage(p);
      if (missing.length)
        throw Error(
          `Missing passage characters: ${missing.join(' ')}. Fix the JSON and import again.`,
        );
      customs = [...customs, p];
      commit(p);
      status('Profile imported and selected.');
    } catch (e) {
      status(`Import failed: ${(e as Error).message} Last valid profile kept.`);
    }
    input.value = '';
  };
  return {
    closeEditor() {
      el('profile-editor').hidden = true;
    },
    reset() {
      customs = [];
      selected = PRESETS[0]!;
      draft = undefined;
      refresh();
      el('profile-editor').hidden = true;
      status('');
    },
  };
}

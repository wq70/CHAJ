const key = 'chaj.preferences';

export function loadPreferences() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* Use defaults. */ }
    const position = saved?.position;
    return {
        theme: saved?.theme === 'night' ? 'night' : 'day',
        palette: saved?.palette === 'mono' ? 'mono' : 'tide',
        update: saved?.update !== false,
        wake: ['double', 'triple', 'swipe'].includes(saved?.wake) ? saved.wake : 'double',
        hidden: saved?.hidden === true,
        position: Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null,
        order: saved?.order === 'old' ? 'old' : 'new',
        showGroups: saved?.showGroups !== false,
    };
}

export function savePreferences(preferences) {
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Keep settings for this page. */ }
}

export const settingsMarkup = `
    <nav class="chaj-settings-tabs" data-aria="settingsCategories">
        <button type="button" data-settings-tab="appearance" aria-controls="chaj-appearance" aria-pressed="true" data-copy="appearance"></button>
        <button type="button" data-settings-tab="orb" aria-controls="chaj-orb-settings" aria-pressed="false" data-copy="orb"></button>
        <button type="button" data-settings-tab="updates" aria-controls="chaj-update-settings" aria-pressed="false" data-copy="updates"></button>
        <button type="button" data-settings-tab="modules" aria-controls="chaj-module-settings" aria-pressed="false" data-copy="modules"></button>
    </nav>
    <div class="chaj-settings-body">
        <section id="chaj-appearance">
            <label class="chaj-setting">
                <span><strong data-copy="palette"></strong><small data-copy="paletteHint"></small></span>
                <select data-preference="palette">
                    <option value="tide" data-copy="tidePalette"></option>
                    <option value="mono" data-copy="monoPalette"></option>
                </select>
            </label>
        </section>
        <section id="chaj-orb-settings" hidden>
            <label class="chaj-setting">
                <span><strong data-copy="wake"></strong><small data-copy="wakeHint"></small></span>
                <select data-preference="wake">
                    <option value="double" data-copy="double"></option>
                    <option value="triple" data-copy="triple"></option>
                    <option value="swipe" data-copy="swipe"></option>
                </select>
            </label>
            <label class="chaj-setting">
                <span><strong data-copy="hideOrb"></strong><small data-copy="hideOrbHint"></small></span>
                <input type="checkbox" data-preference="hidden">
            </label>
        </section>
        <section id="chaj-update-settings" hidden>
            <label class="chaj-setting">
                <span><strong data-copy="updates"></strong><small data-copy="updatesHint"></small></span>
                <input type="checkbox" data-preference="update">
            </label>
        </section>
        <section id="chaj-module-settings" hidden>
            <label class="chaj-setting">
                <span><strong data-copy="history"></strong><small data-copy="historyOrder"></small></span>
                <select data-preference="order">
                    <option value="new" data-copy="newest"></option>
                    <option value="old" data-copy="oldest"></option>
                </select>
            </label>
            <label class="chaj-setting">
                <span><strong data-copy="greetings"></strong><small data-copy="showGroups"></small></span>
                <input type="checkbox" data-preference="showGroups">
            </label>
        </section>
    </div>`;

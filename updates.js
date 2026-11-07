import { extensionTypes } from '../../../extensions.js';

const folderName = decodeURIComponent(new URL('.', import.meta.url).pathname.split('/').at(-2));
const checkKey = `chaj.update.checked.${folderName}`;

async function request(getContext, path) {
    const type = extensionTypes[`third-party/${folderName}`];
    if (!['local', 'global'].includes(type)) return null;
    const response = await fetch(`/api/extensions/${path}`, {
        method: 'POST', headers: getContext().getRequestHeaders(),
        body: JSON.stringify({ extensionName: folderName, global: type === 'global' }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export function watchUpdates(dialog, getContext, getCopy) {
    const button = dialog.querySelector('.chaj-update-now');
    const later = dialog.querySelector('.chaj-later');
    const status = dialog.querySelector('.chaj-update-status');
    function render() {
        const c = getCopy();
        for (const element of dialog.querySelectorAll('[data-copy]')) element.textContent = c[element.dataset.copy];
        dialog.lang = c.title === 'Cloud Desk' ? 'en' : 'zh-CN';
    }
    later.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (button.disabled) event.preventDefault(); });
    button.addEventListener('click', async () => {
        button.disabled = later.disabled = true;
        status.textContent = getCopy().updating;
        try {
            const result = await request(getContext, 'update');
            if (!result?.shortCommitHash) throw new Error('Update did not report a commit');
            location.reload();
        } catch {
            status.textContent = getCopy().updateFailed;
            button.disabled = later.disabled = false;
        }
    });
    setTimeout(async () => {
        try {
            if (Date.now() - Number(localStorage.getItem(checkKey)) < 6 * 60 * 60 * 1000) return;
            localStorage.setItem(checkKey, String(Date.now()));
        } catch { /* Check once this page load if storage is unavailable. */ }
        try {
            const result = await request(getContext, 'version');
            if (result?.isUpToDate === false) {
                render();
                dialog.showModal();
            }
        } catch { /* Keep the extension usable when the repository is unreachable. */ }
    }, 1500);
}

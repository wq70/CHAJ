const modules = ['history', 'greetings'];
const channels = [...modules, 'directory'];
const slotCount = Math.max(24, modules.length);
const clamp = value => Math.max(0, Math.min(1, value));
const label = index => String(index + 1).padStart(2, '0');

export const dialMarkup = `
    <div class="chaj-composition">
        <div class="chaj-editorial">
            <span class="chaj-edition chaj-mono" aria-hidden="true">OPTICAL SERIES <b>01</b></span>
            <h2 data-copy="tideLens"></h2>
            <span class="chaj-wordmark" aria-hidden="true">TIDE <em>LENS</em></span>
            <div class="chaj-selected">
                <span class="chaj-mono chaj-channel-number" aria-hidden="true"></span>
                <button type="button" class="chaj-enter">
                    <strong></strong><span aria-hidden="true">↗</span>
                </button>
            </div>
        </div>
        <div class="chaj-optics">
            <div class="chaj-axis" aria-hidden="true"></div>
            <div class="chaj-orbit chaj-orbit-offset" aria-hidden="true"></div>
            <div class="chaj-orbit" aria-hidden="true"></div>
            <button type="button" class="chaj-dial" data-aria="dial">
                <span class="chaj-dial-body" aria-hidden="true">
                    <span class="chaj-rim"></span><span class="chaj-scale"></span>
                    <span class="chaj-aperture"><canvas width="360" height="360"></canvas></span>
                    <span class="chaj-marker"></span>
                </span>
            </button>
            <span class="chaj-dial-stamp chaj-mono" aria-hidden="true"></span>
        </div>
    </div>
    <nav class="chaj-tuner" data-aria="functions">
        ${channels.map((channel, index) => `<button type="button" data-channel="${index}" aria-pressed="${index === 0}">
            <span class="chaj-mono" aria-hidden="true">${channel === 'directory' ? '···' : label(index)}</span>
            <span data-copy="${channel}"></span>
        </button>`).join('')}
    </nav>
    <span class="chaj-sr chaj-dial-status" role="status"></span>`;

export const directoryMarkup = `
    <div class="chaj-directory">
        ${Array.from({ length: slotCount }, (_, index) => {
            const channel = modules[index];
            const number = `<span class="chaj-mono">${label(index)}</span>`;
            return channel
                ? `<button type="button" data-view="${channel}">${number}<strong data-copy="${channel}"></strong></button>`
                : `<div>${number}<span data-copy="reserved"></span></div>`;
        }).join('')}
    </div>`;

function bindDrag(button, { start, move, finish, activate }) {
    let drag;
    let suppressClick = false;
    button.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick = false;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: start(), moved: false };
        button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        const x = event.clientX - drag.x;
        const y = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(x, y) < 6) return;
        drag.moved = true;
        button.dataset.dragging = '';
        move(drag.origin, x, y);
    });
    function end(event, cancelled) {
        if (drag?.id !== event.pointerId) return;
        const { origin, x, moved } = drag;
        drag = undefined;
        delete button.dataset.dragging;
        const touchTap = event.pointerType === 'touch' && !moved && !cancelled;
        suppressClick = moved || cancelled || touchTap;
        if (moved) finish(origin, event.clientX - x, cancelled);
        else if (touchTap) activate();
    }
    button.addEventListener('pointerup', event => end(event, false));
    button.addEventListener('pointercancel', event => end(event, true));
    button.addEventListener('click', event => {
        if (suppressClick && event.detail) {
            suppressClick = false;
            return;
        }
        activate();
    });
}

const lensColors = {
    day: [[23, 62, 63], [53, 114, 109], [106, 167, 149], [179, 220, 207], [246, 253, 237]],
    night: [[18, 12, 38], [57, 37, 100], [119, 88, 177], [123, 212, 214], [234, 224, 255]],
    monoDay: [[34, 34, 34], [89, 89, 89], [151, 151, 151], [209, 209, 209], [255, 255, 255]],
    monoNight: [[0, 0, 0], [28, 28, 28], [76, 76, 76], [157, 157, 157], [239, 239, 239]],
};

function drawLens(canvas, colors) {
    const context = canvas.getContext('2d');
    if (!context) return;
    const size = canvas.width;
    const image = context.createImageData(size, size);
    for (let row = 0; row < size; row++) {
        const y = 2 * row / size - 1;
        for (let column = 0; column < size; column++) {
            const x = 2 * column / size - 1;
            const along = .86 * x + .51 * y;
            const across = .86 * y - .51 * x;
            const rim = Math.hypot(along * 1.08 + .13, across * .84 - .09);
            const theta = Math.atan2(across - .12, along + .15);
            const bend = 1.1 * Math.sin(theta * 3 + rim * 6) + .52 * Math.cos(theta * 5 - rim * 8);
            const tide = 15 * rim + bend + 2.5 * across + Math.sin(5 * along - 3 * across);
            const folds = .5 + .5 * Math.sin(tide);
            const highlights = (.5 + .5 * Math.sin(tide * 2.15 + Math.sin(11 * across))) ** 13;
            const bright = .31 * Math.exp(-16 * (along + .33) ** 2 - 4 * (across + .17) ** 2);
            const shadow = .31 * Math.exp(-12 * (along - .38) ** 2 - 2 * (across - .1) ** 2);
            const striae = .018 * Math.sin(tide * 13 + Math.sin(8 * theta));
            const light = 4 * clamp(.27 + .35 * folds + .22 * highlights + bright - shadow + striae - .13 * Math.hypot(x, y) ** 3);
            const band = Math.min(3, Math.floor(light));
            const offset = (row * size + column) * 4;
            for (let component = 0; component < 3; component++) {
                const from = colors[band][component];
                image.data[offset + component] = from + (colors[band + 1][component] - from) * (light - band);
            }
            image.data[offset + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
}

export function createTideDial(root, getCopy, openView) {
    const dial = root.querySelector('.chaj-dial');
    const enter = root.querySelector('.chaj-enter');
    const number = root.querySelector('.chaj-channel-number');
    const stamp = root.querySelector('.chaj-dial-stamp');
    const status = root.querySelector('.chaj-dial-status');
    const buttons = [...root.querySelectorAll('[data-channel]')];
    let selected = 0;
    let angle = -17;
    let drawn;
    const rotate = value => dial.style.setProperty('--chaj-angle', value + 'deg');
    const activate = () => openView(channels[selected]);

    function render() {
        const channel = channels[selected];
        const index = channel === 'directory' ? '···' : label(selected);
        enter.querySelector('strong').textContent = getCopy()[channel];
        number.textContent = index + ' / ' + slotCount;
        stamp.textContent = channel === 'directory' ? '◆ SPECTRUM INDEX' : '◆ CHANNEL ' + index;
        buttons.forEach((button, position) => button.setAttribute('aria-pressed', String(position === selected)));
    }

    function select(step) {
        selected = (selected + step + channels.length) % channels.length;
        angle += 48 * step;
        rotate(angle);
        render();
        status.textContent = getCopy()[channels[selected]];
    }

    for (const [index, button] of buttons.entries()) button.addEventListener('click', () => select(index - selected));
    dial.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        select(event.key === 'ArrowLeft' ? -1 : 1);
    });
    enter.addEventListener('click', activate);
    bindDrag(dial, {
        start: () => angle,
        move: (origin, x) => rotate(origin + .65 * x),
        finish: (origin, x, cancelled) => {
            if (cancelled || Math.abs(x) < 23) rotate(origin);
            else select(x < 0 ? 1 : -1);
        },
        activate,
    });
    return {
        render,
        paint({ theme, palette }) {
            const key = palette === 'mono' ? (theme === 'day' ? 'monoDay' : 'monoNight') : theme;
            if (key === drawn) return;
            drawLens(dial.querySelector('canvas'), lensColors[key]);
            drawn = key;
        },
    };
}

export function createFloatingOrb(orb, wakeEdge, preferences, onChange, activate, canWake) {
    let gesture;
    let taps = 0;
    let lastTap = 0;
    const viewport = () => ({
        width: Math.max(1, document.documentElement.clientWidth - orb.offsetWidth),
        height: Math.max(1, window.innerHeight - orb.offsetHeight),
    });
    function place() {
        if (!preferences.position || orb.hidden) return;
        const { width, height } = viewport();
        orb.style.setProperty('--chaj-orb-x', clamp(preferences.position.x) * width + 'px');
        orb.style.setProperty('--chaj-orb-y', clamp(preferences.position.y) * height + 'px');
    }
    function render() {
        orb.hidden = preferences.hidden;
        wakeEdge.hidden = !preferences.hidden;
        taps = 0;
        gesture = undefined;
        place();
    }
    bindDrag(orb, {
        start: () => orb.getBoundingClientRect(),
        move: (origin, x, y) => {
            const { width, height } = viewport();
            preferences.position = { x: clamp((origin.left + x) / width), y: clamp((origin.top + y) / height) };
            place();
        },
        finish: onChange,
        activate,
    });
    window.addEventListener('resize', place);
    wakeEdge.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0 || !canWake()) return;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
        wakeEdge.setPointerCapture(event.pointerId);
    });
    wakeEdge.addEventListener('pointercancel', () => { gesture = undefined; taps = 0; });
    wakeEdge.addEventListener('pointerup', event => {
        if (gesture?.id !== event.pointerId) return;
        const x = event.clientX - gesture.x;
        const y = event.clientY - gesture.y;
        gesture = undefined;
        if (!canWake()) return;
        if (preferences.wake === 'swipe') {
            if (x >= -45 || Math.abs(y) > Math.abs(x) * .7) return;
        } else {
            if (Math.hypot(x, y) > 12) { taps = 0; return; }
            const now = performance.now();
            taps = now - lastTap < 430 ? taps + 1 : 1;
            lastTap = now;
            if (taps < (preferences.wake === 'double' ? 2 : 3)) return;
        }
        preferences.hidden = false;
        render();
        onChange();
    });
    render();
    return { render };
}

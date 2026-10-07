(() => {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));
    const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
    const pad = (n) => String(n).padStart(2, '0');
    const clock = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

    /* ===== Демо-цепочка ===== */

    const form = $('#lead-form');
    const sendBtn = $('#send-btn');
    const errorEl = $('#form-error');
    const hintEl = $('#demo-hint');
    const resultEl = $('#demo-result');
    const sheetBody = $('#sheet-body');
    const steps = [...document.querySelectorAll('.step')];
    const initialStepHTML = steps.map((el) => $('[data-out]', el).innerHTML);

    const MAX_ROWS = 4;
    let nextId = 1042;
    let busy = false;
    let hasRun = false;

    const seedRows = [
        { id: 1040, name: 'Игорь', service: 'Сайт-визитка', sum: 40000, taken: true },
        { id: 1041, name: 'Мария', service: 'Telegram-бот', sum: 30000, taken: false },
    ];

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function setStatus(cell, taken) {
        cell.className = 'status ' + (taken ? 's-work' : 's-new');
        cell.textContent = taken ? 'В работе' : 'Новая';
    }

    function addRow(row, isNew) {
        const tr = el('tr', isNew ? 'new' : '');
        tr.append(el('td', '', '#' + row.id), el('td', '', row.name), el('td', '', row.service), el('td', '', money(row.sum)));
        const td = el('td');
        const badge = el('span');
        setStatus(badge, row.taken);
        td.append(badge);
        tr.append(td);
        sheetBody.append(tr);
        while (sheetBody.children.length > MAX_ROWS) sheetBody.firstElementChild.remove();
        return badge;
    }

    function renderSheet() {
        sheetBody.replaceChildren();
        seedRows.forEach((row) => addRow(row, false));
    }

    function setStep(index, state) {
        const step = steps[index];
        step.classList.remove('running', 'done');
        if (state !== 'idle') step.classList.add(state);
        $('[data-chip]', step).textContent = { idle: 'ждёт', running: 'в работе', done: 'готово' }[state];
    }

    function resetSteps() {
        steps.forEach((step, i) => {
            setStep(i, 'idle');
            // таблица остаётся на месте, остальные шаги возвращаются к подсказкам
            if (i !== 1) $('[data-out]', step).innerHTML = initialStepHTML[i];
        });
        resultEl.textContent = '';
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.hidden = !message;
    }

    function readLead() {
        const data = new FormData(form);
        const name = String(data.get('name') || '').trim();
        const contact = String(data.get('contact') || '').trim();
        const [service, sum] = String(data.get('service')).split('|');
        if (!name) return { error: 'Введите имя.' };
        if (!contact) return { error: 'Укажите, как с вами связаться.' };
        return { name, contact, service, sum: Number(sum) };
    }

    // Шаг 1: заявка принята
    function stepReceive(lead, id) {
        const out = $('[data-out]', steps[0]);
        const box = el('div', 'payload');
        const rows = [
            ['id', '#' + id],
            ['name', lead.name],
            ['service', lead.service],
            ['sum', money(lead.sum)],
            ['contact', lead.contact],
        ];
        rows.forEach(([key, value]) => {
            const line = el('div');
            line.append(el('i', '', key + ': '), document.createTextNode(value));
            box.append(line);
        });
        out.replaceChildren(box);
    }

    // Шаг 2: строка в таблице
    function stepSheet(lead, id) {
        return addRow({ id, name: lead.name, service: lead.service, sum: lead.sum, taken: false }, true);
    }

    // Шаг 3: сообщение менеджеру с кнопкой
    function stepTelegram(lead, id, badge) {
        const out = $('[data-out]', steps[2]);
        const chat = el('div', 'tg');
        const msg = el('div', 'tg-msg');
        const title = el('b', '', '🔔 Новая заявка #' + id);
        msg.append(
            title, el('br'),
            document.createTextNode(lead.name + ' · ' + lead.service),
            el('br'),
            document.createTextNode(money(lead.sum) + ' · ' + lead.contact),
            el('time', '', clock())
        );
        const btn = el('button', 'tg-btn', 'Взять в работу');
        btn.type = 'button';
        btn.addEventListener('click', () => {
            btn.disabled = true;
            btn.textContent = '✓ Взято в работу';
            setStatus(badge, true);
            const reply = el('div', 'tg-msg me', 'Беру заявку #' + id);
            reply.append(el('time', '', clock()));
            chat.append(reply);
        });
        chat.append(msg, btn);
        out.replaceChildren(chat);
    }

    // Шаг 4: автоответ клиенту
    function stepMail(lead, id) {
        const out = $('[data-out]', steps[3]);
        const mail = el('div', 'mail');
        const head = el('dl');
        [['Кому:', lead.contact], ['Тема:', 'Заявка #' + id + ' принята']].forEach(([k, v]) => {
            head.append(el('dt', '', k), el('dd', '', v));
        });
        mail.append(
            head,
            el('p', '', 'Здравствуйте, ' + lead.name + '!'),
            el('p', '', 'Мы получили вашу заявку на «' + lead.service + '». Менеджер свяжется с вами в течение рабочего дня.')
        );
        out.replaceChildren(mail);
    }

    async function runChain(lead) {
        const id = nextId++;
        const started = performance.now();
        let badge;

        const run = async (index, action) => {
            setStep(index, 'running');
            await sleep(650);
            action();
            setStep(index, 'done');
            await sleep(250);
        };

        resetSteps();
        await run(0, () => stepReceive(lead, id));
        await run(1, () => { badge = stepSheet(lead, id); });
        await run(2, () => stepTelegram(lead, id, badge));
        await run(3, () => stepMail(lead, id));

        const seconds = ((performance.now() - started) / 1000).toFixed(1).replace('.', ',');
        resultEl.textContent = reduceMotion
            ? 'Готово. Вручную это заняло бы минут пять.'
            : 'Готово за ' + seconds + ' с. Вручную это заняло бы минут пять.';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        const lead = readLead();
        if (lead.error) {
            showError(lead.error);
            return;
        }
        showError('');
        busy = true;
        sendBtn.disabled = true;
        sendBtn.textContent = 'Выполняется…';
        hintEl.textContent = 'Цепочка работает, смотрите справа.';
        if (!hasRun && window.matchMedia('(max-width: 960px)').matches) {
            $('#steps').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
        hasRun = true;
        try {
            await runChain(lead);
        } finally {
            busy = false;
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить ещё одну';
            hintEl.textContent = 'Поменяйте данные и запустите снова.';
        }
    });

    renderSheet();

    /* ===== Калькулятор ===== */

    const WEEKS_PER_MONTH = 4.3;
    const COVERAGE = 0.85;
    const BUSINESS_PRICE = 45000;
    const inputs = {
        tasks: $('#c-tasks'),
        min: $('#c-min'),
        rate: $('#c-rate'),
    };

    function pluralMonths(n) {
        const last = n % 10;
        const tens = n % 100;
        if (tens >= 11 && tens <= 14) return 'месяцев';
        if (last === 1) return 'месяц';
        if (last >= 2 && last <= 4) return 'месяца';
        return 'месяцев';
    }

    function calc() {
        const tasks = Number(inputs.tasks.value);
        const minutes = Number(inputs.min.value);
        const rate = Number(inputs.rate.value);

        $('#o-tasks').textContent = tasks;
        $('#o-min').textContent = minutes;
        $('#o-rate').textContent = new Intl.NumberFormat('ru-RU').format(rate);

        const hours = (tasks * minutes / 60) * WEEKS_PER_MONTH * COVERAGE;
        const saved = hours * rate;
        const paybackMonths = BUSINESS_PRICE / saved;

        $('#r-hours').textContent = Math.round(hours) + ' ч';
        $('#r-money').textContent = money(saved);

        let paybackText;
        if (paybackMonths < 1) {
            paybackText = 'меньше месяца';
        } else if (paybackMonths > 36) {
            paybackText = 'дольше 3 лет';
        } else {
            const rounded = Math.round(paybackMonths * 10) / 10;
            const whole = Number.isInteger(rounded);
            const shown = whole ? String(rounded) : String(rounded).replace('.', ',');
            paybackText = 'за ' + shown + ' ' + (whole ? pluralMonths(rounded) : 'месяца');
        }
        $('#r-payback').textContent = paybackText;
    }

    Object.values(inputs).forEach((input) => input.addEventListener('input', calc));
    calc();
})();

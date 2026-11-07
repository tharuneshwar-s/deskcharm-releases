(() => {
    const API = window.DESKCHARM_API;
    const $ = (id) => document.getElementById(id);
    const form = $('buy-form'), btn = $('buy-btn'), msg = $('buy-msg');
    const nameIn = $('buy-name'), emailIn = $('buy-email'), ccIn = $('buy-cc'), phoneIn = $('buy-phone');
    const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
    const SOURCE = new URLSearchParams(location.search).get('src') === 'app' ? 'app' : 'website';
    const SUPPORT = 'support@deskcharm.in';

    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };

    async function post(path, body) {
        const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        return data;
    }

    fetch(API + '/api/price').then((r) => r.json()).then((p) => {
        $('price-label').textContent = p.label;
        $('btn-price').textContent = p.label;
        $('price-note').textContent = p.launch ? `(launch price until ${p.launch_ends} or the first 500 buyers, then ₹99)` : '';
    }).catch(() => { /* keep the static price */ });

    // Returns E.164 (+<cc><digits>) or null. A leading 0 on the national number is dropped.
    function fullPhone() {
        const digits = phoneIn.value.replace(/[\s\-().]/g, '').replace(/^0+/, '');
        if (!/^\d+$/.test(digits)) return null;
        const e164 = ccIn.value + digits;
        if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
        if (ccIn.value === '+91' && digits.length !== 10) return null;
        return e164;
    }

    function fieldError(input, errId, text) {
        $(errId).textContent = text || '';
        input.setAttribute('aria-invalid', text ? 'true' : 'false');
        if (text) input.setAttribute('aria-describedby', errId); else input.removeAttribute('aria-describedby');
        return !text;
    }

    function validate() {
        const name = nameIn.value.trim().replace(/\s+/g, ' ');
        const email = emailIn.value.trim();
        const phone = fullPhone();
        const okName = fieldError(nameIn, 'err-name', name.length >= 2 && name.length <= 80 ? '' : 'Please enter your name (2–80 characters).');
        const okEmail = fieldError(emailIn, 'err-email', EMAIL_RE.test(email) ? '' : 'Please enter a valid email address.');
        const okPhone = fieldError(phoneIn, 'err-phone', phone ? '' : (ccIn.value === '+91' ? 'Please enter your 10-digit mobile number.' : 'Please enter a valid phone number.'));
        const first = [[okName, nameIn], [okEmail, emailIn], [okPhone, phoneIn]].find(([ok]) => !ok);
        if (first) { first[1].focus(); return null; }
        return { name, email, phone };
    }

    function showKey(key, paymentId, label) {
        form.hidden = true;
        $('buy-done').hidden = false;
        $('key-out').textContent = key;
        const date = new Date().toISOString().slice(0, 10);
        $('receipt').textContent = `Receipt: DeskCharm Pro, lifetime licence · ${label} · ${date} · payment ${paymentId} · DeskCharm · sold by Tharuneshwar S, Puducherry, India.`;
    }

    $('copy-btn').addEventListener('click', async () => {
        const key = $('key-out').textContent;
        try { await navigator.clipboard.writeText(key); $('copy-btn').textContent = 'Copied'; }
        catch { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents($('key-out')); s.removeAllRanges(); s.addRange(rg); }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = validate();
        if (!v) { say('Please fix the highlighted fields.', true); return; }
        if (!window.Razorpay) { say('The payment window could not load. Check your connection and try again.', true); return; }
        btn.disabled = true; say('Starting secure payment…');
        let order;
        try {
            order = await post('/api/order', {
                name: v.name,
                email: v.email,
                phone: v.phone,
                consent_marketing_email: $('consent-email').checked,
                consent_marketing_whatsapp: $('consent-whatsapp').checked,
                source: SOURCE,
            });
        } catch (err) { btn.disabled = false; say(err.message, true); return; }
        const prefill = order.prefill || { name: v.name, email: v.email, contact: v.phone };
        const rzp = new window.Razorpay({
            key: order.key_id,
            order_id: order.order_id,
            amount: order.amount,
            currency: order.currency,
            name: 'DeskCharm',
            description: 'DeskCharm Pro · lifetime licence · sold by Tharuneshwar S',
            prefill,
            theme: { color: '#4a6aea' },
            modal: { ondismiss: () => { btn.disabled = false; say('Payment cancelled. You have not been charged.'); } },
            handler: async (resp) => {
                say('Payment received. Creating your key…');
                try {
                    const out = await post('/api/verify', { ...resp, email: v.email });
                    showKey(out.key, resp.razorpay_payment_id, order.price_label);
                } catch (err) {
                    btn.disabled = false;
                    say(`${err.message} Your payment id is ${resp.razorpay_payment_id}; email ${SUPPORT} and we'll sort it out.`, true);
                }
            },
        });
        rzp.on('payment.failed', (r) => { btn.disabled = false; say('Payment failed: ' + ((r.error && r.error.description) || 'please try again.'), true); });
        rzp.open();
    });
})();

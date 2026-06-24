'use strict';

var GOOGLE_CLIENT_ID = '';

function hashPassword(pw) {
    var str = 'us$scout$2025$' + pw + '$end';
    var h1 = 5381, h2 = 0x9e3779b9 | 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        h1 = (((h1 << 5) + h1) ^ c) | 0;
        h2 = (((h2 << 5) - h2) ^ c) | 0;
    }

    for (var i = str.length - 1; i >= 0; i--) {
        var c = str.charCodeAt(i);
        h1 = (((h1 >>> 1) ^ (h1 << 3)) + c) | 0;
        h2 = (((h2 << 4) - h2) ^ c) | 0;
    }
    return ((h1 >>> 0).toString(16).padStart(8, '0') +
            (h2 >>> 0).toString(16).padStart(8, '0'));
}

var DB = {
    KEY: 'uniscout_users',
    getAll: function () {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; }
    },
    saveAll: function (users) {
        localStorage.setItem(this.KEY, JSON.stringify(users));
    },
    add: function (user) {
        var users = this.getAll();
        users.push(user);
        this.saveAll(users);
    },
    findByEmail: function (email) {
        return this.getAll().find(function (u) { return u.email.toLowerCase() === email.toLowerCase(); });
    },
    findByUsername: function (username) {
        return this.getAll().find(function (u) { return u.username.toLowerCase() === username.toLowerCase(); });
    },
    findByIdentifier: function (id) {
        var lower = id.toLowerCase();
        return this.getAll().find(function (u) {
            return u.email.toLowerCase() === lower || u.username.toLowerCase() === lower;
        });
    }
};

var Session = {
    KEY: 'uniscout_session',
    set: function (user, remember) {
        var data = { id: user.id, username: user.username, email: user.email };
        if (remember) {
            localStorage.setItem(this.KEY, JSON.stringify(data));
        } else {
            sessionStorage.setItem(this.KEY, JSON.stringify(data));
        }
    },
    get: function () {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) ||
                   JSON.parse(sessionStorage.getItem(this.KEY)) || null;
        } catch (e) { return null; }
    },
    clear: function () {
        localStorage.removeItem(this.KEY);
        sessionStorage.removeItem(this.KEY);
    }
};

// Where to send the user after auth. If they came from the subscription "Go Elite"
// button (?next=subscription or a stored flag), send them straight back to checkout.
function postAuthDest() {
    try {
        var next = new URLSearchParams(location.search).get('next');
        var flag = sessionStorage.getItem('us_after_login');
        if (next === 'subscription' || flag === 'subscription') {
            sessionStorage.removeItem('us_after_login');
            return 'subscription.html?autocheckout=1';
        }
    } catch (e) {}
    return 'mainPage.html';
}

if (Session.get()) {
    window.location.href = postAuthDest();
}

var authTabs    = document.getElementById('authTabs');
var authSlider  = document.getElementById('authSlider');
var tabBtns     = authTabs.querySelectorAll('.auth__tab');
var indicator   = authTabs.querySelector('.auth__tab__indicator');

var signinForm  = document.getElementById('signinForm');
var signupForm  = document.getElementById('signupForm');

var si_id       = document.getElementById('si_id');
var si_pw       = document.getElementById('si_pw');
var si_remember = document.getElementById('si_remember');
var si_id_err   = document.getElementById('si_id_err');
var si_pw_err   = document.getElementById('si_pw_err');
var si_form_err = document.getElementById('si_form_err');
var siSubmit    = document.getElementById('siSubmit');

var su_email    = document.getElementById('su_email');
var su_user     = document.getElementById('su_user');
var su_pw       = document.getElementById('su_pw');
var su_conf     = document.getElementById('su_conf');
var su_terms    = document.getElementById('su_terms');
var su_strength = document.getElementById('su_strength');
var su_slabel   = document.getElementById('su_strength_label');
var su_form_err = document.getElementById('su_form_err');
var suSubmit    = document.getElementById('suSubmit');

var forgotOverlay = document.getElementById('forgotOverlay');
var forgotClose   = document.getElementById('forgotClose');
var forgotBtn     = document.getElementById('forgotBtn');
var forgotEmail   = document.getElementById('forgotEmail');
var forgotEmailErr= document.getElementById('forgotEmailErr');
var forgotSubmit  = document.getElementById('forgotSubmit');
var forgotSuccess = document.getElementById('forgotSuccess');

var authToast = document.getElementById('authToast');
var toastMsg  = document.getElementById('toastMsg');

var currentTab = 'signin';

function switchTab(tab) {
    currentTab = tab;
    tabBtns.forEach(function (btn) {
        btn.classList.toggle('auth__tab--active', btn.dataset.tab === tab);
    });
    if (tab === 'signup') {
        authTabs.classList.add('on-signup');
        authSlider.classList.add('show-signup');
    } else {
        authTabs.classList.remove('on-signup');
        authSlider.classList.remove('show-signup');
    }
    clearErrors();
}

tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
});

document.querySelectorAll('.auth__switch__btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.to); });
});

document.querySelectorAll('.auth__eye').forEach(function (btn) {
    btn.addEventListener('click', function () {
        var inp = document.getElementById(btn.dataset.target);
        var icon = btn.querySelector('i');
        if (inp.type === 'password') {
            inp.type = 'text';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        } else {
            inp.type = 'password';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        }
    });
});

function setErr(el, msg) { el.textContent = msg; }
function clearErr(el)    { el.textContent = ''; }
function clearErrors() {
    [si_id_err, si_pw_err, si_form_err,
     document.getElementById('su_email_err'),
     document.getElementById('su_user_err'),
     document.getElementById('su_pw_err'),
     document.getElementById('su_conf_err'),
     su_form_err
    ].forEach(function (el) { if (el) el.textContent = ''; });
    [si_id, si_pw, su_email, su_user, su_pw, su_conf].forEach(function (inp) {
        if (inp) inp.classList.remove('is-err', 'is-ok');
    });
    document.querySelectorAll('.auth__tick').forEach(function (t) { t.classList.remove('show'); });
}

function markOk(inp, tick) {
    inp.classList.remove('is-err'); inp.classList.add('is-ok');
    if (tick) tick.classList.add('show');
}
function markErr(inp, errEl, msg) {
    inp.classList.remove('is-ok'); inp.classList.add('is-err');
    errEl.textContent = msg;
    inp.focus();
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidUsername(v) { return /^[a-zA-Z0-9_]{3,20}$/.test(v); }

function setLoading(btn, on) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
}

function showToast(msg, color) {
    toastMsg.textContent = msg;
    var icon = authToast.querySelector('i');
    if (color === 'error') {
        icon.className = 'fa-solid fa-circle-xmark';
        icon.style.color = 'rgb(231,76,60)';
        authToast.style.borderColor = 'rgba(231,76,60,.4)';
    } else {
        icon.className = 'fa-solid fa-circle-check';
        icon.style.color = 'rgb(39,174,96)';
        authToast.style.borderColor = 'rgba(39,174,96,.4)';
    }
    authToast.classList.add('show');
    setTimeout(function () { authToast.classList.remove('show'); }, 3500);
}

su_pw.addEventListener('input', function () {
    var v = su_pw.value;
    var score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;

    su_strength.dataset.level = v.length === 0 ? '' : String(score);
    var labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    su_slabel.textContent = v.length === 0 ? '' : labels[score];
});

su_email.addEventListener('blur', function () {
    var err = document.getElementById('su_email_err');
    if (!isValidEmail(su_email.value.trim())) { markErr(su_email, err, 'Enter a valid email address'); }
    else if (DB.findByEmail(su_email.value.trim())) { markErr(su_email, err, 'This email is already registered'); }
    else { markOk(su_email, document.getElementById('su_email_tick')); clearErr(err); }
});
su_user.addEventListener('blur', function () {
    var err = document.getElementById('su_user_err');
    var v = su_user.value.trim();
    if (!isValidUsername(v)) { markErr(su_user, err, '3–20 chars, letters, numbers and _ only'); }
    else if (DB.findByUsername(v)) { markErr(su_user, err, 'Username already taken'); }
    else { markOk(su_user, document.getElementById('su_user_tick')); clearErr(err); }
});
su_conf.addEventListener('blur', function () {
    var err = document.getElementById('su_conf_err');
    if (su_conf.value !== su_pw.value) { markErr(su_conf, err, 'Passwords do not match'); }
    else if (su_conf.value) { markOk(su_conf, null); clearErr(err); }
});

signinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var id = si_id.value.trim();
    var pw = si_pw.value;
    var valid = true;

    if (!id) { markErr(si_id, si_id_err, 'Enter your email or username'); valid = false; }
    if (!pw) { markErr(si_pw, si_pw_err, 'Enter your password'); valid = false; }
    if (!valid) return;

    setLoading(siSubmit, true);

    var user = DB.findByIdentifier(id);
    if (!user) {
        markErr(si_id, si_id_err, 'No account found with this email or username');
        setLoading(siSubmit, false);
        return;
    }
    var hash = hashPassword(pw);
    if (hash !== user.passwordHash) {
        markErr(si_pw, si_pw_err, 'Incorrect password');
        setLoading(siSubmit, false);
        return;
    }

    Session.set(user, si_remember.checked);
    showToast('Welcome back, ' + user.username + '!');
    setTimeout(function () { window.location.href = postAuthDest(); }, 1000);
});

signupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var email = su_email.value.trim();
    var user  = su_user.value.trim();
    var pw    = su_pw.value;
    var conf  = su_conf.value;
    var valid = true;

    if (!isValidEmail(email)) { markErr(su_email, document.getElementById('su_email_err'), 'Enter a valid email'); valid = false; }
    else if (DB.findByEmail(email)) { markErr(su_email, document.getElementById('su_email_err'), 'Email already registered'); valid = false; }
    if (!isValidUsername(user)) { markErr(su_user, document.getElementById('su_user_err'), '3–20 chars, letters numbers and _ only'); valid = false; }
    else if (DB.findByUsername(user)) { markErr(su_user, document.getElementById('su_user_err'), 'Username already taken'); valid = false; }
    if (pw.length < 8) { markErr(su_pw, document.getElementById('su_pw_err'), 'Password must be at least 8 characters'); valid = false; }
    if (conf !== pw)   { markErr(su_conf, document.getElementById('su_conf_err'), 'Passwords do not match'); valid = false; }
    if (!su_terms.checked) { su_form_err.textContent = 'You must agree to the Terms of Service'; valid = false; }

    if (!valid) return;

    setLoading(suSubmit, true);

    var hash = hashPassword(pw);
    var newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        email: email,
        username: user,
        passwordHash: hash,
        createdAt: new Date().toISOString()
    };
    DB.add(newUser);

    Session.set(newUser, false);
    showToast('Welcome to UniScout, ' + newUser.username + '!');
    setTimeout(function () { window.location.href = postAuthDest(); }, 1000);
});

forgotBtn.addEventListener('click', function () {
    forgotOverlay.classList.add('open');
    forgotEmail.value = '';
    forgotEmailErr.textContent = '';
    forgotSuccess.textContent = '';
});
forgotClose.addEventListener('click', function () { forgotOverlay.classList.remove('open'); });
forgotOverlay.addEventListener('click', function (e) { if (e.target === forgotOverlay) forgotOverlay.classList.remove('open'); });

forgotSubmit.addEventListener('click', function () {
    var email = forgotEmail.value.trim();
    forgotEmailErr.textContent = '';
    forgotSuccess.textContent = '';

    if (!isValidEmail(email)) {
        forgotEmailErr.textContent = 'Enter a valid email address';
        return;
    }
    var user = DB.findByEmail(email);

    forgotSuccess.textContent = '✓ If this email is registered, a reset link has been sent.';
    forgotEmail.value = '';
    if (user) {
        var token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('us_reset_' + token, JSON.stringify({ userId: user.id, expires: Date.now() + 3600000 }));
        console.info('[UniScout] Password reset token (demo):', token);
    }
});

/* ── Social sign-in: email + password, then a 6-digit verification code ── */
var socialOverlay = document.getElementById('socialOverlay');
var socialProvider = 'google';
var socialPendingEmail = '';

// Where the backend lives (sends the verification email).
var socialCodeExpected = null;
var AUTH_API_BASE = (function () {
    if (location.protocol === 'file:') return 'http://localhost:4242';
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (isLocal && location.port !== '4242') return 'http://localhost:4242';
    return location.origin;
}());

function openSocialAuth(provider) {
    socialProvider = provider;
    var isApple = provider === 'apple';
    document.getElementById('socialIcon').innerHTML = '<i class="fa-brands fa-' + (isApple ? 'apple' : 'google') + '"></i>';
    document.getElementById('socialTitle').textContent = 'Sign in with ' + (isApple ? 'Apple' : 'Google');
    document.getElementById('socialStep1').style.display = '';
    document.getElementById('socialStep2').style.display = 'none';
    document.getElementById('socialEmail').value = '';
    document.getElementById('socialPw').value = '';
    document.getElementById('socialCode').value = '';
    document.getElementById('socialErr1').textContent = '';
    document.getElementById('socialErr2').textContent = '';
    socialOverlay.classList.add('open');
    setTimeout(function () { document.getElementById('socialEmail').focus(); }, 50);
}
function closeSocialAuth() { socialOverlay.classList.remove('open'); }

function sendSocialCode() {
    socialCodeExpected = String(Math.floor(100000 + Math.random() * 900000));
    // No email backend in this build, so the code is revealed for testing.
    showToast('Verification code sent: ' + socialCodeExpected);
    console.info('[UniScout] Verification code (demo, would be emailed):', socialCodeExpected);
}

document.getElementById('socialClose').addEventListener('click', closeSocialAuth);
socialOverlay.addEventListener('click', function (e) { if (e.target === socialOverlay) closeSocialAuth(); });

document.getElementById('socialContinue').addEventListener('click', function () {
    var email = document.getElementById('socialEmail').value.trim();
    var pw = document.getElementById('socialPw').value;
    var err = document.getElementById('socialErr1');
    if (!isValidEmail(email)) { err.textContent = 'Enter a valid email address'; return; }
    if (pw.length < 6) { err.textContent = 'Enter your password (at least 6 characters)'; return; }
    err.textContent = '';
    socialPendingEmail = email;
    document.getElementById('socialEmailEcho').textContent = email;
    document.getElementById('socialStep1').style.display = 'none';
    document.getElementById('socialStep2').style.display = '';
    sendSocialCode();
    setTimeout(function () { document.getElementById('socialCode').focus(); }, 50);
});

document.getElementById('socialResend').addEventListener('click', sendSocialCode);
document.getElementById('socialCode').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
});

document.getElementById('socialVerify').addEventListener('click', function () {
    var code = document.getElementById('socialCode').value.trim();
    var err = document.getElementById('socialErr2');
    if (code !== socialCodeExpected) { err.textContent = 'Incorrect code. Please check and try again.'; return; }
    err.textContent = '';

    var u = DB.findByEmail(socialPendingEmail);
    if (!u) {
        var uname = (socialPendingEmail.split('@')[0] || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || (socialProvider + '_user');
        if (DB.findByUsername(uname)) uname = uname + Math.floor(Math.random() * 900 + 100);
        u = {
            id: socialProvider + '_' + Date.now().toString(36),
            email: socialPendingEmail, username: uname,
            passwordHash: socialProvider.toUpperCase() + '_AUTH', provider: socialProvider,
            createdAt: new Date().toISOString()
        };
        DB.add(u);
    }
    Session.set(u, true);
    showToast('Signed in as ' + u.username + '!');
    setTimeout(function () { window.location.href = postAuthDest(); }, 900);
});

document.getElementById('googleBtn').addEventListener('click', function () {
    // Use real Google OAuth if a Client ID is configured; otherwise the email+code flow.
    if (GOOGLE_CLIENT_ID && window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential
        });
        window.google.accounts.id.prompt();
    } else {
        openSocialAuth('google');
    }
});

function handleGoogleCredential(response) {
    try {
        var payload = JSON.parse(atob(response.credential.split('.')[1]));
        var email = payload.email;
        var existing = DB.findByEmail(email);
        if (existing) {
            Session.set(existing, true);
            showToast('Welcome back, ' + existing.username + '!');
        } else {
            var username = (payload.given_name || 'user').toLowerCase().replace(/\s+/g, '') + '_' + Math.random().toString(36).slice(2, 6);
            var newUser = {
                id: 'g_' + payload.sub,
                email: email, username: username,
                passwordHash: 'GOOGLE_AUTH',
                provider: 'google',
                createdAt: new Date().toISOString()
            };
            DB.add(newUser);
            Session.set(newUser, true);
            showToast('Welcome, ' + username + '!');
        }
        setTimeout(function () { window.location.href = postAuthDest(); }, 1000);
    } catch (err) {
        showToast('Google Sign-In failed. Try again.', 'error');
    }
}

document.getElementById('appleBtn').addEventListener('click', function () {
    openSocialAuth('apple');
});

if (GOOGLE_CLIENT_ID) {
    var gScript = document.createElement('script');
    gScript.src = 'https://accounts.google.com/gsi/client';
    gScript.async = true;
    document.head.appendChild(gScript);
}

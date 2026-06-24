'use strict';

var ADMIN_SESSION_KEY = 'uniscout_admin_session';
var USERS_KEY        = 'uniscout_users';
var CHAT_KEY         = 'uniscout_chat_v1';
var SAVED_KEY        = 'uniscout_saved';
var APPS_KEY         = 'uniscout_applications';

var ADMIN_COUNTRY_NAMES = {
    es:'Spain', uk:'United Kingdom', gb:'United Kingdom', fr:'France', de:'Germany',
    it:'Italy', pt:'Portugal', us:'United States', ch:'Switzerland', ua:'Ukraine',
    nl:'Netherlands', se:'Sweden', dk:'Denmark', be:'Belgium', fi:'Finland', ie:'Ireland'
};
var ADMIN_COUNTRY_FLAGS = {
    es:'🇪🇸', uk:'🇬🇧', gb:'🇬🇧', fr:'🇫🇷',
    de:'🇩🇪', it:'🇮🇹', pt:'🇵🇹',
    us:'🇺🇸', ch:'🇨🇭', ua:'🇺🇦',
    nl:'🇳🇱', se:'🇸🇪', dk:'🇩🇰', be:'🇧🇪', fi:'🇫🇮', ie:'🇮🇪'
};
// Countries we have data files for (admin loads all of them, with websites)
var ADMIN_DATA_COUNTRIES = ['gb','es','de','fr','it','pt','nl','se','ch','dk','be','fi','ie','ua','us'];
var ADMIN_DATA_UNIS = [];   // populated async from data/*.json
var ADMIN_DIFF_LABELS = ['','Easy','Moderate','Competitive','Highly Selective','Elite'];
var ADMIN_DIFF_COLORS = ['','#27ae60','#2ecc71','#f39c12','#e67e22','#e74c3c'];

var uniPage = 1, uniCountryFilter = 'all', uniSearch = '';
var UNI_PER_PAGE = 10;
var cityPage = 1, cityCountryFilter = 'all', citySearch = '';
var CITY_PER_PAGE = 10;

var ADMIN_CITY_COUNTRIES = {
    Madrid:'es',Barcelona:'es',Valencia:'es',Sevilla:'es',Granada:'es',Bilbao:'es',Salamanca:'es',
    London:'uk',Oxford:'uk',Cambridge:'uk',Edinburgh:'uk',Manchester:'uk',Birmingham:'uk',Leeds:'uk',
    Berlin:'de',Munich:'de',Hamburg:'de',Heidelberg:'de',Frankfurt:'de',Cologne:'de',Dresden:'de',
    Paris:'fr',Lyon:'fr',Bordeaux:'fr',Toulouse:'fr',Marseille:'fr',Strasbourg:'fr',Nice:'fr',
    Rome:'it',Milan:'it',Florence:'it',Bologna:'it',Turin:'it',Naples:'it',Venice:'it',
    Lisbon:'pt',Porto:'pt',Coimbra:'pt',Braga:'pt',Aveiro:'pt',Faro:'pt',
    Boston:'us','New York':'us','San Francisco':'us','Los Angeles':'us',Chicago:'us',Austin:'us',Seattle:'us',
    Zurich:'ch',Geneva:'ch',Lausanne:'ch',Bern:'ch',Basel:'ch',Lugano:'ch',Fribourg:'ch',
    Kyiv:'ua',Lviv:'ua',Kharkiv:'ua',Odesa:'ua',Dnipro:'ua',Zaporizhzhia:'ua',Vinnytsia:'ua'
};

var ADMIN_USERNAME = 'admin';
var ADMIN_EMAIL    = 'admin@uniscout.com';

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

var ADMIN_PW_KEY = 'uniscout_admin_pw';
var ADMIN_PW_HASH = localStorage.getItem(ADMIN_PW_KEY) || hashPassword('1234');

// Admin is a STATUS, not a user account — purge any admin record from the users list.
(function purgeAdminUser() {
    try {
        var users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        var cleaned = users.filter(function (u) {
            return u.role !== 'ADMIN' && (u.username || '').toLowerCase() !== 'admin';
        });
        if (cleaned.length !== users.length) {
            localStorage.setItem(USERS_KEY, JSON.stringify(cleaned));
        }
    } catch (e) {}
}());

var AVA_COLORS = [
    '#e74c3c','#e67e22','#f39c12','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'
];
function avaColor(str) {
    var h = 0;
    for (var i = 0; i < (str || 'U').length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return AVA_COLORS[Math.abs(h) % AVA_COLORS.length];
}
function avaInitials(name) { return (name || 'U').charAt(0).toUpperCase(); }

function isAdminLoggedIn() {
    return localStorage.getItem(ADMIN_SESSION_KEY) === 'yes';
}

function setAdminSession() {
    localStorage.setItem(ADMIN_SESSION_KEY, 'yes');
}

function clearAdminSession() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
}

var loginScreen = document.getElementById('admLoginScreen');
var admPanel    = document.getElementById('admPanel');

if (isAdminLoggedIn()) {
    showPanel();
} else {
    loginScreen.style.display = 'flex';
    admPanel.style.display = 'none';
}

function showPanel() {
    loginScreen.style.display = 'none';
    admPanel.style.display = 'flex';
    initPanel();
}

var admUserInput = document.getElementById('admUser');
var admPwInput   = document.getElementById('admPw');
var admLoginBtn  = document.getElementById('admLoginBtn');
var admLoginErr  = document.getElementById('admLoginErr');
var admUserErr   = document.getElementById('admUserErr');
var admPwErr     = document.getElementById('admPwErr');

document.getElementById('admPwEye').addEventListener('click', function () {
    var inp = admPwInput;
    var icon = this.querySelector('i');
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.className = 'fa-solid fa-eye';
    } else {
        inp.type = 'password';
        icon.className = 'fa-solid fa-eye-slash';
    }
});

admLoginBtn.addEventListener('click', attemptLogin);
admPwInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
});
admUserInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
});

function attemptLogin() {
    admUserErr.textContent = '';
    admPwErr.textContent = '';
    admLoginErr.classList.remove('show');

    var user = admUserInput.value.trim();
    var pw   = admPwInput.value;

    if (!user) { admUserErr.textContent = 'Enter your username'; return; }
    if (!pw)   { admPwErr.textContent = 'Enter your password'; return; }

    if (user.toLowerCase() !== ADMIN_USERNAME) {
        admLoginErr.textContent = 'Invalid admin credentials';
        admLoginErr.classList.add('show');
        return;
    }

    if (hashPassword(pw) !== ADMIN_PW_HASH) {
        admPwErr.textContent = 'Incorrect password';
        return;
    }

    admLoginBtn.classList.add('loading');
    admLoginBtn.textContent = 'Signing in…';

    setTimeout(function () {
        setAdminSession();
        showPanel();
    }, 600);
}

function initPanel() {
    initNav();
    initClock();
    loadData();

    document.getElementById('admLogout').addEventListener('click', function () {
        clearAdminSession();
        window.location.reload();
    });

    document.getElementById('admRefresh').addEventListener('click', function () {
        var btn = document.getElementById('admRefresh');
        btn.classList.add('spinning');
        loadData();
        setTimeout(function () { btn.classList.remove('spinning'); }, 500);
    });

    document.getElementById('admMenuBtn').addEventListener('click', function () {
        document.getElementById('admSidebar').classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
        var sidebar = document.getElementById('admSidebar');
        if (sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            e.target !== document.getElementById('admMenuBtn')) {
            sidebar.classList.remove('open');
        }
    });

    initSettings();
}

var NAV_TABS = {
    overview:     'tabOverview',
    users:        'tabUsers',
    messages:     'tabMessages',
    saved:        'tabSaved',
    universities: 'tabUniversities',
    cities:       'tabCities',
    settings:     'tabSettings'
};

var NAV_TITLES = {
    overview:     'Overview',
    users:        'Users',
    messages:     'Community Messages',
    saved:        'Saved Universities',
    universities: 'Universities',
    cities:       'Cities',
    settings:     'Settings'
};

var currentTab = 'overview';

function initNav() {
    document.querySelectorAll('.adm__nav__item').forEach(function (btn) {
        btn.addEventListener('click', function () {
            switchTab(btn.dataset.tab);
        });
    });
}

function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.adm__nav__item').forEach(function (btn) {
        btn.classList.toggle('adm__nav__item--active', btn.dataset.tab === tab);
    });

    Object.keys(NAV_TABS).forEach(function (key) {
        var el = document.getElementById(NAV_TABS[key]);
        if (el) el.style.display = key === tab ? '' : 'none';
    });

    document.getElementById('admPageTitle').textContent = NAV_TITLES[tab] || tab;
}

function initClock() {
    function tick() {
        var now = new Date();
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        var el = document.getElementById('admClock');
        if (el) el.textContent = h + ':' + m + ':' + s;
    }
    tick();
    setInterval(tick, 1000);
}

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || '[]').filter(function (u) {
            return u.role !== 'ADMIN' && (u.username || '').toLowerCase() !== 'admin';
        });
    } catch (e) { return []; }
}

function getChatData() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '{}'); } catch (e) { return {}; }
}

function getSaved() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}'); } catch (e) { return {}; }
}

function loadData() {
    var users    = getUsers();
    var chatData = getChatData();
    var saved    = getSaved();

    var totalMsgs = 0;
    Object.keys(chatData).forEach(function (k) {
        var msgs = chatData[k];
        if (Array.isArray(msgs)) totalMsgs += msgs.length;
    });

    var totalSaved = 0;
    Object.keys(saved).forEach(function (k) {
        var arr = saved[k];
        if (Array.isArray(arr)) totalSaved += arr.length;
    });

    var todayStr = new Date().toISOString().slice(0, 10);
    var todayCount = users.filter(function (u) {
        return u.createdAt && u.createdAt.startsWith(todayStr);
    }).length;

    document.getElementById('navBadgeUsers').textContent    = users.length;
    document.getElementById('navBadgeMessages').textContent = totalMsgs;

    setText('ovTotalUsers',    users.length);
    setText('ovTotalMessages', totalMsgs);
    setText('ovTotalSaved',    totalSaved);
    setText('ovTodayUsers',    todayCount);

    renderRecentUsers(users);
    renderActiveChats(chatData);
    renderUsersTable(users);
    renderMessages(chatData, users);
    renderSaved(saved, users);
    renderUniversitiesTab();
    renderCitiesTab();
    loadAllAdminUnis();   // load every university (with websites) from the data files
}

function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderRecentUsers(users) {
    var list = document.getElementById('ovRecentUsers');
    if (!list) return;

    var recent = users.slice().sort(function (a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }).slice(0, 6);

    if (!recent.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--adm-text2);font-size:13px;">No users yet</div>';
        return;
    }

    list.innerHTML = recent.map(function (u) {
        var color = avaColor(u.username);
        var init  = avaInitials(u.username);
        var when  = formatRelative(u.createdAt);
        var isAdmin = u.role === 'ADMIN';
        return '<div class="adm__recent__item">' +
            '<div class="adm__recent__avatar" style="background:' + color + '">' + init + '</div>' +
            '<div class="adm__recent__name">' + esc(u.username) + (isAdmin ? ' <span class="adm__badge adm__badge--admin">Admin</span>' : '') + '</div>' +
            '<div class="adm__recent__meta">' + when + '</div>' +
        '</div>';
    }).join('');
}

function renderActiveChats(chatData) {
    var list = document.getElementById('ovActiveChats');
    if (!list) return;

    var entries = Object.keys(chatData).map(function (k) {
        return { id: k, count: Array.isArray(chatData[k]) ? chatData[k].length : 0 };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 6);

    if (!entries.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--adm-text2);font-size:13px;">No chats yet</div>';
        return;
    }

    list.innerHTML = entries.map(function (e) {
        var color = avaColor(e.id);
        return '<div class="adm__recent__item">' +
            '<div class="adm__recent__avatar" style="background:' + color + '">' + e.id.charAt(0).toUpperCase() + '</div>' +
            '<div class="adm__recent__name">' + esc(e.id.toUpperCase()) + '</div>' +
            '<div class="adm__recent__meta">' + e.count + ' msg' + (e.count !== 1 ? 's' : '') + '</div>' +
        '</div>';
    }).join('');
}

function renderUsersTable(users) {
    var tbody  = document.getElementById('usersTableBody');
    var empty  = document.getElementById('usersEmpty');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = users.map(function (u) {
        var color     = avaColor(u.username);
        var init      = avaInitials(u.username);
        var provider  = u.provider === 'google' ? 'Google' : 'Email';
        var badgeCls  = u.provider === 'google' ? 'adm__badge--google' : 'adm__badge--email';
        var joined    = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
        return '<tr>' +
            '<td><div class="adm__user__cell">' +
                '<div class="adm__user__ava" style="background:' + color + '">' + init + '</div>' +
                '<div>' +
                    '<div class="adm__user__name">' + esc(u.username) + '</div>' +
                    '<div class="adm__user__email"><i class="fa-solid fa-envelope"></i> ' + esc(u.email || '—') + '</div>' +
                '</div>' +
            '</div></td>' +
            '<td><span class="adm__id__chip">' + esc(u.id || '—') + '</span></td>' +
            '<td style="color:var(--adm-text2);font-size:12px;white-space:nowrap;">' + joined + '</td>' +
            '<td><span class="adm__badge ' + badgeCls + '">' + provider + '</span></td>' +
            '<td>' +
                '<button class="adm__action__btn adm__action__btn--del" title="Delete user" ' +
                    'data-act="del-user" data-id="' + esc(u.id) + '" data-name="' + esc(u.username) + '">' +
                    '<i class="fa-solid fa-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

document.getElementById('usersSearch').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    var users = getUsers().filter(function (u) {
        return !q ||
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.id || '').toLowerCase().includes(q);
    });
    renderUsersTable(users);
});

function confirmDeleteUser(uid, uname) {
    showConfirm(
        'Delete User',
        'Are you sure you want to permanently delete user "' + uname + '"? This cannot be undone.',
        function () {
            var raw = [];
            try { raw = JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch (e) {}
            var users = raw.filter(function (u) { return u.id !== uid; });
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
            loadData();
            showToast('User deleted', 'success');
        }
    );
}

function renderMessages(chatData, users) {
    var list  = document.getElementById('msgsList');
    var empty = document.getElementById('msgsEmpty');
    if (!list) return;

    var allMsgs = [];
    Object.keys(chatData).forEach(function (uniId) {
        var msgs = chatData[uniId];
        if (!Array.isArray(msgs)) return;
        msgs.forEach(function (m) {
            allMsgs.push({ uniId: uniId, msg: m });
        });
    });

    allMsgs.sort(function (a, b) { return (b.msg.ts || 0) - (a.msg.ts || 0); });

    if (!allMsgs.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = allMsgs.map(buildMsgItem).join('');
}

function buildMsgItem(item) {
    var m      = item.msg;
    var color  = avaColor(m.author || 'U');
    var init   = avaInitials(m.author || 'U');
    var when   = m.ts ? formatRelative(new Date(m.ts).toISOString()) : '—';
    return '<div class="adm__msg__item">' +
        '<div class="adm__msg__ava" style="background:' + color + '">' + init + '</div>' +
        '<div class="adm__msg__body">' +
            '<div class="adm__msg__top">' +
                '<span class="adm__msg__author">' + esc(m.author || 'Unknown') + '</span>' +
                '<span class="adm__msg__uni">' + esc(item.uniId.toUpperCase()) + '</span>' +
                '<span class="adm__msg__time">' + when + '</span>' +
            '</div>' +
            '<div class="adm__msg__text">' + esc(m.text || '') + '</div>' +
        '</div>' +
        '<button class="adm__msg__del" title="Delete message" ' +
            'data-act="del-msg" data-uni="' + esc(item.uniId) + '" data-id="' + esc(m.id) + '" data-author="' + esc(m.author || 'Unknown') + '">' +
            '<i class="fa-solid fa-trash"></i></button>' +
    '</div>';
}

document.getElementById('msgsSearch').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    var chatData = getChatData();
    var list  = document.getElementById('msgsList');
    var empty = document.getElementById('msgsEmpty');

    var allMsgs = [];
    Object.keys(chatData).forEach(function (uniId) {
        var msgs = chatData[uniId];
        if (!Array.isArray(msgs)) return;
        msgs.forEach(function (m) { allMsgs.push({ uniId: uniId, msg: m }); });
    });

    var filtered = allMsgs.filter(function (item) {
        return !q ||
            (item.msg.text || '').toLowerCase().includes(q) ||
            (item.msg.author || '').toLowerCase().includes(q) ||
            item.uniId.toLowerCase().includes(q);
    }).sort(function (a, b) { return (b.msg.ts || 0) - (a.msg.ts || 0); });

    if (!filtered.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = filtered.map(buildMsgItem).join('');
});

function confirmDeleteMsg(uniId, msgId, author) {
    showConfirm(
        'Delete Message',
        'Delete this message from "' + esc(author || 'Unknown') + '"?',
        function () {
            var chatData = getChatData();
            if (chatData[uniId]) {
                chatData[uniId] = chatData[uniId].filter(function (m) { return m.id !== msgId; });
                localStorage.setItem(CHAT_KEY, JSON.stringify(chatData));
            }
            loadData();
            showToast('Message deleted', 'success');
        }
    );
}

function renderSaved(saved, users) {
    var list  = document.getElementById('savedList');
    var empty = document.getElementById('savedEmpty');
    if (!list) return;

    var entries = Object.keys(saved).filter(function (uid) {
        var arr = saved[uid];
        return Array.isArray(arr) && arr.length > 0;
    });

    if (!entries.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = entries.map(function (uid) {
        var unis = saved[uid];
        var user = users.find(function (u) { return u.id === uid; });
        var name = user ? user.username : uid;
        var color = avaColor(name);
        return '<div class="adm__saved__item">' +
            '<div class="adm__saved__user">' +
                '<div class="adm__user__ava" style="background:' + color + ';width:24px;height:24px;font-size:11px;">' + avaInitials(name) + '</div>' +
                esc(name) +
                '<span style="color:var(--adm-text2);font-size:11px;font-weight:400;">' + unis.length + ' saved</span>' +
            '</div>' +
            '<div class="adm__saved__unis">' +
                unis.map(function (id) {
                    return '<span class="adm__saved__tag">' + esc(String(id).toUpperCase()) + '</span>';
                }).join('') +
            '</div>' +
        '</div>';
    }).join('');
}

function initSettings() {
    document.getElementById('settSaveBtn').addEventListener('click', function () {
        var settErr = document.getElementById('settErr');
        settErr.textContent = '';

        var oldPw  = document.getElementById('settOldPw').value;
        var newPw  = document.getElementById('settNewPw').value;
        var confPw = document.getElementById('settConfPw').value;

        if (hashPassword(oldPw) !== ADMIN_PW_HASH) {
            settErr.textContent = 'Current password is incorrect';
            return;
        }
        if (newPw.length < 4) {
            settErr.textContent = 'New password must be at least 4 characters';
            return;
        }
        if (newPw !== confPw) {
            settErr.textContent = 'Passwords do not match';
            return;
        }

        ADMIN_PW_HASH = hashPassword(newPw);
        localStorage.setItem(ADMIN_PW_KEY, ADMIN_PW_HASH);

        document.getElementById('settOldPw').value = '';
        document.getElementById('settNewPw').value = '';
        document.getElementById('settConfPw').value = '';
        showToast('Password updated', 'success');
    });

    document.getElementById('exportUsersBtn').addEventListener('click', function () {
        downloadJSON(getUsers(), 'uniscout_users.json');
    });

    document.getElementById('exportMsgsBtn').addEventListener('click', function () {
        downloadJSON(getChatData(), 'uniscout_messages.json');
    });

    document.getElementById('clearMsgsBtn').addEventListener('click', function () {
        showConfirm(
            'Clear All Messages',
            'This will permanently delete all community messages across all universities. This cannot be undone.',
            function () {
                localStorage.removeItem(CHAT_KEY);
                loadData();
                showToast('All messages cleared', 'success');
            }
        );
    });
}

function downloadJSON(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

var confirmCallback = null;

function showConfirm(title, body, onOk) {
    document.getElementById('admConfirmTitle').textContent = title;
    document.getElementById('admConfirmBody').textContent  = body;
    confirmCallback = onOk;
    document.getElementById('admConfirmOverlay').classList.add('open');
}

document.getElementById('admConfirmCancel').addEventListener('click', function () {
    document.getElementById('admConfirmOverlay').classList.remove('open');
    confirmCallback = null;
});

document.getElementById('admConfirmOk').addEventListener('click', function () {
    document.getElementById('admConfirmOverlay').classList.remove('open');
    if (typeof confirmCallback === 'function') confirmCallback();
    confirmCallback = null;
});

document.getElementById('admConfirmOverlay').addEventListener('click', function (e) {
    if (e.target === this) {
        this.classList.remove('open');
        confirmCallback = null;
    }
});

var toastTimer = null;

function showToast(msg, type) {
    var toast = document.getElementById('admToast');
    var msgEl = document.getElementById('admToastMsg');
    var icon  = toast.querySelector('i');

    msgEl.textContent = msg;
    toast.className = 'adm__toast ' + (type || 'success');
    if (type === 'error') {
        icon.className = 'fa-solid fa-circle-xmark';
    } else {
        icon.className = 'fa-solid fa-circle-check';
    }
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatRelative(isoStr) {
    if (!isoStr) return '—';
    var diff = Date.now() - new Date(isoStr).getTime();
    var s = Math.floor(diff / 1000);
    if (s < 60)      return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60)      return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24)      return h + 'h ago';
    var d = Math.floor(h / 24);
    if (d < 30)      return d + 'd ago';
    return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

var uniPage = 1, uniCountryFilter = 'all', uniSearch = '';
var UNI_PER_PAGE = 10;

var CUSTOM_UNIS_KEY = 'uniscout_custom_unis';

function getCustomUnis() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_UNIS_KEY) || '[]'); } catch (e) { return []; }
}
function setCustomUnis(arr) {
    localStorage.setItem(CUSTOM_UNIS_KEY, JSON.stringify(arr));
}

function getAllUnis() {
    var customUnis = getCustomUnis();
    // Once the data files are loaded, show every university (with websites).
    if (ADMIN_DATA_UNIS.length) return customUnis.concat(ADMIN_DATA_UNIS);
    // Fallback before load completes
    var spainUnis = (typeof UNI !== 'undefined') ? UNI.map(function (u) {
        return { id: u.id, name: u.name, abbr: u.abbr, country: 'es',
                 city: u.city, type: u.type, tuition: u.tuition,
                 fields: u.fields || [], diff: u.diff || 0, website: u.website || '' };
    }) : [];
    var otherUnis  = (typeof UNI_DB !== 'undefined') ? UNI_DB : [];
    return customUnis.concat(spainUnis, otherUnis);
}

// Load all universities (with websites) from the data files for the admin table.
function loadAllAdminUnis() {
    Promise.all(ADMIN_DATA_COUNTRIES.map(function (code) {
        return fetch('data/' + code + '.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.universities) return [];
                return d.universities.map(function (u) {
                    return { id: u.id, name: u.name, abbr: u.abbr, country: code,
                             city: u.city, type: u.type, tuition: u.tuition,
                             fields: u.fields || [], diff: u.diff || 0, website: u.website || '' };
                });
            })
            .catch(function () { return []; });
    })).then(function (groups) {
        ADMIN_DATA_UNIS = groups.reduce(function (a, b) { return a.concat(b); }, []);
        if (typeof renderUniversitiesTab === 'function') renderUniversitiesTab();
    });
}

function renderUniversitiesTab() {
    var allUnis = getAllUnis();

    var badge = document.getElementById('navBadgeUnis');
    if (badge) badge.textContent = allUnis.length;

    var filtered = allUnis.filter(function (u) {
        var matchCountry = uniCountryFilter === 'all' || u.country === uniCountryFilter;
        var q = uniSearch.toLowerCase();
        var matchSearch = !q ||
            (u.name || '').toLowerCase().indexOf(q) !== -1 ||
            (u.city || '').toLowerCase().indexOf(q) !== -1 ||
            (u.abbr || '').toLowerCase().indexOf(q) !== -1 ||
            (u.type || '').toLowerCase().indexOf(q) !== -1 ||
            (u.fields || []).join(' ').toLowerCase().indexOf(q) !== -1;
        return matchCountry && matchSearch;
    });

    var totalPages = Math.max(1, Math.ceil(filtered.length / UNI_PER_PAGE));
    uniPage = Math.min(uniPage, totalPages);
    var start = (uniPage - 1) * UNI_PER_PAGE;
    var pageUnis = filtered.slice(start, start + UNI_PER_PAGE);

    var tbody = document.getElementById('unisTableBody');
    var empty = document.getElementById('unisEmpty');
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        var pagEl = document.getElementById('unisPagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = pageUnis.map(function (u) {
        var flag    = ADMIN_COUNTRY_FLAGS[u.country] || '';
        var country = ADMIN_COUNTRY_NAMES[u.country] || u.country.toUpperCase();
        var diffLabel = ADMIN_DIFF_LABELS[u.diff] || '—';
        var diffColor = ADMIN_DIFF_COLORS[u.diff] || 'var(--adm-text2)';
        var typeClass = u.type === 'Public' ? 'adm__badge--email' : 'adm__badge--google';
        var fields    = (u.fields || []);
        var shown     = fields.slice(0, 3);
        var extra     = fields.length - shown.length;
        var fieldsHtml = shown.map(function (f) {
            return '<span class="adm__field__tag">' + esc(f) + '</span>';
        }).join('') + (extra > 0 ? '<span class="adm__field__tag adm__field__tag--more">+' + extra + '</span>' : '');

        var nameCell = esc(u.name) + (u.custom ? ' <span class="adm__badge adm__badge--admin" style="font-size:9px;">Custom</span>' : '');
        var actionCell = u.custom
            ? '<button class="adm__action__btn adm__action__btn--del" title="Delete university" ' +
                  'data-act="del-uni" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">' +
                  '<i class="fa-solid fa-trash"></i></button>'
            : '<span style="font-size:11px;color:var(--adm-text2);">—</span>';

        var host = '';
        if (u.website) { try { host = new URL(u.website).hostname.replace(/^www\./, ''); } catch (e) { host = u.website; } }
        var webCell = u.website
            ? '<a href="' + esc(u.website) + '" target="_blank" rel="noopener" style="font-size:11.5px;color:#3b82f6;text-decoration:none;display:inline-flex;align-items:center;gap:5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;flex-shrink:0;"></i>' + esc(host) + '</a>'
            : '<span style="font-size:11px;color:var(--adm-text2);">—</span>';

        return '<tr>' +
            '<td><div class="adm__user__cell">' +
                '<div class="adm__uni__abbr">' + esc(u.abbr || u.id.toUpperCase()) + '</div>' +
                '<div class="adm__user__name" style="font-size:12.5px;">' + nameCell + '</div>' +
            '</div></td>' +
            '<td><span class="adm__country__cell">' + flag + ' <span style="font-size:12px;color:var(--adm-text2);">' + esc(country) + '</span></span></td>' +
            '<td style="font-size:12px;color:var(--adm-text2);">' + esc(u.city) + '</td>' +
            '<td><span class="adm__badge ' + typeClass + '">' + esc(u.type) + '</span></td>' +
            '<td style="font-size:11.5px;color:var(--adm-text2);white-space:nowrap;">' + esc(u.tuition) + '</td>' +
            '<td>' + webCell + '</td>' +
            '<td><div class="adm__fields__wrap">' + fieldsHtml + '</div></td>' +
            '<td><span style="font-size:12px;font-weight:700;color:' + diffColor + ';">' + esc(diffLabel) + '</span></td>' +
            '<td>' + actionCell + '</td>' +
        '</tr>';
    }).join('');

    renderPagination('unisPagination', uniPage, totalPages, 'uniPageChange');
}

document.getElementById('unisCountryFilter').addEventListener('change', function () {
    uniCountryFilter = this.value;
    uniPage = 1;
    renderUniversitiesTab();
});

document.getElementById('unisSearch').addEventListener('input', function () {
    uniSearch = this.value.trim();
    uniPage = 1;
    renderUniversitiesTab();
});

/* ── Add University modal ── */
function slugify(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || ('uni' + Date.now());
}

// Derive an abbreviation from a university name (e.g. "University of Vienna" -> "UNIVIE")
function deriveAbbr(name) {
    var stop = { of:1, the:1, and:1, 'for':1, de:1, di:1, du:1, la:1, le:1, el:1 };
    var words = String(name).split(/\s+/).filter(function (w) { return w && !stop[w.toLowerCase()]; });
    if (words.length >= 2) {
        return words.map(function (w) { return w.charAt(0); }).join('').toUpperCase().slice(0, 5);
    }
    return String(name).replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() || 'UNI';
}

// Parse a tuition string into a 1–5 cost tier
function tuitionTier(tuition) {
    var m = String(tuition).replace(/[,\s]/g, '').match(/\d+/);
    if (!m) return 2;
    var n = parseInt(m[0], 10);
    if (n < 1500)  return 1;
    if (n < 4000)  return 2;
    if (n < 10000) return 3;
    if (n < 20000) return 4;
    return 5;
}

// Generate a realistic, varied description from the known facts
function generateUniDescription(u) {
    var country = ADMIN_COUNTRY_NAMES[u.country] || '';
    var loc = u.city + (country ? ', ' + country : '');
    var isPublic = (u.type || 'Public').toLowerCase() === 'public';
    var ts = tuitionTier(u.tuition);

    // deterministic variety based on the name
    var seed = 0;
    for (var i = 0; i < u.name.length; i++) seed = (seed * 31 + u.name.charCodeAt(i)) >>> 0;
    function pick(arr) { return arr[seed % arr.length]; }

    var opener = pick([
        u.name + ' is a respected ' + (isPublic ? 'public' : 'private') + ' university based in ' + loc + '.',
        'Located in ' + loc + ', ' + u.name + ' is a ' + (isPublic ? 'publicly funded' : 'private') + ' institution of higher education.',
        u.name + ' is a leading ' + (isPublic ? 'public' : 'private') + ' university in ' + loc + ', attracting students from across the region and beyond.'
    ]);

    var character = isPublic
        ? pick([
            'As a state-funded institution, it offers a broad academic portfolio at accessible, regulated tuition while upholding rigorous national quality standards.',
            'Backed by public funding, the university combines affordable fees with a wide range of degree programmes and a strong research culture.',
            'As a public university, it provides regulated tuition, large faculties and degrees recognised throughout the country and internationally.'
          ])
        : pick([
            'As a private institution, it is known for smaller class sizes, close faculty contact and a strongly industry-oriented curriculum.',
            'Operating privately, the university focuses on personalised teaching, modern facilities and close ties with employers and industry.',
            'As a private university, it offers a selective, career-focused environment with an emphasis on practical, employable skills.'
          ]);

    var costNote = ['',
        'With very affordable tuition, it is an excellent-value choice for both domestic and international students.',
        'Its moderate tuition makes it a popular, good-value destination for international applicants.',
        'Tuition sits in the mid-range, reflecting its established academic standing.',
        'Premium tuition reflects its strong reputation and the investment in a globally recognised degree.',
        'As a premium institution, its fees are among the higher tier — matched by its prestige and graduate outcomes.'
    ][ts];

    var cityNote = pick([
        'Students benefit from a vibrant city setting with a lively campus community and rich student life.',
        'The surrounding city offers an engaging environment, with plenty of culture, amenities and opportunities for students.',
        'Its location places students at the heart of an active, welcoming student city.'
    ]);

    return [opener, character, costNote, cityNote].filter(Boolean).join(' ');
}

(function initAddUni() {
    var overlay = document.getElementById('addUniOverlay');
    var openBtn = document.getElementById('addUniBtn');
    var closeBtn = document.getElementById('addUniClose');
    var cancelBtn = document.getElementById('addUniCancel');
    var saveBtn = document.getElementById('addUniSave');
    var errEl = document.getElementById('addUniErr');
    if (!overlay || !openBtn) return;

    var fieldIds = ['nuName','nuCountry','nuCity','nuType','nuTuition','nuWebsite'];

    function openModal() {
        errEl.textContent = '';
        fieldIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') el.selectedIndex = 0;
            else el.value = '';
        });
        overlay.classList.add('open');
    }
    function closeModal() { overlay.classList.remove('open'); }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    saveBtn.addEventListener('click', function () {
        errEl.textContent = '';
        var name    = document.getElementById('nuName').value.trim();
        var country = document.getElementById('nuCountry').value;
        var city    = document.getElementById('nuCity').value.trim();
        var type    = document.getElementById('nuType').value;
        var tuition = document.getElementById('nuTuition').value.trim();
        var website = document.getElementById('nuWebsite').value.trim();

        if (!name) { errEl.textContent = 'University name is required.'; return; }
        if (!city) { errEl.textContent = 'City / place is required.'; return; }

        // normalise website to a full URL
        if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;

        var customUnis = getCustomUnis();
        var id = slugify(name);
        var base = id, n = 2;
        var allIds = getAllUnis().map(function (u) { return u.id; });
        while (allIds.indexOf(id) !== -1) { id = base + n; n++; }

        var uni = {
            id: id,
            name: name,
            abbr: deriveAbbr(name),
            country: country,
            city: city,
            type: type,
            tuition: tuition || '—',
            ts: tuitionTier(tuition),
            fields: [],
            diff: 3,
            website: website,
            custom: true
        };
        uni.desc = generateUniDescription(uni);  // auto-written, realistic description
        customUnis.unshift(uni);
        setCustomUnis(customUnis);

        closeModal();
        uniCountryFilter = 'all';
        uniSearch = '';
        var csel = document.getElementById('unisCountryFilter'); if (csel) csel.value = 'all';
        var ssel = document.getElementById('unisSearch'); if (ssel) ssel.value = '';
        uniPage = 1;
        renderUniversitiesTab();
        showToast('University "' + name + '" added', 'success');
    });
}());

function confirmDeleteUni(uid, uname) {
    showConfirm(
        'Delete University',
        'Delete the custom university "' + uname + '"? This cannot be undone.',
        function () {
            var customUnis = getCustomUnis().filter(function (u) { return u.id !== uid; });
            setCustomUnis(customUnis);
            renderUniversitiesTab();
            showToast('University deleted', 'success');
        }
    );
}

/* ── Delegated handler for all data-act delete buttons ── */
document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'del-user') {
        confirmDeleteUser(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
    } else if (act === 'del-msg') {
        confirmDeleteMsg(btn.getAttribute('data-uni'), btn.getAttribute('data-id'), btn.getAttribute('data-author'));
    } else if (act === 'del-uni') {
        confirmDeleteUni(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
    }
});

var cityPage = 1, cityCountryFilter = 'all', citySearch = '';
var CITY_PER_PAGE = 10;

function renderCitiesTab() {
    if (typeof CITY_INFO === 'undefined') return;

    var allCities = Object.keys(CITY_INFO).map(function (name) {
        var c = CITY_INFO[name];
        return {
            name:    name,
            country: ADMIN_CITY_COUNTRIES[name] || null,
            region:  c.region  || '—',
            pop:     c.pop     || '—',
            climate: c.climate || '—',
            cost:    c.cost    || '—',
            tags:    c.tags    || []
        };
    }).filter(function (c) { return c.country !== null; });

    var filtered = allCities.filter(function (c) {
        var matchCountry = cityCountryFilter === 'all' || c.country === cityCountryFilter;
        var q = citySearch.toLowerCase();
        var matchSearch = !q ||
            c.name.toLowerCase().indexOf(q) !== -1 ||
            (c.region || '').toLowerCase().indexOf(q) !== -1 ||
            (c.climate || '').toLowerCase().indexOf(q) !== -1 ||
            (ADMIN_COUNTRY_NAMES[c.country] || '').toLowerCase().indexOf(q) !== -1 ||
            (c.tags || []).join(' ').toLowerCase().indexOf(q) !== -1;
        return matchCountry && matchSearch;
    });

    var totalPages = Math.max(1, Math.ceil(filtered.length / CITY_PER_PAGE));
    cityPage = Math.min(cityPage, totalPages);
    var start = (cityPage - 1) * CITY_PER_PAGE;
    var pageCities = filtered.slice(start, start + CITY_PER_PAGE);

    var tbody = document.getElementById('citiesTableBody');
    var empty = document.getElementById('citiesEmpty');
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        var pagEl = document.getElementById('citiesPagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = pageCities.map(function (c) {
        var flag    = ADMIN_COUNTRY_FLAGS[c.country] || '';
        var country = ADMIN_COUNTRY_NAMES[c.country] || c.country.toUpperCase();
        var tagsHtml = (c.tags || []).slice(0, 3).map(function (t) {
            return '<span class="adm__field__tag">' + esc(t) + '</span>';
        }).join('');

        return '<tr>' +
            '<td style="font-weight:600;font-size:13px;">' + esc(c.name) + '</td>' +
            '<td><span class="adm__country__cell">' + flag + ' <span style="font-size:12px;color:var(--adm-text2);">' + esc(country) + '</span></span></td>' +
            '<td style="font-size:12px;color:var(--adm-text2);">' + esc(c.region) + '</td>' +
            '<td style="font-size:12px;color:var(--adm-text2);white-space:nowrap;">' + esc(c.pop) + '</td>' +
            '<td style="font-size:12px;color:var(--adm-text2);">' + esc(c.climate) + '</td>' +
            '<td style="font-size:12px;font-weight:600;color:var(--adm-green);white-space:nowrap;">' + esc(c.cost) + '</td>' +
            '<td><div class="adm__fields__wrap">' + tagsHtml + '</div></td>' +
        '</tr>';
    }).join('');

    renderPagination('citiesPagination', cityPage, totalPages, 'cityPageChange');
}

document.getElementById('citiesCountryFilter').addEventListener('change', function () {
    cityCountryFilter = this.value;
    cityPage = 1;
    renderCitiesTab();
});

document.getElementById('citiesSearch').addEventListener('input', function () {
    citySearch = this.value.trim();
    cityPage = 1;
    renderCitiesTab();
});

function renderPagination(containerId, currentPage, totalPages, fnName) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    function btn(page, label, active, disabled) {
        return '<button class="adm__pag__btn' + (active ? ' adm__pag__btn--active' : '') + '"' +
            (disabled ? ' disabled' : '') +
            ' data-page="' + page + '" data-fn="' + fnName + '">' + label + '</button>';
    }

    var html = '<div class="adm__pag__wrap">';
    html += btn(currentPage - 1, '<i class="fa-solid fa-chevron-left"></i>', false, currentPage <= 1);

    var rangeStart = Math.max(1, currentPage - 2);
    var rangeEnd   = Math.min(totalPages, currentPage + 2);

    if (rangeStart > 1) {
        html += btn(1, '1', false, false);
        if (rangeStart > 2) html += '<span class="adm__pag__ellipsis">…</span>';
    }
    for (var p = rangeStart; p <= rangeEnd; p++) {
        html += btn(p, p, p === currentPage, false);
    }
    if (rangeEnd < totalPages) {
        if (rangeEnd < totalPages - 1) html += '<span class="adm__pag__ellipsis">…</span>';
        html += btn(totalPages, totalPages, false, false);
    }

    html += btn(currentPage + 1, '<i class="fa-solid fa-chevron-right"></i>', false, currentPage >= totalPages);
    html += '<span class="adm__pag__info">Page ' + currentPage + ' of ' + totalPages + '</span>';
    html += '</div>';

    el.innerHTML = html;
}

document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-fn]') : null;
    if (!btn || btn.disabled || btn.hasAttribute('disabled')) return;
    var fn   = btn.getAttribute('data-fn');
    var page = parseInt(btn.getAttribute('data-page'), 10);
    if (isNaN(page) || page < 1) return;
    if (fn === 'uniPageChange')  { uniPage  = page; renderUniversitiesTab(); }
    if (fn === 'cityPageChange') { cityPage = page; renderCitiesTab(); }
});

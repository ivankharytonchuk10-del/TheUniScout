'use strict';

var SESSION_KEY = 'uniscout_session';
function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch(e) { return null; }
}
var user = getSession();
if (!user) { window.location.href = 'log-in.html'; }

// Recovery hatch: open mainPage.html?reset to clear custom photos/avatar if a bad
// stored image ever prevents the page from loading. (Then remove ?reset.)
(function () {
    try {
        if (/[?&]reset\b/.test(location.search) && user) {
            ['explore', 'apply', 'chances', 'deadlines', 'matcher', 'gradebook'].forEach(function (k) { localStorage.removeItem('us_hero_' + k + '_' + user.id); });
            var pk = 'us_profile_' + user.id;
            var p = JSON.parse(localStorage.getItem(pk) || '{}'); delete p.avatar;
            localStorage.setItem(pk, JSON.stringify(p));
        }
    } catch (e) {}
}());

// Safety: if any error ever leaves a modal open, never let the page stay locked.
window.addEventListener('error', function () {
    try {
        document.body.style.overflow = '';
        document.querySelectorAll('.pricing__overlay.open, .pay__overlay.open, .ttl__overlay.open, .cmp__modal__overlay.open')
            .forEach(function (o) { o.classList.remove('open'); });
    } catch (e) {}
});

try { localStorage.setItem('us_lastseen_' + user.id, Date.now()); } catch (e) { /* storage full — don't halt the app */ }
document.getElementById('mpName').textContent = user.username;
document.getElementById('heroName').textContent = user.username;
document.getElementById('mpSignout').addEventListener('click', function () {
    localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'log-in.html';
});

var SAVED_KEY      = 'us_saved_'     + user.id;
var FORM_APPS_KEY  = 'us_form_apps_' + user.id;
function getSaved()    { try { return JSON.parse(localStorage.getItem(SAVED_KEY)     || '[]'); } catch(e) { return []; } }
function getFormApps() { try { return JSON.parse(localStorage.getItem(FORM_APPS_KEY) || '[]'); } catch(e) { return []; } }
function setSaved(d)    { localStorage.setItem(SAVED_KEY,     JSON.stringify(d)); }
function setFormApps(d) { localStorage.setItem(FORM_APPS_KEY, JSON.stringify(d)); }

var TS_COST = { 1:700, 2:1200, 3:5000, 4:15000, 5:25000 };

var PROFILE_KEY = 'us_profile_' + user.id;
function getProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{"budget":5000}'); } catch(e) { return { budget:5000 }; }
}
function setProfile(d) { localStorage.setItem(PROFILE_KEY, JSON.stringify(d)); }

function setBudgetMode(on) {
    budgetFilterOn = on;
    var btn = document.getElementById('budgetFilterBtn');
    if (btn) btn.classList.toggle('active', on);
    var badge = document.getElementById('budgetFilterBadge');
    if (badge) badge.style.display = on ? 'flex' : 'none';
    renderCompare();
}

var heroInsightIdx = 0;
function updateHeroInsight() {
    var saves = (typeof getInsightSaves === 'function') ? getInsightSaves() : [];
    var card  = document.getElementById('heroInsightCard');
    if (!card || !saves.length) return;
    var s = saves[heroInsightIdx % saves.length];
    if (!s) return;
    var num = card.querySelector('.hero__ins__num');
    var lbl = card.querySelector('.hero__ins__lbl');
    var nm  = card.querySelector('.hero__ins__name');
    if (num) { num.textContent = s.prob + '%'; num.style.color = s.verdictColor; }
    if (lbl) lbl.textContent = s.verdict;
    if (nm)  nm.textContent  = s.name;
}
function updateHeroStats() { updateStats(); }
function updateHeroFeed() {
    var el = document.getElementById('heroFeedVal');
    if (!el || typeof FEED_UPDATES === 'undefined') return;
    var saved = getSaved();
    var readIds = getNewsRead();
    var count = 0;
    FEED_UPDATES.forEach(function(u, i) {
        if (saved.indexOf(u.uniId) === -1) return;
        if (parseDaysAgo(u.date) >= 2) return;
        if (readIds.indexOf(getFeedItemId(u, i)) !== -1) return;
        count++;
    });
    el.textContent = count > 0 ? count + ' new update' + (count === 1 ? '' : 's') : 'No new updates';
}

var TABS = { overview:'tabOverview', compare:'tabCompare', explore:'tabExplore', cityguide:'tabCityGuide', tracker:'tabTracker', gradebook:'tabGradebook' };
var currentTab = 'overview';

function clearExploreFilters() {
    ['cmpSearch','fCity','fField','fType','fTuition'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var sortEl = document.getElementById('cmpSort');
    if (sortEl) sortEl.value = 'tuition-asc';
    if (typeof setBudgetMode === 'function') setBudgetMode(false);
    cmpPage = 1;
    if (typeof renderCompare === 'function') renderCompare();
}

function showTab(tab) {
    if (currentTab === 'explore' && tab !== 'explore') clearExploreFilters();
    currentTab = tab;
    Object.keys(TABS).forEach(function(k) {
        var el = document.getElementById(TABS[k]);
        if (k !== tab) { el.style.display = 'none'; return; }
        el.style.display = 'block';

        el.style.animation = 'none'; void el.offsetWidth;
        el.style.animation = '';
    });
    document.querySelectorAll('.mp__nav__btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    // Gradebook lives outside <main>; hide the (otherwise empty) main so it doesn't add a gap on top.
    var _main = document.querySelector('.mp__main');
    if (_main) _main.style.display = (tab === 'gradebook') ? 'none' : '';
    if (tab === 'explore' && typeof applyExploreMatcherLayout === 'function') applyExploreMatcherLayout();
    if (tab === 'gradebook' && typeof window.renderGradebook === 'function') window.renderGradebook();
}

document.querySelectorAll('.mp__nav__btn[data-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() { showTab(btn.dataset.tab); closeBurger(); });
});
document.querySelectorAll('[data-goto]').forEach(function(el) {
    el.addEventListener('click', function() { showTab(el.dataset.goto); closeBurger(); });
});

/* ── Burger menu (mobile nav) ── */
function closeBurger() {
    var nav = document.getElementById('mpNav');
    var scrim = document.getElementById('mpNavScrim');
    var burger = document.getElementById('mpBurger');
    if (nav) nav.classList.remove('mp__nav--open');
    if (scrim) scrim.classList.remove('open');
    if (burger) burger.querySelector('i').className = 'fa-solid fa-bars';
}
(function() {
    var burger = document.getElementById('mpBurger');
    var nav = document.getElementById('mpNav');
    var scrim = document.getElementById('mpNavScrim');
    if (!burger || !nav) return;
    burger.addEventListener('click', function(e) {
        e.stopPropagation();
        var open = nav.classList.toggle('mp__nav--open');
        if (scrim) scrim.classList.toggle('open', open);
        burger.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    });
    if (scrim) scrim.addEventListener('click', closeBurger);
}());

function animateStat(el, val) {
    if (!el) return;
    el.textContent = val;
    el.classList.remove('updated'); void el.offsetWidth; el.classList.add('updated');
    el.addEventListener('animationend', function(){ el.classList.remove('updated'); }, { once: true });
}
function updateRoadmap() {
    var saved     = getSaved().length;
    var apps      = getFormApps().length;
    var completed = 1;
    if (saved >= 1) completed = 2;
    if (saved >= 2) completed = 3;
    if (apps  >= 1) completed = 4;

    for (var s = 1; s <= 5; s++) {
        var el = document.getElementById('rdmStep' + s);
        if (!el) continue;
        el.classList.remove('rdm__step--done', 'rdm__step--active', 'rdm__step--pending');
        if (s < completed)       el.classList.add('rdm__step--done');
        else if (s === completed) el.classList.add('rdm__step--active');
        else                      el.classList.add('rdm__step--pending');
    }

    var fill = document.getElementById('rdmFill');
    if (fill) {

        var pct = Math.min(100, ((completed - 1) / 4) * 100);
        fill.style.width = pct + '%';
    }
}

(function() {
    var STEP_TAB = { 1: 'explore', 2: 'explore', 3: 'compare', 4: 'tracker', 5: 'tracker' };
    for (var s = 1; s <= 5; s++) {
        (function(step) {
            var el = document.getElementById('rdmStep' + step);
            if (!el) return;
            el.addEventListener('click', function() { showTab(STEP_TAB[step]); });
        })(s);
    }
}());

function updateStats() {
    animateStat(document.getElementById('statSaved'), getSaved().length);
    animateStat(document.getElementById('statApps'),  getFormApps().length);
    var sp = document.getElementById('statPlaces');
    if (sp) animateStat(sp, getSavedPlaces ? getSavedPlaces().length : 0);

    var hTotal = document.getElementById('heroStatTotal');
    var hSaved = document.getElementById('heroStatSaved');
    if (hTotal && typeof UNI !== 'undefined') hTotal.textContent = UNI.length;
    if (hSaved) hSaved.textContent = getSaved().length;
    if (typeof updateAppcount === 'function') updateAppcount();
    updateRoadmap();
}
updateStats();
renderFriendRequests();
updateFriendStats();
updateFriendsBadge();

function buildMiniCard(u) {
    var saved = getSaved();
    var on = saved.indexOf(u.id) !== -1;
    var tc = uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv';
    var typeLabel = uniTypeLabel(u);
    return '<div class="mp__uni__card" style="--c:' + u.color + '" data-id="' + u.id + '">' +
        '<div class="mp__card__top">' +
            '<div class="mp__card__abbr" style="background:' + u.color + '">' + u.abbr + '</div>' +
            '<div style="flex:1;min-width:0">' +
                '<div class="mp__card__name">' + u.name + '</div>' +
                '<div class="mp__card__badges">' +
                    '<span class="mp__badge mp__badge--city"><i class="fa-solid fa-location-dot" style="font-size:7px;margin-right:2px"></i>' + u.city + '</span>' +
                    '<span class="mp__badge ' + tc + '">' + typeLabel + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="mp__save__btn" data-id="' + u.id + '" style="color:' + (on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)') + '">' +
                '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>' +
            '</button>' +
        '</div>' +
        '<hr class="mp__card__divider">' +
        '<div class="mp__card__metrics">' +
            metricBar('Tuition', uniTuitionLabel(u), u.ts) +
            metricBar('Difficulty', u.dl || '—', u.diff) +
        '</div>' +
        '<hr class="mp__card__divider">' +
        '<div class="mp__card__fields">' + (u.fields||[]).slice(0,4).map(function(f){ return '<span class="mp__field__tag">'+f+'</span>'; }).join('') + '</div>' +
        '<div class="mp__card__langs">' + (u.langs||[]).map(function(l){ return '<span class="mp__lang__tag">'+l+'</span>'; }).join('') + '</div>' +
    '</div>';
}

function metricBar(label, val, score) {
    return '<div><div class="mp__metric__row"><span class="mp__metric__label">' + label + '</span><span class="mp__metric__val">' + val + '</span></div>' +
           '<div class="mp__bar__track"><div class="mp__bar__fill mp__bar--' + score + '"></div></div></div>';
}

function attachSave(container) {
    container.querySelectorAll('.mp__save__btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.dataset.id;
            var saved = getSaved();
            var idx = saved.indexOf(id);
            if (idx === -1) saved.push(id); else saved.splice(idx, 1);
            setSaved(saved);
            var on = saved.indexOf(id) !== -1;
            document.querySelectorAll('.mp__save__btn[data-id="' + id + '"]').forEach(function(b) {
                b.style.color = on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)';
                b.querySelector('i').className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark';
                b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
                b.addEventListener('animationend', function(){ b.classList.remove('pulse'); }, { once: true });
            });
            renderSaved();
            updateStats();
        });
    });
}

function renderSaved() {
    var saved = getSaved();
    var grid = document.getElementById('savedGrid');
    var empty = document.getElementById('savedEmpty');
    if (!saved.length) { grid.style.display = 'none'; empty.style.display = 'flex'; return; }
    empty.style.display = 'none'; grid.style.display = 'grid';
    grid.innerHTML = UNI.filter(function(u){ return saved.indexOf(u.id) !== -1; }).map(buildMiniCard).join('');
    attachSave(grid);
}
renderSaved();

var DIFF_LABELS = ['','Open','Low','Competitive','Highly selective','Elite selective'];

function buildDetailCard(u, rank) {
    var on = getSaved().indexOf(u.id) !== -1;
    var tc = uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv';
    var rb = rank === 1 ? 'cmp__rank__badge--gold' : rank === 2 ? 'cmp__rank__badge--silver' : rank === 3 ? 'cmp__rank__badge--bronze' : '';
    var rankBadge = rank <= 3 ? '<span class="cmp__rank__badge ' + rb + '">' + (rank===1?'#1 Top':rank===2?'#2':'#3') + '</span>' : '';
    var countryRank = (typeof UNI !== 'undefined') ? UNI.indexOf(u) + 1 : 0;
    var crBadge = countryRank > 0 ? '<span class="cmp__country__rank" title="National ranking">' +
        '<i class="fa-solid fa-ranking-star"></i> #' + countryRank + ' nationally</span>' : '';
    return '<div class="cmp__detail__card" style="--c:' + u.color + '" data-id="' + u.id + '" data-city="' + u.city + '" data-type="' + u.type + '" data-diff="' + u.diff + '" data-ts="' + u.ts + '" data-fields="' + u.fields.join(',') + '" data-langs="' + u.langs.join(',') + '">' +
        '<div class="cmp__rank">' +
            '<div class="cmp__rank__num">' + rank + '</div>' +
            rankBadge +
        '</div>' +
        '<div class="cmp__detail__body">' +
            '<div class="cmp__detail__name__row">' +
                '<div class="cmp__detail__name">' + u.name + '</div>' +
                crBadge +
            '</div>' +
            '<div class="cmp__detail__meta">' +
                '<span class="mp__badge mp__badge--city"><i class="fa-solid fa-location-dot" style="font-size:7px;margin-right:2px"></i>' + u.city + '</span>' +
                '<span class="mp__badge ' + tc + '">' + u.type + '</span>' +
                u.langs.map(function(l){ return '<span class="mp__badge mp__badge--city">' + l + '</span>'; }).join('') +
            '</div>' +
            '<div class="cmp__detail__grid">' +
                '<div class="cmp__detail__metric"><span class="cmp__detail__ml">Annual Tuition</span><span class="cmp__detail__mv cmp__detail__mv--highlight">' + uniTuitionLabel(u) + '</span>' +
                '<div class="mp__bar__track" style="margin-top:5px"><div class="mp__bar__fill mp__bar--' + u.ts + '"></div></div></div>' +
                '<div class="cmp__detail__metric"><span class="cmp__detail__ml">Entry Difficulty</span><span class="cmp__detail__mv">' + u.dl + '</span>' +
                '<div class="mp__bar__track" style="margin-top:5px"><div class="mp__bar__fill mp__bar--' + u.diff + '"></div></div></div>' +
                '<div class="cmp__detail__metric"><span class="cmp__detail__ml">Fields of Study</span><span class="cmp__detail__mv" style="font-size:10px;line-height:1.5">' + u.fields.slice(0,3).join(', ') + (u.fields.length > 3 ? ' +' + (u.fields.length-3) + ' more' : '') + '</span></div>' +
                '<div class="cmp__detail__metric"><span class="cmp__detail__ml">Degree Levels</span><span class="cmp__detail__mv" style="font-size:10px">Bachelor · Master · PhD</span></div>' +
            '</div>' +
        '</div>' +
        '<div class="cmp__detail__actions">' +
            '<button class="mp__save__btn" data-id="' + u.id + '" title="' + (on?'Unsave':'Save') + '" style="color:' + (on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)') + ';font-size:18px">' +
                '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>' +
            '</button>' +
        '</div>' +
    '</div>';
}

var budgetFilterOn = false;

function getFilteredSorted() {
    var q    = document.getElementById('cmpSearch').value.trim().toLowerCase();
    var city = document.getElementById('fCity').value;
    var field= document.getElementById('fField').value;
    var type = document.getElementById('fType').value;
    var tuit = document.getElementById('fTuition').value;
    var sort = document.getElementById('cmpSort').value;

    var results = UNI.filter(function(u) {
        if (city  && u.city !== city)              return false;
        if (type  && u.type !== type)              return false;
        if (tuit  && u.ts   >  parseInt(tuit))     return false;
        if (field && u.fields.indexOf(field) === -1) return false;
        if (q) {
            var haystack = (u.name + ' ' + u.city + ' ' + u.abbr + ' ' + u.fields.join(' ') + ' ' + u.langs.join(' ')).toLowerCase();
            if (haystack.indexOf(q) === -1) return false;
        }
        return true;
    });

    results.sort(function(a, b) {
        if (sort === 'tuition-desc') return b.ts - a.ts;
        return a.ts - b.ts;
    });

    if (budgetFilterOn) {
        var p = getProfile();
        results = results.filter(function(u) { return tuitionMinCost(u) <= p.budget; });
    }

    return results;
}

function hasActiveFilters() {
    var q    = document.getElementById('cmpSearch').value.trim();
    var city = document.getElementById('fCity').value;
    var field= document.getElementById('fField').value;
    var type = document.getElementById('fType').value;
    var tuit = document.getElementById('fTuition').value;
    return q || city || field || type || tuit || budgetFilterOn;
}
var cmpPage = 1;
var CMP_PER_PAGE = 20;

function renderCmpPagination(current, total) {
    var pg = document.getElementById('cmpPagination');
    if (!pg) return;
    if (total <= 1) { pg.style.display = 'none'; return; }
    pg.style.display = 'flex';
    var html = '<button class="ba__pg__btn" id="cmpPrev"' + (current === 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';
    var sp = Math.max(1, current - 2), ep = Math.min(total, current + 2);
    if (sp > 1) html += '<span class="ba__pg__dots">…</span>';
    for (var p = sp; p <= ep; p++) {
        html += '<button class="ba__pg__num' + (p === current ? ' ba__pg__num--active' : '') + '" data-p="' + p + '">' + p + '</button>';
    }
    if (ep < total) html += '<span class="ba__pg__dots">…</span>';
    html += '<button class="ba__pg__btn" id="cmpNext"' + (current === total ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>';
    pg.innerHTML = html;
    pg.querySelector('#cmpPrev').addEventListener('click', function() { if (cmpPage > 1) { cmpPage--; renderCompare(true); } });
    pg.querySelector('#cmpNext').addEventListener('click', function() { if (cmpPage < total) { cmpPage++; renderCompare(true); } });
    pg.querySelectorAll('.ba__pg__num').forEach(function(btn) {
        btn.addEventListener('click', function() { cmpPage = parseInt(btn.dataset.p); renderCompare(true); });
    });
}

function renderCompare(keepPage) {
    var list     = document.getElementById('cmpList');
    var noRes    = document.getElementById('cmpNoResults');
    var prompt   = document.getElementById('cmpFilterPrompt');
    var resultsHd= document.getElementById('cmpResultsHd');
    if (!list) return;

    if (!hasActiveFilters()) {
        if (prompt)   prompt.style.display   = 'flex';
        if (resultsHd)resultsHd.style.display= 'none';
        list.style.display  = 'none';
        list.innerHTML = '';
        if (noRes) noRes.style.display = 'none';
        var pg = document.getElementById('cmpPagination');
        if (pg) pg.style.display = 'none';
        return;
    }

    if (!keepPage) cmpPage = 1;
    if (prompt)    prompt.style.display   = 'none';
    if (resultsHd) resultsHd.style.display= 'flex';
    list.style.display = 'block';

    var results = getFilteredSorted();
    var totalPages = Math.max(1, Math.ceil(results.length / CMP_PER_PAGE));
    cmpPage = Math.min(cmpPage, totalPages);
    var start = (cmpPage - 1) * CMP_PER_PAGE;
    var pageResults = results.slice(start, start + CMP_PER_PAGE);

    var countEl = document.getElementById('cmpCount');
    var totalEl = document.getElementById('cmpTotal');
    if (countEl) countEl.textContent = results.length;
    if (totalEl) totalEl.textContent = UNI.length;

    if (!results.length) {
        list.innerHTML = '';
        if (noRes) noRes.style.display = 'block';
        renderCmpPagination(1, 1);
    } else {
        if (noRes) noRes.style.display = 'none';
        list.innerHTML = pageResults.map(function(u, i) { return buildDetailCard(u, start + i + 1); }).join('');
        attachSave(list);
        list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        renderCmpPagination(cmpPage, totalPages);
    }
}
renderCompare();

['cmpSearch','fCity','fField','fType','fTuition','cmpSort'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', renderCompare);
    document.getElementById(id).addEventListener('change', renderCompare);
});
document.getElementById('cmpClear').addEventListener('click', function() {
    ['cmpSearch','fCity','fField','fType','fTuition'].forEach(function(id) {
        document.getElementById(id).value = '';
    });
    document.getElementById('cmpSort').value = 'tuition-asc';
    setBudgetMode(false);
    cmpPage = 1;
    renderCompare();
});

document.getElementById('budgetFilterBtn').addEventListener('click', function() {
    setBudgetMode(!budgetFilterOn);
});

(function() {
    var overlay  = document.getElementById('compareModalOverlay');
    var closeBtn = document.getElementById('compareModalClose');
    var openBtn  = document.getElementById('openCompareModal');
    if (!overlay) return;

    function openCompareModal() {
        if (typeof cmpInitCountrySelectors === 'function') cmpInitCountrySelectors();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeCompareModal() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    if (openBtn)  openBtn.addEventListener('click', openCompareModal);
    if (closeBtn) closeBtn.addEventListener('click', closeCompareModal);
    var savedCmpBtn = document.getElementById('savedCompareBtn');
    if (savedCmpBtn) savedCmpBtn.addEventListener('click', openCompareModal);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeCompareModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && overlay.classList.contains('open')) closeCompareModal();
    });
}());

var uniDetailOverlay = document.getElementById('uniDetailOverlay');
document.getElementById('uniDetailClose').addEventListener('click', function() { uniDetailOverlay.classList.remove('open'); });
uniDetailOverlay.addEventListener('click', function(e) { if (e.target === uniDetailOverlay) uniDetailOverlay.classList.remove('open'); });

function tuitionMinCost(u) {
    if (u.tuition && typeof u.tuition === 'string') {
        var clean = u.tuition.replace(/[,\s]/g, '');
        var m = clean.match(/\d+/);
        if (m) return parseInt(m[0]);
    }
    return TS_COST[u.ts] || 0;
}

function uniTuitionLabel(u) {
    if (typeof u.tuition === 'string' && u.tuition.length > 1) return u.tuition;
    var cost = TS_COST[u.ts];
    return cost ? '~€' + cost.toLocaleString() + '/yr' : '—';
}
function uniIsPublic(u) { return (u.type || '').toLowerCase() === 'public'; }
function uniTypeLabel(u) { var t = u.type || ''; return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); }

var currentUdmId = null;
function showUniDetail(u) {
    currentUdmId = u.id;
    var on = getSaved().indexOf(u.id) !== -1;

    var accentEl = document.getElementById('udmAccent');
    if (accentEl) accentEl.style.background = 'linear-gradient(90deg,' + u.color + ' 0%, transparent 100%)';

    document.getElementById('udmBadge').textContent = u.abbr;
    document.getElementById('udmBadge').style.background = u.color;
    document.getElementById('udmName').textContent = u.name;
    var tc = uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv';
    document.getElementById('udmTags').innerHTML =
        '<span class="mp__badge mp__badge--city"><i class="fa-solid fa-location-dot" style="font-size:7px;margin-right:3px"></i>' + u.city + '</span>' +
        '<span class="mp__badge ' + tc + '">' + u.type + '</span>';

    document.getElementById('udmFounded').textContent  = u.founded  ? 'Est. ' + u.founded  : '—';
    document.getElementById('udmStudents').textContent = u.students || '—';
    document.getElementById('udmType').textContent     = u.type;
    document.getElementById('udmCity').textContent     = u.city;

    var matchEl = document.getElementById('udmBudgetMatch');
    if (matchEl) {
        if (budgetFilterOn) {
            var uCost = tuitionMinCost(u);
            var prof  = getProfile();
            var fits  = uCost <= prof.budget;
            matchEl.style.display = '';
            matchEl.className = 'udm__budget__match udm__budget__match--' + (fits ? 'ok' : 'over');
            matchEl.innerHTML = fits
                ? '<i class="fa-solid fa-circle-check"></i> Within your <strong>€' + prof.budget.toLocaleString() + '/yr</strong> budget'
                : '<i class="fa-solid fa-circle-xmark"></i> Exceeds your <strong>€' + prof.budget.toLocaleString() + '/yr</strong> budget — min. tuition ~€' + uCost.toLocaleString() + '/yr';
        } else {
            matchEl.style.display = 'none';
        }
    }

    document.getElementById('udmDesc').textContent = u.desc || '';
    document.getElementById('udmFields').innerHTML = (u.fields || []).map(function(f){ return '<span class="udm__chip">' + f + '</span>'; }).join('');
    document.getElementById('udmLangs').innerHTML  = (u.langs || []).map(function(l){ return '<span class="udm__chip udm__chip--lang">' + l + '</span>'; }).join('');
    document.getElementById('udmTuition').textContent = uniTuitionLabel(u);
    document.getElementById('udmDiff').textContent    = u.dl || DIFF_LABELS[u.diff] || '—';
    document.getElementById('udmTuitionBar').className = 'mp__bar__fill mp__bar--' + (u.ts || 0);
    document.getElementById('udmDiffBar').className    = 'mp__bar__fill mp__bar--' + (u.diff || 0);

    var insights = [];
    var TUITION_NOTES = {
        1: { icon: 'fa-solid fa-piggy-bank', text: 'Very affordable tuition — excellent value, especially for EU students' },
        2: { icon: 'fa-solid fa-piggy-bank', text: 'Budget-friendly fees — good quality at reasonable cost' },
        3: { icon: 'fa-solid fa-coins',      text: 'Mid-range tuition — typical for established private institutions' },
        4: { icon: 'fa-solid fa-coins',      text: 'Premium fees — investment in a globally recognised degree' },
        5: { icon: 'fa-solid fa-gem',        text: 'Elite private tuition — among the most expensive institutions' }
    };
    var DIFF_NOTES = {
        1: { icon: 'fa-solid fa-door-open',  text: 'Open entry — accessible to most applicants with standard qualifications' },
        2: { icon: 'fa-solid fa-door-open',  text: 'Low competition — a solid application is usually sufficient' },
        3: { icon: 'fa-solid fa-fire-flame-curved', text: 'Competitive — strong academic record and motivation letter recommended' },
        4: { icon: 'fa-solid fa-fire-flame-curved', text: 'Highly selective — top grades and extracurriculars make a difference' },
        5: { icon: 'fa-solid fa-crown',      text: 'Elite selective — very low acceptance rate; prepare a standout application' }
    };
    if (TUITION_NOTES[u.ts])   insights.push(TUITION_NOTES[u.ts]);
    if (DIFF_NOTES[u.diff])    insights.push(DIFF_NOTES[u.diff]);
    if (u.langs && u.langs.some(function(l){ return l === 'English' || l === 'Bilingual'; })) {
        insights.push({ icon: 'fa-solid fa-earth-europe', text: 'English-taught programmes available — great for international applicants' });
    }
    if (u.founded && u.founded < 1500) {
        insights.push({ icon: 'fa-solid fa-landmark', text: 'Founded in ' + u.founded + ' — one of the oldest universities in Europe' });
    } else if (u.founded && u.founded < 1800) {
        insights.push({ icon: 'fa-solid fa-landmark', text: 'Over 200 years of academic heritage — established ' + u.founded });
    }
    if (uniIsPublic(u)) {
        insights.push({ icon: 'fa-solid fa-building-columns', text: 'State-funded — regulated tuition and guaranteed academic standards' });
    } else {
        insights.push({ icon: 'fa-solid fa-building', text: 'Private institution — often smaller classes and industry-focused programmes' });
    }
    var insEl = document.getElementById('udmInsights');
    if (insEl) {
        insEl.innerHTML = insights.slice(0, 4).map(function(ins) {
            return '<div class="udm__insight"><i class="' + ins.icon + '"></i><span>' + ins.text + '</span></div>';
        }).join('');
    }

    var researchEl = document.getElementById('udmResearch');
    if (researchEl) {
        researchEl.href = u.website
            ? u.website
            : 'https://www.google.com/search?q=' + encodeURIComponent(u.name + ' official website admissions');
    }

    var saveBtn = document.getElementById('udmSave');
    saveBtn.innerHTML = '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>';
    saveBtn.style.color = on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)';
    uniDetailOverlay.classList.add('open');
}
document.getElementById('udmSave').addEventListener('click', function() {
    var saved = getSaved();
    var idx = saved.indexOf(currentUdmId);
    if (idx === -1) saved.push(currentUdmId); else saved.splice(idx, 1);
    setSaved(saved);
    var on = saved.indexOf(currentUdmId) !== -1;
    var saveBtn = document.getElementById('udmSave');
    saveBtn.innerHTML = '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>';
    saveBtn.style.color = on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)';
    document.querySelectorAll('.mp__save__btn[data-id="' + currentUdmId + '"]').forEach(function(b) {
        b.style.color = on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)';
        b.querySelector('i').className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark';
    });
    renderSaved(); updateStats();
});

document.getElementById('udmAddCompare').addEventListener('click', function() {
    var u = UNI.find(function(x){ return x.id === currentUdmId; });
    if (!u) return;
    uniDetailOverlay.classList.remove('open');
    var overlay = document.getElementById('compareModalOverlay');
    if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
    if (typeof cmpInitCountrySelectors === 'function') cmpInitCountrySelectors();
    // This university belongs to the currently selected country — point slot A there
    if (typeof cmpSetSlotCountry === 'function' && typeof currentCountryCode !== 'undefined') {
        cmpSetSlotCountry('A', currentCountryCode);
    }
    var inputA = document.getElementById('cmpSearchA');
    if (inputA) {
        inputA.value = u.name;
        inputA.dispatchEvent(new Event('input'));
        setTimeout(function() {
            var firstResult = document.querySelector('#cmpResultsA .cmp__vs__item');
            if (firstResult) firstResult.click();
        }, 200);
    }
});

document.getElementById('udmTrackApp').addEventListener('click', function() {
    var saved = getSaved();
    if (saved.indexOf(currentUdmId) === -1) {
        saved.push(currentUdmId);
        setSaved(saved);
        renderSaved(); updateStats();
    }
    uniDetailOverlay.classList.remove('open');
    showTab('tracker');
});

var UCH_KEY = 'uniscout_chat_v1';
var uchCurrentUniId   = null;
var uchCurrentUniName = null;
var uchCurrentColor   = '#d97c14';
var uchMode           = 'uni';
var uchCurrentDmId    = null;
var uchCurrentDmName  = null;

var FRIENDS_KEY = 'us_friends_' + user.id;
var FR_SENT_KEY = 'us_fr_sent_'  + user.id;
var FR_RECV_KEY = 'us_fr_recv_'  + user.id;
var DM_KEY      = 'us_dm_'       + user.id;

var FRD_STATUS_LABELS = {
    highschool: '🏫 High School Student', gap: '🌏 Gap Year', undergrad: '📖 Undergraduate',
    transfer: '🔄 Transfer Student', masters: '🎓 Master\'s Applicant',
    phd: '🔬 PhD / Researcher', professional: '💼 Working Professional', parent: '👨‍👧 Parent'
};
var FRD_LANG_LABELS = {
    en: '🇬🇧 English', es: '🇪🇸 Español', fr: '🇫🇷 Français',
    de: '🇩🇪 Deutsch', it: '🇮🇹 Italiano', pt: '🇵🇹 Português',
    uk: '🇺🇦 Українська', pl: '🇵🇱 Polski'
};

function frdAvaColor(name) {
    var palette = ['#e74c3c','#e67e22','#f1c40f','#27ae60','#1abc9c','#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'];
    var h = 0;
    for (var i = 0; i < (name || '').length; i++) h = (h * 31 + (name.charCodeAt(i))) | 0;
    return palette[Math.abs(h) % palette.length];
}

function isFriendOnline(friendId) {
    var lastSeen = parseInt(localStorage.getItem('us_lastseen_' + friendId) || '0');
    return (Date.now() - lastSeen) < 5 * 60 * 1000;
}

function getFriends()   { try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); }  catch(e){ return []; } }
function setFriends(d)  { localStorage.setItem(FRIENDS_KEY, JSON.stringify(d)); }
function getFrSent()    { try { return JSON.parse(localStorage.getItem(FR_SENT_KEY) || '[]'); }  catch(e){ return []; } }
function setFrSent(d)   { localStorage.setItem(FR_SENT_KEY, JSON.stringify(d)); }
function getFrRecv()    { try { return JSON.parse(localStorage.getItem(FR_RECV_KEY) || '[]'); }  catch(e){ return []; } }
function setFrRecv(d)   { localStorage.setItem(FR_RECV_KEY, JSON.stringify(d)); }
function getDMs()       { try { return JSON.parse(localStorage.getItem(DM_KEY) || '{}'); }       catch(e){ return {}; } }
function saveDMs(d)     { localStorage.setItem(DM_KEY, JSON.stringify(d)); }

function sendFriendRequest(toId) {
    var sent = getFrSent();
    if (sent.indexOf(toId) !== -1) return;
    sent.push(toId);
    setFrSent(sent);
    var recvKey = 'us_fr_recv_' + toId;
    var recv = [];
    try { recv = JSON.parse(localStorage.getItem(recvKey) || '[]'); } catch(e){}
    if (!recv.find(function(r){ return r.fromId === user.id; })) {
        var prof = getProfile();
        recv.push({ fromId: user.id, fromUsername: user.username, fromAvatar: prof.avatar || null, ts: Date.now() });
        localStorage.setItem(recvKey, JSON.stringify(recv));
    }
}

function acceptFriendRequest(fromId, fromUsername, fromAvatar) {
    var friends = getFriends();
    if (!friends.find(function(f){ return f.id === fromId; })) {
        friends.push({ id: fromId, username: fromUsername, avatar: fromAvatar || null, online: false, addedAt: Date.now() });
        setFriends(friends);
    }
    var theirFrKey = 'us_friends_' + fromId;
    var theirFr = [];
    try { theirFr = JSON.parse(localStorage.getItem(theirFrKey) || '[]'); } catch(e){}
    if (!theirFr.find(function(f){ return f.id === user.id; })) {
        var prof = getProfile();
        theirFr.push({ id: user.id, username: user.username, avatar: prof.avatar || null, online: false, addedAt: Date.now() });
        localStorage.setItem(theirFrKey, JSON.stringify(theirFr));
    }
    setFrRecv(getFrRecv().filter(function(r){ return r.fromId !== fromId; }));
    var theirSentKey = 'us_fr_sent_' + fromId;
    try {
        var ts = JSON.parse(localStorage.getItem(theirSentKey) || '[]').filter(function(id){ return id !== user.id; });
        localStorage.setItem(theirSentKey, JSON.stringify(ts));
    } catch(e){}
}

function declineFriendRequest(fromId) {
    setFrRecv(getFrRecv().filter(function(r){ return r.fromId !== fromId; }));
}

function updateFriendStats() {
    var fEl = document.getElementById('heroCountFriends');
    var oEl = document.getElementById('heroCountOnline');
    var friends = getFriends();
    if (fEl) fEl.textContent = friends.length;
    if (oEl) oEl.textContent = friends.filter(function(f){ return isFriendOnline(f.id); }).length;
}

var UCH_SEED = {
    ucm:  [
        { id:'s1', author:'Sofia M.',   initials:'SM', color:'#e74c3c', text:'I just got accepted to UCM for Law! The process was long but worth it. Happy to help anyone with the application.', ts: Date.now()-86400000*5 },
        { id:'s2', author:'Carlos R.',  initials:'CR', color:'#2980b9', text:'UCM is incredible for medicine. The campus is huge and the clinical placements start early. Highly recommend.', ts: Date.now()-86400000*3 },
        { id:'s3', author:'Ana L.',     initials:'AL', color:'#27ae60', text:'Cost of living in Madrid is manageable if you live in shared flat. I pay €350/month for my room in Moncloa.', ts: Date.now()-86400000 }
    ],
    ucl:  [
        { id:'s1', author:'Priya S.',   initials:'PS', color:'#9b59b6', text:'UCL\'s location in Bloomsbury is unbeatable. British Museum literally next door. Worth every penny.', ts: Date.now()-86400000*7 },
        { id:'s2', author:'Tom B.',     initials:'TB', color:'#1565c0', text:'Warning: accommodation is extremely competitive. Apply for halls on the day you get your offer letter — not a day later.', ts: Date.now()-86400000*2 }
    ],
    eth:  [
        { id:'s1', author:'Markus L.',  initials:'ML', color:'#1565c0', text:'ETH is the hardest I\'ve ever worked but also the most rewarding. The research environment is extraordinary.', ts: Date.now()-86400000*4 },
        { id:'s2', author:'Yuki T.',    initials:'YT', color:'#e74c3c', text:'Get the half-price SBB rail card (Halbtax) immediately — saves 50% on all Swiss train travel. Essential.', ts: Date.now()-86400000*1 }
    ],
    knu:  [
        { id:'s1', author:'Olena K.',   initials:'OK', color:'#003087', text:'KNU has incredible history. Studying here means something special right now. The student community is incredibly close.', ts: Date.now()-86400000*3 },
        { id:'s2', author:'Ivan H.',    initials:'IH', color:'#f9d71c', text:'Learn Ukrainian before you come — you\'ll get so much more out of the experience and people will embrace you.', ts: Date.now()-86400000*1 }
    ]
};

function uchGetChats() {
    try { return JSON.parse(localStorage.getItem(UCH_KEY)) || {}; }
    catch(e) { return {}; }
}
function uchSaveChats(chats) { localStorage.setItem(UCH_KEY, JSON.stringify(chats)); }

function uchGetMessages(uniId) {
    var chats = uchGetChats();
    if (!chats[uniId]) {
        chats[uniId] = (UCH_SEED[uniId] || []).slice();
        uchSaveChats(chats);
    }
    return chats[uniId];
}

function uchAddMessage(uniId, text) {
    var chats = uchGetChats();
    if (!chats[uniId]) chats[uniId] = (UCH_SEED[uniId] || []).slice();
    var me = user || { username: 'Student' };
    var name = me.username || 'Student';
    var words = name.trim().split(/\s+/);
    var initials = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
    chats[uniId].push({ id: 'u' + Date.now(), author: name, initials: initials, color: 'var(--orange)', text: text, ts: Date.now(), own: true });
    uchSaveChats(chats);
}

function uchFormatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
    return d.toLocaleDateString('en-GB', {day:'numeric', month:'short'});
}

function uchFormatMsgTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    return d.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) + ' ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
}

function uchBuildAvatarHtml(m, isOwn) {
    if (isOwn) {
        var prof = getProfile();
        if (prof && prof.avatar) {
            return '<div class="uch__avatar uch__avatar--photo"><img src="' + prof.avatar + '" alt="me"></div>';
        }
        return '<div class="uch__avatar" style="background:linear-gradient(135deg,var(--orange),var(--orange2))">' + (m.initials || 'ME') + '</div>';
    }
    return '<div class="uch__avatar" style="background:' + (m.color || '#888') + '">' + (m.initials || '?') + '</div>';
}

function uchRenderMessages(uniId) {
    var msgs = uchGetMessages(uniId);
    var box = document.getElementById('uchMessages');
    if (!box) return;
    if (!msgs.length) {
        var uName = uchCurrentUniName || 'this university';
        box.innerHTML = '<div class="uch__empty">' +
            '<div class="uch__empty__art">' +
                '<div class="uch__empty__ring"></div>' +
                '<div class="uch__empty__icon__wrap">' +
                    '<i class="fa-solid fa-graduation-cap uch__empty__icon--main"></i>' +
                '</div>' +
                '<div class="uch__empty__dot uch__empty__dot--1"><i class="fa-solid fa-star"></i></div>' +
                '<div class="uch__empty__dot uch__empty__dot--2"><i class="fa-regular fa-comment-dots"></i></div>' +
                '<div class="uch__empty__dot uch__empty__dot--3"><i class="fa-solid fa-paper-plane"></i></div>' +
            '</div>' +
            '<div class="uch__empty__title">You can start this conversation,<br>you know?</div>' +
            '<p class="uch__empty__sub">Be the first to share your experience, tips, or questions with fellow students exploring <strong>' + uName + '</strong>.</p>' +
        '</div>';
        return;
    }
    var html = '';
    var lastDate = null;
    msgs.forEach(function(m, i) {
        var d = new Date(m.ts);
        var dateStr = d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
        if (dateStr !== lastDate) {
            html += '<div class="uch__date__divider">' + dateStr + '</div>';
            lastDate = dateStr;
        }
        var isOwn = m.own === true;
        html += '<div class="uch__msg' + (isOwn ? ' uch__msg--own' : '') + '" style="animation-delay:' + (i * 0.04) + 's">' +
            uchBuildAvatarHtml(m, isOwn) +
            '<div class="uch__bubble">' +
                (!isOwn ? '<div class="uch__author">' + m.author + '</div>' : '') +
                '<div class="uch__text">' + m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
                '<div class="uch__bubble__foot"><span class="uch__time">' + uchFormatMsgTime(m.ts) + '</span></div>' +
            '</div>' +
        '</div>';
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
}

function uchRenderSidebar(filter) {
    var list = document.getElementById('uchSbList');
    if (!list) return;
    var q = (filter || '').trim().toLowerCase();
    var chats = uchGetChats();
    var dms = getDMs();
    var saved = getSaved();
    var allUnis = typeof UNI !== 'undefined' ? UNI : [];
    var savedUnis = allUnis.filter(function(u){ return saved.indexOf(u.id) !== -1; });
    var uniFiltered = q ? savedUnis.filter(function(u){ return u.name.toLowerCase().indexOf(q) !== -1; }) : savedUnis;
    var friends = getFriends();
    var frFiltered = q ? friends.filter(function(f){ return f.username.toLowerCase().indexOf(q) !== -1; }) : friends;

    var html = '';

    if (uniFiltered.length) {
        html += '<div class="uch__sb__section"><i class="fa-solid fa-building-columns"></i> Universities</div>';
        uniFiltered.forEach(function(u) {
            var msgs = chats[u.id] || (UCH_SEED[u.id] || []);
            var last = msgs.length ? msgs[msgs.length - 1] : null;
            var preview = last ? last.text.slice(0, 44) + (last.text.length > 44 ? '…' : '') : 'No messages yet';
            var timeStr = last ? uchFormatTime(last.ts) : '';
            var isActive = (uchMode === 'uni' && u.id === uchCurrentUniId) ? ' uch__contact--active' : '';
            var abbr = (u.abbr || u.id.toUpperCase()).slice(0,3);
            html += '<div class="uch__contact' + isActive + '" data-uid="' + u.id + '">' +
                '<div class="uch__contact__badge" style="background:' + (u.color || '#888') + '">' + abbr + '</div>' +
                '<div class="uch__contact__info">' +
                    '<div class="uch__contact__name">' + u.name + '</div>' +
                    '<div class="uch__contact__preview">' + preview.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
                '</div>' +
                (timeStr ? '<div class="uch__contact__time">' + timeStr + '</div>' : '') +
            '</div>';
        });
    } else if (!q) {
        html += '<div class="uch__sb__empty" style="padding:16px 14px 4px"><i class="fa-regular fa-bookmark" style="display:block;font-size:18px;margin-bottom:6px;opacity:.4"></i>Save a university to chat with its community</div>';
    }

    if (frFiltered.length) {
        html += '<div class="uch__sb__section"><i class="fa-solid fa-user-group"></i> Direct Messages</div>';
        frFiltered.forEach(function(f) {
            var msgs = dms[f.id] || [];
            var last = msgs.length ? msgs[msgs.length - 1] : null;
            var preview = last ? last.text.slice(0, 44) + (last.text.length > 44 ? '…' : '') : 'Say hello!';
            var timeStr = last ? uchFormatTime(last.ts) : '';
            var isActive = (uchMode === 'dm' && f.id === uchCurrentDmId) ? ' uch__contact--active' : '';
            var avInner = f.avatar ? '<img src="' + f.avatar + '" class="uch__contact__badge__img">' : f.username.slice(0,2).toUpperCase();
            html += '<div class="uch__contact uch__contact--dm' + isActive + '" data-fid="' + f.id + '">' +
                '<div class="uch__contact__badge__wrap">' +
                    '<div class="uch__contact__badge" style="background:' + (f.avatar ? 'transparent' : '#6c63ff') + '">' + avInner + '</div>' +
                    (isFriendOnline(f.id) ? '<span class="uch__contact__online"></span>' : '') +
                '</div>' +
                '<div class="uch__contact__info">' +
                    '<div class="uch__contact__name">' + f.username + '</div>' +
                    '<div class="uch__contact__preview">' + preview.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
                '</div>' +
                (timeStr ? '<div class="uch__contact__time">' + timeStr + '</div>' : '') +
            '</div>';
        });
    } else if (friends.length && q) {
        html += '<div class="uch__sb__empty" style="padding:8px 14px">No friends match</div>';
    } else if (!friends.length && !q) {
        html += '<div class="uch__sb__section"><i class="fa-solid fa-user-group"></i> Direct Messages</div>';
        html += '<div class="uch__sb__empty" style="padding:8px 14px">Add friends to start messaging</div>';
    }

    if (!html) html = '<div class="uch__sb__empty">Nothing found</div>';
    list.innerHTML = html;

    list.querySelectorAll('.uch__contact:not(.uch__contact--dm)').forEach(function(el) {
        el.addEventListener('click', function() {
            var u = allUnis.find(function(x){ return x.id === el.dataset.uid; });
            if (u) {
                openUniChat(u.id, u.name, u.color);
                var shell = document.getElementById('uchShell');
                if (shell && window.innerWidth <= 600) shell.classList.remove('sidebar-open');
            }
        });
    });
    list.querySelectorAll('.uch__contact--dm').forEach(function(el) {
        el.addEventListener('click', function() {
            var f = friends.find(function(x){ return x.id === el.dataset.fid; });
            if (f) {
                openDmChat(f.id, f.username, f.avatar || null);
                var shell = document.getElementById('uchShell');
                if (shell && window.innerWidth <= 600) shell.classList.remove('sidebar-open');
            }
        });
    });
}

function openUniChat(uniId, uniName, color) {
    uchCurrentUniId   = uniId;
    uchCurrentUniName = uniName;
    uchCurrentColor   = color || '#d97c14';

    var badge = document.getElementById('uchBadge');
    var nameEl = document.getElementById('uchName');
    var sub = document.getElementById('uchSub');
    var myAv = document.getElementById('uchMyAvatar');

    var uniData = typeof UNI !== 'undefined' ? UNI.find(function(x){ return x.id === uniId; }) : null;
    if (badge) { badge.textContent = ((uniData && uniData.abbr) ? uniData.abbr : uniId.toUpperCase()).slice(0,3); badge.style.background = uchCurrentColor; }
    if (nameEl) nameEl.textContent = uniName;
    if (sub) sub.textContent = 'Student community · ' + uchGetMessages(uniId).length + ' messages';

    if (myAv) {
        var prof = getProfile();
        if (prof && prof.avatar) {
            myAv.innerHTML = '<img src="' + prof.avatar + '" alt="me" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
            myAv.style.background = 'none';
        } else if (user) {
            var words = (user.username || 'S').trim().split(/\s+/);
            myAv.textContent = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
            myAv.style.background = '';
        }
    }

    uchMode = 'uni';
    uchCurrentDmId = null;
    uchCurrentDmName = null;

    uchRenderMessages(uniId);
    uchRenderSidebar(document.getElementById('uchSbSearch') ? document.getElementById('uchSbSearch').value : '');

    var input = document.getElementById('uchInput');
    if (input) { input.value = ''; input.placeholder = 'Write a message to the community…'; }

    document.getElementById('uniChatOverlay').classList.add('open');
    uniDetailOverlay.classList.remove('open');
}

function openDmChat(friendId, friendName, friendAvatar) {
    uchMode = 'dm';
    uchCurrentDmId    = friendId;
    uchCurrentDmName  = friendName;
    uchCurrentUniId   = null;
    uchCurrentUniName = null;

    var badge  = document.getElementById('uchBadge');
    var nameEl = document.getElementById('uchName');
    var sub    = document.getElementById('uchSub');
    var myAv   = document.getElementById('uchMyAvatar');

    if (badge) {
        if (friendAvatar) {
            badge.innerHTML = '<img src="' + friendAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">';
            badge.style.background = 'none';
        } else {
            badge.textContent = (friendName || 'U').slice(0,2).toUpperCase();
            badge.style.background = '#6c63ff';
        }
    }
    if (nameEl) nameEl.textContent = friendName;
    if (sub) sub.textContent = 'Direct message';

    if (myAv) {
        var prof = getProfile();
        if (prof && prof.avatar) {
            myAv.innerHTML = '<img src="' + prof.avatar + '" alt="me" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
            myAv.style.background = 'none';
        } else if (user) {
            var words = (user.username || 'S').trim().split(/\s+/);
            myAv.textContent = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
            myAv.style.background = '';
        }
    }

    uchRenderDm(friendId);
    uchRenderSidebar(document.getElementById('uchSbSearch') ? document.getElementById('uchSbSearch').value : '');

    var input = document.getElementById('uchInput');
    if (input) { input.value = ''; input.placeholder = 'Message ' + friendName + '…'; }

    document.getElementById('uniChatOverlay').classList.add('open');
}

function uchRenderDm(friendId) {
    var msgs = getDMs()[friendId] || [];
    var box  = document.getElementById('uchMessages');
    if (!box) return;
    if (!msgs.length) {
        var fn = uchCurrentDmName || 'your friend';
        box.innerHTML = '<div class="uch__empty">' +
            '<div class="uch__empty__art">' +
                '<div class="uch__empty__ring"></div>' +
                '<div class="uch__empty__icon__wrap" style="background:linear-gradient(135deg,#6c63ff,#a78bfa)">' +
                    '<i class="fa-solid fa-comment-dots uch__empty__icon--main"></i>' +
                '</div>' +
                '<div class="uch__empty__dot uch__empty__dot--1"><i class="fa-solid fa-heart"></i></div>' +
                '<div class="uch__empty__dot uch__empty__dot--2"><i class="fa-solid fa-face-smile"></i></div>' +
                '<div class="uch__empty__dot uch__empty__dot--3"><i class="fa-solid fa-paper-plane"></i></div>' +
            '</div>' +
            '<div class="uch__empty__title">Start chatting with<br><strong>' + fn + '</strong></div>' +
            '<p class="uch__empty__sub">Send the first message — every great friendship starts with a hello.</p>' +
        '</div>';
        return;
    }
    var html = '';
    var lastDate = null;
    msgs.forEach(function(m, i) {
        var d = new Date(m.ts);
        var dateStr = d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
        if (dateStr !== lastDate) { html += '<div class="uch__date__divider">' + dateStr + '</div>'; lastDate = dateStr; }
        var isOwn = m.own === true;
        html += '<div class="uch__msg' + (isOwn ? ' uch__msg--own' : '') + '" style="animation-delay:' + (i * 0.04) + 's">' +
            uchBuildAvatarHtml(m, isOwn) +
            '<div class="uch__bubble">' +
                '<div class="uch__text">' + m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
                '<div class="uch__bubble__foot"><span class="uch__time">' + uchFormatMsgTime(m.ts) + '</span></div>' +
            '</div>' +
        '</div>';
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
}

function uchAddDmMessage(friendId, text) {
    var dms = getDMs();
    if (!dms[friendId]) dms[friendId] = [];
    var me = user || { username: 'Student' };
    var name = me.username || 'Student';
    var words = name.trim().split(/\s+/);
    var initials = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
    dms[friendId].push({ id: 'dm' + Date.now(), author: name, initials: initials, color: 'var(--orange)', text: text, ts: Date.now(), own: true });
    saveDMs(dms);
}

document.getElementById('udmOpenChat').addEventListener('click', function() {
    var u = UNI.find(function(x){ return x.id === currentUdmId; });
    if (u) openUniChat(u.id, u.name, u.color);
});

document.getElementById('uniChatClose').addEventListener('click', function() {
    document.getElementById('uniChatOverlay').classList.remove('open');
});
document.getElementById('uniChatOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
});
document.getElementById('uchBackBtn').addEventListener('click', function() {
    var shell = document.getElementById('uchShell');
    if (!shell) return;
    var isOpen = shell.classList.contains('sidebar-open');
    shell.classList.toggle('sidebar-open');
    if (!isOpen) uchRenderSidebar(document.getElementById('uchSbSearch') ? document.getElementById('uchSbSearch').value : '');
});
document.getElementById('uchSbSearch').addEventListener('input', function() {
    uchRenderSidebar(this.value);
});

document.getElementById('uchSend').addEventListener('click', function() {
    var input = document.getElementById('uchInput');
    var text = (input.value || '').trim();
    if (!text) return;
    if (uchMode === 'dm' && uchCurrentDmId) {
        uchAddDmMessage(uchCurrentDmId, text);
        input.value = '';
        uchRenderDm(uchCurrentDmId);
        uchRenderSidebar(document.getElementById('uchSbSearch') ? document.getElementById('uchSbSearch').value : '');
    } else if (uchMode === 'uni' && uchCurrentUniId) {
        uchAddMessage(uchCurrentUniId, text);
        input.value = '';
        var sub = document.getElementById('uchSub');
        if (sub) sub.textContent = 'Student community · ' + uchGetMessages(uchCurrentUniId).length + ' messages';
        uchRenderMessages(uchCurrentUniId);
    }
});
document.getElementById('uchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('uchSend').click();
});

function closeFriendsOverlay() {
    document.getElementById('friendsOverlay').classList.remove('open');
    var panel = document.querySelector('.frd__panel');
    if (panel) panel.classList.remove('show-profile');
}

function openFriendsOverlay() {
    renderFriendsList('');
    var si = document.getElementById('frdSearch');
    if (si) si.value = '';
    var panel = document.querySelector('.frd__panel');
    if (panel) panel.classList.remove('show-profile');
    document.getElementById('friendsOverlay').classList.add('open');
}

function updateFriendsBadge() {
    var badge = document.getElementById('hdrFriendsBadge');
    var dot   = document.getElementById('feedDot');
    var count = getFrRecv().length;
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
    if (dot && count > 0) dot.style.display = 'flex';
}

document.getElementById('hdrFriendsBtn').addEventListener('click', openFriendsOverlay);
document.getElementById('uchFriendsBtn').addEventListener('click', openFriendsOverlay);
document.getElementById('friendsClose').addEventListener('click', closeFriendsOverlay);
document.getElementById('friendsOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeFriendsOverlay();
});
document.getElementById('frdPvBack').addEventListener('click', function() {
    var panel = document.querySelector('.frd__panel');
    if (panel) panel.classList.remove('show-profile');
});
document.getElementById('frdSearch').addEventListener('input', function() {
    renderFriendsList(this.value);
});

function renderFriendsList(q) {
    var list = document.getElementById('frdList');
    if (!list) return;

    var friends  = getFriends();
    var sent     = getFrSent();
    var allUsers = [];
    try { allUsers = JSON.parse(localStorage.getItem('uniscout_users') || '[]'); } catch(e){}

    var ql = (q || '').trim().toLowerCase();

    var myFriends = ql
        ? friends.filter(function(f){ return (f.username || '').toLowerCase().indexOf(ql) !== -1; })
        : friends.slice();

    var others = allUsers.filter(function(u){
        return u.id !== user.id && !friends.find(function(f){ return f.id === u.id; });
    });
    if (ql) others = others.filter(function(u){ return (u.username || '').toLowerCase().indexOf(ql) !== -1; });

    var html = '';

    // ── Friends section ──────────────────────────────────────────
    if (myFriends.length) {
        html += '<div class="frd__section__hdr"><i class="fa-solid fa-user-check"></i> Friends <span class="frd__section__count">' + myFriends.length + '</span></div>';
        myFriends.forEach(function(f) {
            var lp     = {};
            try { lp = JSON.parse(localStorage.getItem('us_profile_' + f.id) || '{}'); } catch(e){}
            var avatar   = lp.avatar || f.avatar || null;
            var initials = (f.username || 'U').slice(0, 2).toUpperCase();
            var avHtml   = avatar ? '<img src="' + avatar + '" alt="">' : initials;
            var avStyle  = avatar ? '' : ' style="background:' + frdAvaColor(f.username) + '"';
            html += '<div class="frd__friend__card">' +
                '<div class="frd__friend__av"' + avStyle + '>' + avHtml + '</div>' +
                '<div class="frd__friend__info">' +
                    '<div class="frd__friend__name">' + (f.username || 'Friend') + '</div>' +
                    '<div class="frd__friend__tag"><i class="fa-solid fa-circle" style="color:' + (isFriendOnline(f.id) ? '#27ae60' : 'rgba(150,150,150,.4)') + ';font-size:7px"></i> ' + (isFriendOnline(f.id) ? 'Online' : 'Friend') + '</div>' +
                '</div>' +
                '<div class="frd__friend__actions">' +
                    '<button class="frd__friend__btn frd__friend__btn--msg" data-fid="' + f.id + '" data-fname="' + (f.username || '') + '" data-fav="' + (avatar || '') + '" title="Message"><i class="fa-solid fa-message"></i></button>' +
                    '<button class="frd__friend__btn frd__friend__btn--pro" data-fid="' + f.id + '" title="View profile"><i class="fa-solid fa-user"></i></button>' +
                '</div>' +
            '</div>';
        });
    }

    // ── Students / Add section ────────────────────────────────────
    var sepClass = myFriends.length ? ' frd__section__hdr--sep' : '';
    if (others.length || !myFriends.length) {
        html += '<div class="frd__section__hdr' + sepClass + '"><i class="fa-solid fa-users"></i> Students' +
            (others.length ? ' <span class="frd__section__count">' + others.length + '</span>' : '') +
        '</div>';
    }
    if (!others.length && !myFriends.length) {
        html += '<div class="frd__empty"><i class="fa-solid fa-user-slash"></i><span>No students found</span></div>';
    } else if (!others.length && myFriends.length) {
        /* all users are already friends — show nothing extra */
    } else {
        others.forEach(function(u) {
            var isPending = sent.indexOf(u.id) !== -1;
            var initials  = (u.username || 'U').slice(0, 2).toUpperCase();
            var avHtml    = '<span>' + initials + '</span>';
            var statusBtn = isPending
                ? '<button class="frd__btn frd__btn--pending" disabled><i class="fa-solid fa-clock"></i> Pending</button>'
                : '<button class="frd__btn frd__btn--add" data-uid="' + u.id + '"><i class="fa-solid fa-user-plus"></i> Add</button>';
            html += '<div class="frd__row">' +
                '<div class="frd__row__av" style="background:' + frdAvaColor(u.username) + '">' + avHtml + '</div>' +
                '<div class="frd__row__info"><div class="frd__row__name">' + (u.username || 'Student') + '</div></div>' +
                statusBtn +
            '</div>';
        });
    }

    list.innerHTML = html;

    // Message buttons
    list.querySelectorAll('.frd__friend__btn--msg').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var fid = this.dataset.fid, fname = this.dataset.fname, fav = this.dataset.fav || null;
            closeFriendsOverlay();
            openDmChat(fid, fname, fav);
        });
    });

    // Profile buttons
    list.querySelectorAll('.frd__friend__btn--pro').forEach(function(btn) {
        btn.addEventListener('click', function() { openFriendProfile(this.dataset.fid); });
    });

    // Add friend buttons
    list.querySelectorAll('.frd__btn--add').forEach(function(btn) {
        btn.addEventListener('click', function() {
            sendFriendRequest(this.dataset.uid);
            renderFriendsList(document.getElementById('frdSearch') ? document.getElementById('frdSearch').value : '');
        });
    });
}

function openFriendProfile(friendId) {
    var panel = document.querySelector('.frd__panel');
    var body  = document.getElementById('frdPvBody');
    if (!panel || !body) return;

    var friends  = getFriends();
    var friend   = friends.find(function(f){ return f.id === friendId; });
    var allUsers = [];
    try { allUsers = JSON.parse(localStorage.getItem('uniscout_users') || '[]'); } catch(e){}
    var userRec  = allUsers.find(function(u){ return u.id === friendId; });

    var username = (friend && friend.username) || (userRec && userRec.username) || 'Unknown';
    var lp = {};
    try { lp = JSON.parse(localStorage.getItem('us_profile_' + friendId) || '{}'); } catch(e){}
    var avatar   = lp.avatar || (friend && friend.avatar) || null;
    var initials = username.slice(0, 2).toUpperCase();
    var avHtml   = avatar ? '<img src="' + avatar + '" alt="">' : initials;
    var avStyle  = avatar ? '' : ' style="background:' + frdAvaColor(username) + '"';

    var statusLabel = FRD_STATUS_LABELS[lp.status] || '';
    var langLabel   = FRD_LANG_LABELS[lp.lang] || '';
    var online      = isFriendOnline(friendId);

    var joined = '';
    if (userRec && userRec.createdAt) {
        joined = new Date(userRec.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    var badges = '';
    if (statusLabel) badges += '<span class="frd__pv__badge">' + statusLabel + '</span>';
    if (langLabel)   badges += '<span class="frd__pv__badge"><i class="fa-solid fa-language"></i> ' + langLabel + '</span>';
    if (online)      badges += '<span class="frd__pv__badge" style="color:#27ae60;border-color:rgba(39,174,96,.3);background:rgba(39,174,96,.08)"><i class="fa-solid fa-circle" style="font-size:7px"></i> Online</span>';

    var fields = '';
    if (joined)     fields += '<div class="frd__pv__field"><div class="frd__pv__field__icon"><i class="fa-solid fa-calendar-days"></i></div><div><div class="frd__pv__field__lbl">Member since</div><div class="frd__pv__field__val">' + joined + '</div></div></div>';
    if (lp.budget)  fields += '<div class="frd__pv__field"><div class="frd__pv__field__icon"><i class="fa-solid fa-piggy-bank"></i></div><div><div class="frd__pv__field__lbl">Annual budget</div><div class="frd__pv__field__val">€' + Number(lp.budget).toLocaleString() + '/yr</div></div></div>';
    if (userRec && userRec.email) fields += '<div class="frd__pv__field"><div class="frd__pv__field__icon"><i class="fa-solid fa-envelope"></i></div><div><div class="frd__pv__field__lbl">Email</div><div class="frd__pv__field__val">' + (userRec.email) + '</div></div></div>';

    body.innerHTML =
        '<div class="frd__pv__hero">' +
            '<div class="frd__pv__av"' + avStyle + '>' + avHtml + '</div>' +
            '<div class="frd__pv__name">' + username + '</div>' +
            (badges ? '<div class="frd__pv__badges">' + badges + '</div>' : '') +
            '<button class="frd__pv__msg__btn" id="frdPvMsgBtn" data-fid="' + friendId + '" data-fname="' + username + '" data-fav="' + (avatar || '') + '">' +
                '<i class="fa-solid fa-message"></i> Message ' + username +
            '</button>' +
        '</div>' +
        (fields ? '<div class="frd__pv__fields">' + fields + '</div>' : '');

    var msgBtn = document.getElementById('frdPvMsgBtn');
    if (msgBtn) {
        msgBtn.addEventListener('click', function() {
            var fid = this.dataset.fid, fname = this.dataset.fname, fav = this.dataset.fav || null;
            closeFriendsOverlay();
            openDmChat(fid, fname, fav);
        });
    }

    panel.classList.add('show-profile');
}

function renderFriendRequests() {
    var section = document.getElementById('feedFrqSection');
    if (!section) return;
    var recv = getFrRecv();
    if (!recv.length) { section.style.display = 'none'; section.innerHTML = ''; return; }
    section.style.display = '';

    var html = '<div class="mp__feed__reqs__hdr">' +
        '<span class="mp__feed__reqs__label">Friend Requests</span>' +
        '<span class="mp__feed__reqs__count">' + recv.length + '</span>' +
    '</div>';

    recv.forEach(function(r) {
        var name     = (r.fromUsername || 'Unknown');
        var initials = name.slice(0, 2).toUpperCase();
        var avInner  = r.fromAvatar
            ? '<img src="' + r.fromAvatar + '" alt="">'
            : initials;
        html += '<div class="mp__feed__req__item">' +
            '<div class="mp__feed__req__av">' + avInner + '</div>' +
            '<div class="mp__feed__req__body">' +
                '<div class="mp__feed__req__name">' + name + '</div>' +
                '<div class="mp__feed__req__sub">wants to be friends</div>' +
                '<div class="mp__feed__req__time">' + uchFormatTime(r.ts) + '</div>' +
            '</div>' +
            '<div class="mp__feed__req__btns">' +
                '<button class="mp__feed__req__btn mp__feed__req__btn--ok" data-fid="' + r.fromId + '" data-fname="' + name + '" data-fav="' + (r.fromAvatar || '') + '" title="Accept"><i class="fa-solid fa-check"></i></button>' +
                '<button class="mp__feed__req__btn mp__feed__req__btn--no" data-fid="' + r.fromId + '" title="Decline"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
        '</div>';
    });

    section.innerHTML = html;

    section.querySelectorAll('.mp__feed__req__btn--ok').forEach(function(btn) {
        btn.addEventListener('click', function() {
            acceptFriendRequest(this.dataset.fid, this.dataset.fname, this.dataset.fav || null);
            renderFriendRequests();
            updateFriendStats();
            updateFriendsBadge();
            uchRenderSidebar('');
        });
    });
    section.querySelectorAll('.mp__feed__req__btn--no').forEach(function(btn) {
        btn.addEventListener('click', function() {
            declineFriendRequest(this.dataset.fid);
            renderFriendRequests();
            updateFriendsBadge();
        });
    });
}

function buildNsRow(u, q) {
    var hl = function(str) {
        if (!q) return str;
        var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
        return str.replace(re, '<mark>$1</mark>');
    };
    return '<div class="nsearch__row" style="--c:' + u.color + '" data-id="' + u.id + '">' +
        '<div class="nsearch__abbr" style="background:' + u.color + '">' + u.abbr + '</div>' +
        '<div class="nsearch__info">' +
            '<div class="nsearch__name">' + hl(u.name) + '</div>' +
            '<div class="nsearch__tags">' +
                '<span class="mp__badge mp__badge--city">' + u.city + '</span>' +
                '<span class="mp__badge ' + (uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv') + '">' + uniTypeLabel(u) + '</span>' +
                u.fields.slice(0,3).map(function(f){ return '<span class="mp__field__tag">'+f+'</span>'; }).join('') +
            '</div>' +
        '</div>' +
        '<div class="nsearch__metrics">' +
            '<div class="nsearch__metric"><span class="nsearch__ml">Tuition</span><span class="nsearch__mv">' + uniTuitionLabel(u) + '</span></div>' +
            '<div class="nsearch__metric"><span class="nsearch__ml">Difficulty</span><span class="nsearch__mv">' + (u.dl || '—') + '</span></div>' +
        '</div>' +
        '<i class="fa-solid fa-chevron-right" style="color:rgba(217,124,20,.35);font-size:10px;flex-shrink:0"></i>' +
    '</div>';
}

function attachNsClick(container) {
    container.querySelectorAll('.nsearch__row').forEach(function(row) {
        row.addEventListener('click', function() {
            var u = UNI.find(function(x){ return x.id === row.dataset.id; });
            if (u) showUniDetail(u);
        });
    });
}

var nsInput   = document.getElementById('nsInput');
var nsResults = document.getElementById('nsResults');
var expClear  = document.getElementById('expClear');
var nsPage    = 1;
var NS_PER_PAGE = 20;
var nsLastHits = [];

function renderNsPagination(current, total) {
    var existing = document.getElementById('nsPagination');
    if (existing) existing.remove();
    if (total <= 1) return;
    var pg = document.createElement('div');
    pg.id = 'nsPagination';
    pg.className = 'ba__pagination';
    var html = '<button class="ba__pg__btn" id="nsPrev"' + (current === 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';
    var sp = Math.max(1, current - 2), ep = Math.min(total, current + 2);
    if (sp > 1) html += '<span class="ba__pg__dots">…</span>';
    for (var p = sp; p <= ep; p++) {
        html += '<button class="ba__pg__num' + (p === current ? ' ba__pg__num--active' : '') + '" data-p="' + p + '">' + p + '</button>';
    }
    if (ep < total) html += '<span class="ba__pg__dots">…</span>';
    html += '<button class="ba__pg__btn" id="nsNext"' + (current === total ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>';
    pg.innerHTML = html;
    nsResults.after(pg);
    pg.querySelector('#nsPrev').addEventListener('click', function() { if (nsPage > 1) { nsPage--; renderNsPage(); } });
    pg.querySelector('#nsNext').addEventListener('click', function() { if (nsPage < total) { nsPage++; renderNsPage(); } });
    pg.querySelectorAll('.ba__pg__num').forEach(function(btn) {
        btn.addEventListener('click', function() { nsPage = parseInt(btn.dataset.p); renderNsPage(); });
    });
}

function renderNsPage() {
    var q = nsInput.value.trim();
    var total = Math.max(1, Math.ceil(nsLastHits.length / NS_PER_PAGE));
    nsPage = Math.min(nsPage, total);
    var start = (nsPage - 1) * NS_PER_PAGE;
    var pageHits = nsLastHits.slice(start, start + NS_PER_PAGE);
    nsResults.innerHTML = '<div class="exp__sr__count">' + nsLastHits.length + ' result' + (nsLastHits.length !== 1 ? 's' : '') + ' for <strong>"' + q + '"</strong></div>' +
        pageHits.map(function(u){ return buildNsRow(u, q.toLowerCase()); }).join('');
    attachNsClick(nsResults);
    renderNsPagination(nsPage, total);
}

function runHeroSearch() {
    var q = nsInput.value.trim().toLowerCase();
    expClear.style.display = q ? 'flex' : 'none';
    var existing = document.getElementById('nsPagination');
    if (existing) existing.remove();
    if (!q) {
        nsResults.style.display = 'none';
        document.getElementById('expDefaultContent').style.display = 'block';
        nsLastHits = []; nsPage = 1;
        return;
    }
    document.getElementById('expDefaultContent').style.display = 'none';
    var budgetLimit = budgetFilterOn ? getProfile().budget : Infinity;
    nsLastHits = UNI.filter(function(u) {
        if (budgetFilterOn && tuitionMinCost(u) > budgetLimit) return false;
        return (u.name + ' ' + u.city + ' ' + u.abbr + ' ' + u.fields.join(' ') + ' ' + u.langs.join(' ') + ' ' + u.type).toLowerCase().indexOf(q) !== -1;
    });
    nsResults.style.display = 'block';
    if (!nsLastHits.length) {
        nsResults.innerHTML = '<div class="exp__sr__empty"><i class="fa-solid fa-magnifying-glass-minus"></i><p>No universities match <strong>"' + nsInput.value + '"</strong></p><p class="exp__sr__tip">Try a city, field or abbreviation</p></div>';
        return;
    }
    nsPage = 1;
    renderNsPage();
}

nsInput.addEventListener('input', runHeroSearch);
expClear.addEventListener('click', function() {
    nsInput.value = '';
    runHeroSearch();
    nsInput.focus();
});

document.querySelectorAll('.exp__qt').forEach(function(btn) {
    btn.addEventListener('click', function() {
        nsInput.value = btn.dataset.q;
        runHeroSearch();
        nsInput.focus();
    });
});

document.querySelectorAll('.exp__city__card').forEach(function(card) {
    card.addEventListener('click', function() {
        var city = card.dataset.city;

        document.querySelectorAll('.exp__city__card').forEach(function(c){ c.classList.remove('active'); });
        card.classList.add('active');

        document.querySelectorAll('.exp__chip[data-ftype="city"]').forEach(function(c){ c.classList.remove('active'); });
        expActiveFilters.city = city;
        runChipFilter();
        var wxInp = document.getElementById('wxCityInput'); if (wxInp) wxInp.value = city;
        showCityInfo(city);
        fetchWeather(city);
        var lastBlock = document.querySelector('.exp__block:last-of-type'); if (lastBlock) lastBlock.scrollIntoView({ behavior:'smooth', block:'start' });
    });
});

var expActiveFilters = { field: '', lang: '', type: '', budget: '', city: '' };

document.querySelectorAll('.exp__chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
        var ftype = chip.dataset.ftype;
        var fval  = chip.dataset.fval;
        if (expActiveFilters[ftype] === fval) {
            expActiveFilters[ftype] = '';
            chip.classList.remove('active');
        } else {
            document.querySelectorAll('.exp__chip[data-ftype="' + ftype + '"]').forEach(function(c){ c.classList.remove('active'); });
            expActiveFilters[ftype] = fval;
            chip.classList.add('active');
        }
        runChipFilter();
    });
});

var _expChipResetBtn = document.getElementById('expChipReset');
if (_expChipResetBtn) {
    _expChipResetBtn.addEventListener('click', function() {
        expActiveFilters = { field: '', lang: '', type: '', budget: '', city: '' };
        document.querySelectorAll('.exp__chip').forEach(function(c){ c.classList.remove('active'); });
        document.querySelectorAll('.exp__city__card').forEach(function(c){ c.classList.remove('active'); });
        var ecr = document.getElementById('expChipResults');
        if (ecr) ecr.innerHTML = '';
        _expChipResetBtn.style.display = 'none';
    });
}

function runChipFilter() {
    var anyActive = Object.keys(expActiveFilters).some(function(k){ return expActiveFilters[k]; });
    var resetBtn = document.getElementById('expChipReset');
    if (resetBtn) resetBtn.style.display = anyActive ? 'flex' : 'none';

    var container = document.getElementById('expChipResults');
    if (!anyActive) {
        if (container) container.innerHTML = '';
        return;
    }

    var results = UNI.filter(function(u) {
        if (expActiveFilters.city   && u.city !== expActiveFilters.city)                 return false;
        if (expActiveFilters.type   && u.type !== expActiveFilters.type)                 return false;
        if (expActiveFilters.budget && u.ts   >  parseInt(expActiveFilters.budget))      return false;
        if (expActiveFilters.field  && u.fields.indexOf(expActiveFilters.field) === -1)  return false;
        if (expActiveFilters.lang   && u.langs.indexOf(expActiveFilters.lang)   === -1)  return false;
        return true;
    });

    if (!container) return;
    if (!results.length) {
        container.innerHTML = '<div class="exp__sr__empty"><i class="fa-solid fa-filter-circle-xmark"></i><p>No universities match these filters.</p><p class="exp__sr__tip">Try removing one of the filters above.</p></div>';
        return;
    }
    container.innerHTML = '<div class="exp__sr__count">' + results.length + ' universit' + (results.length !== 1 ? 'ies' : 'y') + ' match your filters</div>' +
        results.map(function(u){ return buildNsRow(u, ''); }).join('');
    attachNsClick(container);
}

var WX_KEY = 'a972a60b0971a99fcba59731943dcda6';
var WX_ICONS  = { Clear:'☀️', Clouds:'🌥️', Rain:'🌧️', Drizzle:'🌦️', Thunderstorm:'⛈️', Snow:'❄️', Mist:'🌫️', Haze:'🌫️', Fog:'🌫️' };
var WX_PHOTOS = { Clear:'sunny.jpeg', Clouds:'cloudy.jpeg', Rain:'Rainy.jpeg', Drizzle:'Rainy.jpeg', Thunderstorm:'Rainy.jpeg', Snow:'snow.jpeg', Mist:'cloudy.jpeg', Haze:'cloudy.jpeg', Fog:'cloudy.jpeg' };

var CITY_COORDS_MAP = {
    'Madrid':     { lat: 40.4168, lon: -3.7038 },
    'Barcelona':  { lat: 41.3851, lon:  2.1734 },
    'Valencia':   { lat: 39.4699, lon: -0.3763 },
    'Sevilla':    { lat: 37.3891, lon: -5.9845 },
    'Granada':    { lat: 37.1773, lon: -3.5986 },
    'Bilbao':     { lat: 43.2630, lon: -2.9350 },
    'Salamanca':  { lat: 40.9701, lon: -5.6635 },
    'London':     { lat: 51.5074, lon: -0.1278 },
    'Edinburgh':  { lat: 55.9533, lon: -3.1883 },
    'Manchester': { lat: 53.4808, lon: -2.2426 },
    'Oxford':     { lat: 51.7520, lon: -1.2577 },
    'Cambridge':  { lat: 52.2053, lon:  0.1218 },
    'Paris':      { lat: 48.8566, lon:  2.3522 },
    'Lyon':       { lat: 45.7640, lon:  4.8357 },
    'Berlin':     { lat: 52.5200, lon: 13.4050 },
    'Munich':     { lat: 48.1351, lon: 11.5820 },
    'Heidelberg': { lat: 49.3988, lon:  8.6724 },
    'Rome':       { lat: 41.9028, lon: 12.4964 },
    'Milan':      { lat: 45.4642, lon:  9.1900 },
    'Bologna':    { lat: 44.4949, lon: 11.3426 },
    'Lisbon':     { lat: 38.7223, lon: -9.1393 },
    'Porto':      { lat: 41.1579, lon: -8.6291 },
    'Zurich':     { lat: 47.3769, lon:  8.5417 },
    'Kyiv':       { lat: 50.4501, lon: 30.5234 }
};

function wmoGradient(code) {
    if (code === 0)  return 'linear-gradient(160deg,#1e6fa8,#2ec4a0)';
    if (code <= 2)   return 'linear-gradient(160deg,#2a6fa0,#4a9ac8)';
    if (code <= 3)   return 'linear-gradient(160deg,#3a5878,#6a8aaa)';
    if (code <= 48)  return 'linear-gradient(160deg,#4a5868,#8a9aaa)';
    if (code <= 55)  return 'linear-gradient(160deg,#2a5070,#5a88b0)';
    if (code <= 67)  return 'linear-gradient(160deg,#1a3a5a,#2a6090)';
    if (code <= 77)  return 'linear-gradient(160deg,#3a6a9a,#90c8f0)';
    if (code <= 82)  return 'linear-gradient(160deg,#1a3a58,#3a70a8)';
    return                  'linear-gradient(160deg,#1a1a3a,#4a3a70)';
}

function wmoEmoji(code) {
    if (code === 0)  return '☀️';
    if (code <= 2)   return '🌤️';
    if (code === 3)  return '☁️';
    if (code <= 48)  return '🌫️';
    if (code <= 55)  return '🌦️';
    if (code <= 67)  return '🌧️';
    if (code <= 77)  return '❄️';
    if (code <= 82)  return '🌨️';
    return                  '⛈️';
}

function wmoLabel(code) {
    if (code === 0)  return 'Clear sky';
    if (code <= 2)   return 'Partly cloudy';
    if (code === 3)  return 'Overcast';
    if (code <= 48)  return 'Foggy';
    if (code <= 55)  return 'Drizzle';
    if (code <= 67)  return 'Rain';
    if (code <= 77)  return 'Snow';
    if (code <= 82)  return 'Rain showers';
    return                  'Thunderstorm';
}

function wmoCardClass(code) {
    if (code === 0)  return 'cg2__fcard--sun';
    if (code <= 2)   return 'cg2__fcard--partly';
    if (code === 3)  return 'cg2__fcard--cloud';
    if (code <= 48)  return 'cg2__fcard--fog';
    if (code <= 55)  return 'cg2__fcard--drizzle';
    if (code <= 67)  return 'cg2__fcard--rain';
    if (code <= 77)  return 'cg2__fcard--snow';
    if (code <= 82)  return 'cg2__fcard--shower';
    return                  'cg2__fcard--storm';
}

function fetchCityForecast(cityName) {
    var coords = CITY_COORDS_MAP[cityName];
    var panel  = document.getElementById('cg2ForecastPanel');
    var wrap   = document.getElementById('cg2ForecastWrap');
    var btn    = document.getElementById('cg2ForecastBtn');
    if (!panel || !wrap) return;

    wrap.style.display = 'block';
    panel.innerHTML = '<div class="cg2__7day__skeleton"><div class="cg2__7day__sk__spin"></div><p>Loading live forecast…</p></div>';

    if (!coords) {
        panel.innerHTML = '<div class="cg2__7day__err"><i class="fa-solid fa-triangle-exclamation"></i><p>No forecast data for ' + cityName + '</p></div>';
        return;
    }

    var url = 'https://api.open-meteo.com/v1/forecast' +
        '?latitude=' + coords.lat + '&longitude=' + coords.lon +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
        '&timezone=auto&forecast_days=7';

    fetch(url)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
        var daily = data.daily;
        if (!daily || !daily.time) throw new Error('No daily data');

        var codes = daily.weather_code || daily.weathercode || [];
        var maxT  = daily.temperature_2m_max  || [];
        var minT  = daily.temperature_2m_min  || [];
        var precs = daily.precipitation_sum   || [];

        var todayCode  = codes[0] || 0;
        var todayEmoji = wmoEmoji(todayCode);
        var todayLabel = wmoLabel(todayCode);
        var todayHi    = Math.round(maxT[0] || 0);
        var todayLo    = Math.round(minT[0] || 0);

        var cardsHtml = daily.time.map(function(dateStr, i) {
            var code  = codes[i]  || 0;
            var hi    = Math.round(maxT[i]  || 0);
            var lo    = Math.round(minT[i]  || 0);
            var prec  = precs[i]  || 0;
            var emoji = wmoEmoji(code);
            var label = wmoLabel(code);
            var cls   = wmoCardClass(code);
            var dn    = i === 0 ? 'Today'
                       : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short' });
            var precHtml = prec > 0.1
                ? '<div class="cg2__fcard__prec"><i class="fa-solid fa-droplet"></i>' + prec.toFixed(1) + 'mm</div>'
                : '<div class="cg2__fcard__prec cg2__fcard__prec--none">—</div>';
            var todayCls = i === 0 ? ' cg2__fcard--today' : '';
            return '<div class="cg2__fcard ' + cls + todayCls + '">' +
                '<div class="cg2__fcard__day">' + dn + '</div>' +
                '<div class="cg2__fcard__icon">' + emoji + '</div>' +
                '<div class="cg2__fcard__cond">' + label + '</div>' +
                '<div class="cg2__fcard__hi">' + hi + '°</div>' +
                '<div class="cg2__fcard__lo">' + lo + '°</div>' +
                precHtml +
            '</div>';
        }).join('');

        panel.innerHTML =
            '<div class="cg2__7day__hdr">' +
                '<div class="cg2__7day__hdr__left">' +
                    '<div class="cg2__7day__hdr__city"><i class="fa-solid fa-location-dot"></i>' + cityName + '</div>' +
                    '<div class="cg2__7day__hdr__cond">' + todayEmoji + ' ' + todayLabel + '</div>' +
                '</div>' +
                '<div class="cg2__7day__hdr__temps">' +
                    '<span class="cg2__7day__hdr__hi">' + todayHi + '°</span>' +
                    '<span class="cg2__7day__hdr__lo">/ ' + todayLo + '°</span>' +
                '</div>' +
            '</div>' +
            '<div class="cg2__7day__grid">' + cardsHtml + '</div>';

        if (btn) {
            btn.classList.add('cg2__7day__btn--active');
            btn.querySelector('span').textContent = 'Hide Forecast';
        }
    })
    .catch(function() {
        panel.innerHTML = '<div class="cg2__7day__err">' +
            '<i class="fa-solid fa-triangle-exclamation"></i>' +
            '<p>Could not load forecast — check your connection</p>' +
        '</div>';
    });
}

var CG2_UNI_META = {};
fetch('data/uni_meta_es.json')
    .then(function(r) { return r.json(); })
    .then(function(d) { CG2_UNI_META = d; })
    .catch(function() { console.warn('uni_meta_es.json not found'); });

var cg2ActiveCity = null;

function cg2InitSliders() {
    var food = document.getElementById('cg2FoodSlider');
    var ent  = document.getElementById('cg2EntSlider');
    if (!food || !ent) return;
    food.addEventListener('input', function() {
        document.getElementById('cg2FoodVal').textContent = '\u20ac' + this.value;
        cg2CalcCost();
    });
    ent.addEventListener('input', function() {
        document.getElementById('cg2EntVal').textContent = '\u20ac' + this.value;
        cg2CalcCost();
    });
    document.querySelectorAll('input[name="cg2Acc"]').forEach(function(r) {
        r.addEventListener('change', cg2CalcCost);
    });
}

function cg2CalcCost() {
    if (!cg2ActiveCity) return;
    var d = CG2_DATA[cg2ActiveCity];
    var accRadio = document.querySelector('input[name="cg2Acc"]:checked');
    if (!accRadio) return;
    var acc   = d.accCosts[accRadio.value] || 0;
    var food  = parseInt(document.getElementById('cg2FoodSlider').value)  || 200;
    var ent   = parseInt(document.getElementById('cg2EntSlider').value)   || 100;
    var trans = d.transport || 40;
    var monthly = acc + food + ent + trans;
    var yearly  = monthly * 10;
    var aff;
    if      (monthly < 700)  aff = {label:'Very Affordable', color:'#27ae60'};
    else if (monthly < 1000) aff = {label:'Affordable',      color:'#2ecc71'};
    else if (monthly < 1300) aff = {label:'Moderate',        color:'#f39c12'};
    else if (monthly < 1600) aff = {label:'Expensive',       color:'#e67e22'};
    else                     aff = {label:'Very Expensive',  color:'#e74c3c'};
    document.getElementById('cg2CostMonthly').textContent = '\u20ac' + monthly.toLocaleString();
    document.getElementById('cg2CostYearly').textContent  = '\u20ac' + yearly.toLocaleString();
    document.getElementById('cg2CostAff').innerHTML       = '<span style="color:' + aff.color + ';font-weight:700">' + aff.label + '</span>';
    var items = [
        {label:'Accommodation', val:acc,   color:'#e74c3c'},
        {label:'Food',          val:food,  color:'#f39c12'},
        {label:'Entertainment', val:ent,   color:'#9b59b6'},
        {label:'Transport',     val:trans, color:'#3498db'}
    ];
    document.getElementById('cg2CostBreakdown').innerHTML = items.map(function(it) {
        var pct = Math.round((it.val / monthly) * 100);
        return '<div class="cg2__bd__row">' +
            '<span class="cg2__bd__lbl">' + it.label + '</span>' +
            '<div class="cg2__bd__bar__wrap"><div class="cg2__bd__bar" style="width:' + pct + '%;background:' + it.color + '"></div></div>' +
            '<span class="cg2__bd__val">\u20ac' + it.val + '</span>' +
        '</div>';
    }).join('');
}

function cg2MakeDefaultData(name, inf) {
    return {
        gradient: 'linear-gradient(135deg,#d97c14,#f59220)',
        icon: (typeof CITY_PILL_ICONS !== 'undefined' && CITY_PILL_ICONS[name]) || 'fa-location-dot',
        studentPop: 'Local students',
        vibe: inf.desc || ('Explore ' + name + ' — a vibrant student destination.'),
        matchScore: 75,
        matchReason: 'Based on your profile and this city\'s characteristics.',
        matchBreakdown: [
            {label:'Affordability',score:70},{label:'Student Life',score:75},
            {label:'Safety',score:78},{label:'Culture',score:72},{label:'Transport',score:70}
        ],
        lifestyle: [
            {label:'Study Environment',score:75,icon:'fa-book',color:'#2980b9'},
            {label:'Safety',score:78,icon:'fa-shield',color:'#27ae60'},
            {label:'Cost of Living',score:70,icon:'fa-coins',color:'#e74c3c'},
            {label:'Diversity',score:72,icon:'fa-globe',color:'#1abc9c'},
            {label:'Public Transport',score:70,icon:'fa-bus',color:'#3498db'}
        ],
        accCosts: {shared:400,studio:600,private:900}, transport:50,
        neighbourhoods: [
            {name:'City Centre',safety:78,popularity:85,rent:inf.cost||'—',commute:'0–10 min',vibe:'Central area close to university and amenities'},
            {name:'Student Quarter',safety:76,popularity:80,rent:inf.cost||'—',commute:'10–20 min',vibe:'Main student neighbourhood with bars and cafés'},
            {name:'Residential Area',safety:82,popularity:70,rent:inf.cost||'—',commute:'20–30 min',vibe:'Quieter area popular with postgraduate students'}
        ],
        hotspots: (inf.highlights||[]).slice(0,5).map(function(h,i){
            var icons = ['fa-landmark','fa-tree','fa-utensils','fa-palette','fa-music'];
            var colors = ['#c0392b','#27ae60','#e67e22','#9b59b6','#2980b9'];
            return {type:'Highlight',name:h.split('—')[0].trim(),icon:icons[i]||'fa-star',color:colors[i]||'#d97c14'};
        }),
        dayTimeline: [
            {time:'9:00',icon:'fa-book',title:'Morning lectures',desc:'Start the academic day at the university.'},
            {time:'13:00',icon:'fa-utensils',title:'Local lunch',desc:'Try the local cuisine at a nearby restaurant or market.'},
            {time:'16:00',icon:'fa-person-walking',title:'City exploration',desc:'Discover the city\'s landmarks and neighbourhoods.'},
            {time:'19:00',icon:'fa-wine-glass',title:'Evening socialising',desc:'Meet friends at local bars and cafés.'},
            {time:'22:00',icon:'fa-moon',title:'Nightlife',desc:'Experience the local nightlife scene.'}
        ],
        universities: [],
        testimonials: [],
        weather: {
            summary: inf.climate + ' climate.',
            months:['J','F','M','A','M','J','J','A','S','O','N','D'],
            temps:[8,9,12,15,19,23,26,25,21,16,11,8],
            rain:[50,40,45,45,50,40,30,35,45,55,55,52]
        }
    };
}

function cg2EmptyState(icon, title, text, showBtn) {
    return '<div class="cg2__empty">' +
        '<div class="cg2__empty__icon"><i class="fa-solid ' + icon + '"></i></div>' +
        '<div class="cg2__empty__title">' + title + '</div>' +
        '<p class="cg2__empty__text">' + text + '</p>' +
        (showBtn ? '<button class="cg2__empty__btn" data-goto-explore="1"><i class="fa-solid fa-compass"></i> Open Explore</button>' : '') +
    '</div>';
}

function cg2RenderCity(name) {
    var inf = CITY_INFO[name];
    if (!inf) return;
    var d = CG2_DATA[name] || cg2MakeDefaultData(name, inf);
    cg2ActiveCity = name;

    document.querySelectorAll('.cg2__pill').forEach(function(p) {
        p.classList.toggle('active', p.dataset.city === name);
    });

    var panel = document.getElementById('cg2Panel');
    panel.style.display = 'flex';
    panel.classList.remove('cg2__panel--in');
    void panel.offsetWidth;
    panel.classList.add('cg2__panel--in');

    var hero = document.getElementById('cg2Hero');
    hero.style.background = d.gradient;
    document.getElementById('cg2HeroBadge').innerHTML    = '<i class="fa-solid ' + d.icon + '"></i>';
    document.getElementById('cg2HeroName').textContent   = name;
    document.getElementById('cg2HeroRegion').textContent = inf.region;
    document.getElementById('cg2HeroVibe').textContent   = d.vibe;
    document.getElementById('cg2HeroPop').textContent     = inf.pop;
    document.getElementById('cg2HeroStudPop').textContent = d.studentPop;
    document.getElementById('cg2HeroCost').textContent    = inf.cost;
    document.getElementById('cg2HeroClimate').textContent = inf.climate;

    var score = d.matchScore;
    var r = 38; var circ = 2 * Math.PI * r;
    var offset = circ - (score / 100) * circ;
    var fill = document.getElementById('cg2RingFill');
    fill.style.strokeDasharray  = circ;
    fill.style.strokeDashoffset = circ;
    document.getElementById('cg2RingLabel').textContent = score + '%';
    setTimeout(function() { fill.style.strokeDashoffset = offset; }, 300);

    document.getElementById('cg2MatchReason').textContent = d.matchReason;
    document.getElementById('cg2MatchBars').innerHTML = d.matchBreakdown.map(function(b) {
        return '<div class="cg2__mb__row">' +
            '<span class="cg2__mb__lbl">' + b.label + '</span>' +
            '<div class="cg2__mb__track"><div class="cg2__mb__fill" data-pct="' + b.score + '" style="width:0"></div></div>' +
            '<span class="cg2__mb__val">' + b.score + '%</span>' +
        '</div>';
    }).join('');

    document.getElementById('cg2OverviewDesc').textContent = (inf && inf.desc) ? inf.desc : d.vibe;
    var _tags = (inf && inf.tags) ? inf.tags : [];
    var _pros = (inf && inf.pros) ? inf.pros : ((inf && inf.highlights) ? inf.highlights : []);
    document.getElementById('cg2OverviewTags').innerHTML = _tags.map(function(t) {
        return '<span class="cg2__tag">' + t + '</span>';
    }).join('');
    document.getElementById('cg2OverviewPros').innerHTML = _pros.map(function(p) {
        return '<div class="cg2__pro"><i class="fa-solid fa-check"></i><span>' + p + '</span></div>';
    }).join('');

    document.getElementById('cg2LifestyleGrid').innerHTML = d.lifestyle.map(function(l) {
        return '<div class="cg2__ls__row">' +
            '<div class="cg2__ls__ico" style="color:' + l.color + '"><i class="fa-solid ' + l.icon + '"></i></div>' +
            '<span class="cg2__ls__lbl">' + l.label + '</span>' +
            '<div class="cg2__ls__track"><div class="cg2__ls__bar" data-pct="' + l.score + '" style="width:0;background:' + l.color + '"></div></div>' +
            '<span class="cg2__ls__val">' + l.score + '</span>' +
        '</div>';
    }).join('');

    cg2CalcCost();

    document.getElementById('cg2HoodsList').innerHTML = d.neighbourhoods.map(function(h) {
        var sc = h.safety >= 85 ? '#27ae60' : h.safety >= 75 ? '#f39c12' : '#e74c3c';
        return '<div class="cg2__hood">' +
            '<div class="cg2__hood__top">' +
                '<span class="cg2__hood__name">' + h.name + '</span>' +
                '<span class="cg2__hood__badges">' +
                    '<span style="color:' + sc + '"><i class="fa-solid fa-shield"></i> ' + h.safety + '</span>' +
                    '<span style="color:#f39c12"><i class="fa-solid fa-fire"></i> ' + h.popularity + '%</span>' +
                '</span>' +
            '</div>' +
            '<div class="cg2__hood__row"><i class="fa-solid fa-coins"></i> ' + h.rent + '</div>' +
            '<div class="cg2__hood__row"><i class="fa-solid fa-route"></i> ' + h.commute + ' to campus</div>' +
            '<div class="cg2__hood__vibe">' + h.vibe + '</div>' +
        '</div>';
    }).join('');

    var _spots = getSavedPlaces();
    document.getElementById('cg2HotspotsList').innerHTML = d.hotspots.map(function(h) {
        var mapsUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(h.name + ' ' + name);
        var isSaved = _spots.some(function(p){ return p.name === h.name && p.city === name; });
        return '<div class="cg2__spot" data-spot-name="' + h.name + '" data-spot-city="' + name + '">' +
            '<div class="cg2__spot__ico" style="background:' + h.color + '1a;color:' + h.color + '">' +
                '<i class="fa-solid ' + h.icon + '"></i>' +
            '</div>' +
            '<div class="cg2__spot__txt">' +
                '<div class="cg2__spot__name">' + h.name + '</div>' +
                '<div class="cg2__spot__type">' + h.type + '</div>' +
            '</div>' +
            '<div class="cg2__spot__actions">' +
                '<a class="cg2__spot__maps" href="' + mapsUrl + '" target="_blank" rel="noopener" title="Open in Google Maps"><i class="fa-solid fa-map-location-dot"></i></a>' +
                '<button class="cg2__spot__save' + (isSaved ? ' cg2__spot__save--on' : '') + '" data-place="' + h.name + '" data-city="' + name + '" title="' + (isSaved ? 'Saved' : 'Save place') + '"><i class="fa-' + (isSaved ? 'solid' : 'regular') + ' fa-heart"></i></button>' +
            '</div>' +
        '</div>';
    }).join('');
    document.getElementById('cg2HotspotsList').querySelectorAll('.cg2__spot__save').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var pname = btn.dataset.place, city = btn.dataset.city;
            var places = getSavedPlaces();
            var idx = places.findIndex(function(p){ return p.name === pname && p.city === city; });
            if (idx === -1) places.push({ name: pname, city: city }); else places.splice(idx, 1);
            setSavedPlaces(places);
            var on = places.some(function(p){ return p.name === pname && p.city === city; });
            btn.classList.toggle('cg2__spot__save--on', on);
            btn.title = on ? 'Saved' : 'Save place';
            btn.querySelector('i').className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-heart';
            btn.classList.add('pulse');
            btn.addEventListener('animationend', function(){ btn.classList.remove('pulse'); }, { once: true });
            renderSavedPlaces(); updateStats();
        });
    });

    document.getElementById('cg2DayTimeline').innerHTML = d.dayTimeline.map(function(e, i) {
        var isLast = i === d.dayTimeline.length - 1;
        return '<div class="cg2__day__item' + (isLast ? ' cg2__day__item--last' : '') + '">' +
            '<div class="cg2__day__left">' +
                '<div class="cg2__day__node"><i class="fa-solid ' + e.icon + '"></i></div>' +
                (isLast ? '' : '<div class="cg2__day__line"></div>') +
            '</div>' +
            '<div class="cg2__day__right">' +
                '<div class="cg2__day__hd"><span class="cg2__day__time">' + e.time + '</span><span class="cg2__day__title">' + e.title + '</span></div>' +
                '<p class="cg2__day__desc">' + e.desc + '</p>' +
            '</div>' +
        '</div>';
    }).join('');

    var saved = getSaved();
    var unisGridEl = document.getElementById('cg2UnisGrid');
    if (!d.universities || !d.universities.length) {
        unisGridEl.innerHTML = cg2EmptyState(
            'fa-graduation-cap',
            'University guide coming soon',
            'We’re curating the best institutions in <strong>' + name + '</strong>. In the meantime, head to <strong>Explore</strong> to search every university in this country and bookmark your favourites.',
            true
        );
        var goBtn = unisGridEl.querySelector('[data-goto-explore]');
        if (goBtn) goBtn.addEventListener('click', function() { showTab('explore'); });
    } else {
    unisGridEl.innerHTML = d.universities.map(function(uid) {
        var m = CG2_UNI_META[uid] || {name:uid,type:'',field:'',tuition:'',students:''};
        var isSaved = saved.indexOf(uid) !== -1;
        return '<div class="cg2__uni">' +
            '<div class="cg2__uni__abbr">' + uid.toUpperCase() + '</div>' +
            '<div class="cg2__uni__body">' +
                '<div class="cg2__uni__name">' + m.name + '</div>' +
                '<div class="cg2__uni__meta"><span class="cg2__uni__badge">' + m.type + '</span><span>' + m.field + '</span></div>' +
                '<div class="cg2__uni__meta"><i class="fa-solid fa-coins"></i> ' + m.tuition + ' &nbsp;·&nbsp; <i class="fa-solid fa-users"></i> ' + m.students + ' students</div>' +
            '</div>' +
            '<button class="cg2__uni__save' + (isSaved ? ' cg2__uni__save--on' : '') + '" data-uid="' + uid + '" title="Save">' +
                '<i class="fa-' + (isSaved ? 'solid' : 'regular') + ' fa-bookmark"></i>' +
            '</button>' +
        '</div>';
    }).join('');
    }
    document.querySelectorAll('.cg2__uni__save').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var s = getSaved(), uid = btn.dataset.uid, idx = s.indexOf(uid);
            if (idx === -1) s.push(uid); else s.splice(idx, 1);
            setSaved(s);
            var on = s.indexOf(uid) !== -1;
            btn.classList.toggle('cg2__uni__save--on', on);
            btn.querySelector('i').className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark';
            renderSaved(); updateStats(); updateHeroStats(); updateHeroFeed();
        });
    });

    var testiGridEl = document.getElementById('cg2TestiGrid');
    if (!d.testimonials || !d.testimonials.length) {
        testiGridEl.innerHTML = cg2EmptyState(
            'fa-comments',
            'No stories shared yet',
            'Be among the first to study in <strong>' + name + '</strong>. Real student reviews — the good, the tough and the insider tips — will appear here as our community grows.'
        );
    } else {
    testiGridEl.innerHTML = d.testimonials.map(function(t) {
        var stars = [1,2,3,4,5].map(function(n) {
            return '<i class="fa-' + (n <= t.rating ? 'solid' : 'regular') + ' fa-star"></i>';
        }).join('');
        return '<div class="cg2__testi">' +
            '<div class="cg2__testi__top">' +
                '<span class="cg2__testi__flag">' + t.flag + '</span>' +
                '<div><div class="cg2__testi__name">' + t.name + '</div><div class="cg2__testi__from">' + t.country + '</div></div>' +
                '<div class="cg2__testi__stars">' + stars + '</div>' +
            '</div>' +
            '<div class="cg2__testi__pos"><i class="fa-solid fa-thumbs-up"></i><span>' + t.positive + '</span></div>' +
            '<div class="cg2__testi__neg"><i class="fa-solid fa-thumbs-down"></i><span>' + t.negative + '</span></div>' +
            '<div class="cg2__testi__tip"><i class="fa-solid fa-lightbulb"></i><span><b>Tip:</b> ' + t.advice + '</span></div>' +
        '</div>';
    }).join('');
    }

    // Auto-fetch 7-day forecast for the new city
    var fWrap = document.getElementById('cg2ForecastWrap');
    var fPanel = document.getElementById('cg2ForecastPanel');
    var fBtn   = document.getElementById('cg2ForecastBtn');
    if (fWrap)  { fWrap.style.display = 'none'; }
    if (fPanel) { fPanel.innerHTML = '<div class="cg2__7day__skeleton"><div class="cg2__7day__sk__spin"></div><p>Loading live forecast…</p></div>'; }
    if (fBtn)   { fBtn.classList.remove('cg2__7day__btn--active'); fBtn.querySelector('span').textContent = '7-Day Forecast'; }

    requestAnimationFrame(function() { requestAnimationFrame(function() {
        document.querySelectorAll('.cg2__mb__fill').forEach(function(el) { el.style.width = el.dataset.pct + '%'; });
        document.querySelectorAll('.cg2__ls__bar').forEach(function(el)  { el.style.width = el.dataset.pct + '%'; });
    }); });

    setTimeout(function() { panel.scrollIntoView({behavior:'smooth', block:'start'}); }, 80);
}

document.querySelectorAll('.cg2__pill').forEach(function(btn) {
    btn.addEventListener('click', function() { cg2RenderCity(btn.dataset.city); });
});
cg2InitSliders();

(function() {
    var closeBtn = document.getElementById('cg2PanelClose');
    if (!closeBtn) return;
    closeBtn.addEventListener('click', function() {
        var panel = document.getElementById('cg2Panel');
        if (!panel) return;
        panel.classList.remove('cg2__panel--in');
        panel.classList.add('cg2__panel--out');
        setTimeout(function() {
            panel.style.display = 'none';
            panel.classList.remove('cg2__panel--out');
        }, 340);
        document.querySelectorAll('.cg2__pill').forEach(function(p) { p.classList.remove('active'); });
        cg2ActiveCity = null;
    });
}());

(function() {
    var forecastBtn = document.getElementById('cg2ForecastBtn');
    if (!forecastBtn) return;
    forecastBtn.addEventListener('click', function() {
        var city = cg2ActiveCity;
        if (!city) return;
        var wrap = document.getElementById('cg2ForecastWrap');
        if (!wrap) return;
        var isVisible = wrap.style.display !== 'none';
        if (isVisible) {
            wrap.style.display = 'none';
            forecastBtn.classList.remove('cg2__7day__btn--active');
            forecastBtn.querySelector('span').textContent = '7-Day Forecast';
        } else {
            fetchCityForecast(city);
            wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}());

var currentCountryCode = 'es';
function placesKey() { return 'uniscout_places_' + currentCountryCode; }
function getSavedPlaces() { return JSON.parse(localStorage.getItem(placesKey()) || '[]'); }
function setSavedPlaces(arr) { localStorage.setItem(placesKey(), JSON.stringify(arr)); }

function renderSavedPlaces() {
    var places = getSavedPlaces();
    var grid = document.getElementById('savedPlacesGrid');
    var empty = document.getElementById('savedPlacesEmpty');
    if (!grid) return;
    if (!places.length) { grid.style.display = 'none'; empty.style.display = 'flex'; return; }
    empty.style.display = 'none'; grid.style.display = 'grid';
    grid.innerHTML = places.map(function(p) {
        var mapsUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(p.name + ' ' + p.city);
        return '<div class="mp__place__card">' +
            '<a class="mp__place__maps__link" href="' + mapsUrl + '" target="_blank" rel="noopener" title="Open in Google Maps"><i class="fa-solid fa-map-location-dot"></i></a>' +
            '<div class="mp__place__info">' +
                '<div class="mp__place__name">' + p.name + '</div>' +
                '<div class="mp__place__city"><i class="fa-solid fa-location-dot"></i> ' + p.city + '</div>' +
            '</div>' +
            '<button class="mp__place__remove" data-name="' + p.name + '" data-city="' + p.city + '" title="Remove"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('.mp__place__remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var places = getSavedPlaces().filter(function(p) { return !(p.name === btn.dataset.name && p.city === btn.dataset.city); });
            setSavedPlaces(places);
            renderSavedPlaces();
            updateStats();
        });
    });
}
renderSavedPlaces();

function showCityInfo(cityName) {

    if (!document.getElementById('wxCiBadge')) return;
    var info = CITY_INFO[cityName] || { region:'—', pop:'—', climate:'—', cost:'—', desc:'', highlights:[], studentLife:'', transport:'', nightlife:'', pros:[], tags:[] };
    document.getElementById('wxCiBadge').textContent   = cityName.slice(0,2).toUpperCase();
    document.getElementById('wxCiName').textContent    = cityName;
    document.getElementById('wxCiRegion').textContent  = info.region;
    document.getElementById('wxCiPop').textContent     = info.pop;
    document.getElementById('wxCiClimate').textContent = info.climate;
    document.getElementById('wxCiCost').textContent    = info.cost;
    document.getElementById('wxCiDesc').textContent    = info.desc;

    var places = getSavedPlaces();
    document.getElementById('wxCiHighlights').innerHTML = (info.highlights || []).map(function(h) {
        var pname = h.split(' — ')[0];
        var note  = h.indexOf(' — ') !== -1 ? h.split(' — ').slice(1).join(' — ') : '';
        var saved = places.some(function(p){ return p.name === pname && p.city === cityName; });
        return '<div class="wx__ci__hl">' +
            '<div class="wx__ci__hl__text"><span class="wx__ci__hl__name">' + pname + '</span>' + (note ? '<span class="wx__ci__hl__note">' + note + '</span>' : '') + '</div>' +
            '<button class="wx__ci__hl__save' + (saved ? ' saved' : '') + '" data-place="' + pname + '" data-city="' + cityName + '" title="' + (saved ? 'Saved' : 'Save place') + '"><i class="fa-' + (saved ? 'solid' : 'regular') + ' fa-heart"></i></button>' +
        '</div>';
    }).join('');

    document.getElementById('wxCiHighlights').querySelectorAll('.wx__ci__hl__save').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var pname = btn.dataset.place; var city = btn.dataset.city;
            var places = getSavedPlaces();
            var idx = places.findIndex(function(p){ return p.name === pname && p.city === city; });
            if (idx === -1) { places.push({ name: pname, city: city }); } else { places.splice(idx, 1); }
            setSavedPlaces(places);
            var saved = places.some(function(p){ return p.name === pname && p.city === city; });
            btn.className = 'wx__ci__hl__save' + (saved ? ' saved' : '') + ' pulse';
            btn.title = saved ? 'Saved' : 'Save place';
            btn.querySelector('i').className = 'fa-' + (saved ? 'solid' : 'regular') + ' fa-heart';
            btn.addEventListener('animationend', function(){ btn.classList.remove('pulse'); }, { once: true });
            renderSavedPlaces(); updateStats();
        });
    });

    document.getElementById('wxCiStudentLife').textContent = info.studentLife || '';
    document.getElementById('wxCiTransport').textContent   = info.transport   || '';
    document.getElementById('wxCiNightlife').textContent   = info.nightlife   || '';
    document.getElementById('wxCiPros').innerHTML = (info.pros || []).map(function(p){ return '<div class="wx__ci__pro"><i class="fa-solid fa-check"></i>' + p + '</div>'; }).join('');
    document.getElementById('wxCiTags').innerHTML = (info.tags || []).map(function(t){ return '<span class="wx__ci__tag">' + t + '</span>'; }).join('');

    document.getElementById('wxCityInfo').classList.add('open');
    document.getElementById('wxFeatured').style.display = 'none';
}

(function(){ var el = document.getElementById('wxCityInfoBack'); if (el) el.addEventListener('click', function() {
    var ci = document.getElementById('wxCityInfo'); if (ci) ci.classList.remove('open');
    var ft = document.getElementById('wxFeatured'); if (ft) ft.style.display = 'block';
}); }());

document.querySelectorAll('.wx__feat__card').forEach(function(card) {
    card.addEventListener('click', function() {
        var city = card.dataset.city;
        document.getElementById('wxCityInput').value = city;
        showCityInfo(city);
        fetchWeather(city);
    });
});

(function(){ var el = document.getElementById('wxCityBtn'); if (el) el.addEventListener('click', function() {
    var inp = document.getElementById('wxCityInput'); var city = inp ? inp.value.trim() : '';
    if (city) fetchWeather(city);
}); }());

document.querySelectorAll('.cg__card__wxbtn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var city = btn.dataset.city;
        document.getElementById('wxCityInput').value = city;
        showCityInfo(city);
        fetchWeather(city);
        document.getElementById('cgWeatherSection').scrollIntoView({ behavior:'smooth', block:'start' });
    });
});
(function(){ var el = document.getElementById('wxCityInput'); if (el) el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { var city = el.value.trim(); if (city) fetchWeather(city); }
}); }());

var wxDayData = {};

function applyWeatherDisplay(entries, cond, cityLabel) {
    var hi  = Math.max.apply(null, entries.map(function(e){ return e.main.temp_max; }));
    var lo  = Math.min.apply(null, entries.map(function(e){ return e.main.temp_min; }));
    var mid = entries[Math.floor(entries.length / 2)];
    var icon = WX_ICONS[cond || mid.weather[0].main] || '🌡️';
    var photo = WX_PHOTOS[cond || mid.weather[0].main] || 'cloudy.jpeg';
    if (cityLabel) document.getElementById('wxWzCity').textContent = cityLabel;
    document.getElementById('wxWzIcon').textContent = icon;
    document.getElementById('wxWzTemp').textContent = Math.round(mid.main.temp) + '°C';
    document.getElementById('wxWzDesc').textContent = mid.weather[0].description;
    document.getElementById('wxWzHum').textContent  = mid.main.humidity + '%';
    document.getElementById('wxWzWind').textContent = Math.round(mid.wind.speed) + ' m/s';
    document.getElementById('wxWzFeel').textContent = Math.round(mid.main.feels_like) + '°C';
    document.getElementById('wxWzHi').textContent   = 'H: ' + Math.round(hi) + '°';
    document.getElementById('wxWzLo').textContent   = 'L: ' + Math.round(lo) + '°';
    var wz = document.getElementById('wxWeatherZone');
    if (wz) { wz.style.backgroundImage = 'url(' + photo + ')'; wz.classList.add('wx__has__photo'); }
}

function fetchWeather(city) {
    var placeholder = document.getElementById('wxPlaceholder');
    var mainEl      = document.getElementById('wxMain');
    var errEl       = document.getElementById('wxWzErr');
    placeholder.style.display = 'none';
    errEl.style.display       = 'none';
    mainEl.style.display      = 'none';

    fetch('https://api.openweathermap.org/data/2.5/forecast?q=' + encodeURIComponent(city) + '&units=metric&appid=' + WX_KEY)
    .then(function(r) {
        if (!r.ok) throw new Error('City not found');
        return r.json();
    })
    .then(function(data) {
        var cur  = data.list[0];
        var cond = cur.weather[0].main;

        showCityInfo(data.city.name);

        applyWeatherDisplay([cur], cond, data.city.name + ', ' + data.city.country, false);
        document.getElementById('wxWzTemp').textContent = Math.round(cur.main.temp) + '°C';

        wxDayData = {};
        data.list.forEach(function(item) {
            var d = item.dt_txt.split(' ')[0];
            if (!wxDayData[d]) wxDayData[d] = [];
            wxDayData[d].push(item);
        });
        var dayKeys = Object.keys(wxDayData).slice(0, 5);

        document.getElementById('wxWzForecast').innerHTML = dayKeys.map(function(d, idx) {
            var entries = wxDayData[d];
            var hi  = Math.max.apply(null, entries.map(function(e){ return e.main.temp_max; }));
            var lo  = Math.min.apply(null, entries.map(function(e){ return e.main.temp_min; }));
            var mid = entries[Math.floor(entries.length / 2)];
            var ic  = WX_ICONS[mid.weather[0].main] || '🌡️';
            var dn  = new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short' });
            return '<div class="wx__forecast__day' + (idx === 0 ? ' active' : '') + '" data-day="' + d + '">' +
                '<div class="wx__day__name">' + dn + '</div>' +
                '<div class="wx__day__icon">' + ic + '</div>' +
                '<div class="wx__day__hi">' + Math.round(hi) + '°</div>' +
                '<div class="wx__day__lo">' + Math.round(lo) + '°</div>' +
            '</div>';
        }).join('');

        document.getElementById('wxWzForecast').querySelectorAll('.wx__forecast__day').forEach(function(dayEl) {
            dayEl.addEventListener('click', function() {
                document.getElementById('wxWzForecast').querySelectorAll('.wx__forecast__day').forEach(function(d){ d.classList.remove('active'); });
                dayEl.classList.add('active');
                var d = dayEl.dataset.day;
                var entries = wxDayData[d];
                if (!entries || !entries.length) return;
                var mid = entries[Math.floor(entries.length / 2)];
                applyWeatherDisplay(entries, mid.weather[0].main, null, true);
            });
        });

        mainEl.style.display = 'flex';
    })
    .catch(function() {
        errEl.style.display = 'block';
    });
}

var cmpVsSelected = { A: null, B: null };
var cmpVsCountry  = { A: null, B: null };   // country code chosen per slot
var cmpVsUnis     = { A: [], B: [] };       // universities available for each slot's country
var cmpCountryCache = {};                    // code -> universities array

// Countries available in the compare dropdowns (the ones we have data for)
function cmpCountryList() {
    if (typeof DATA_COUNTRIES !== 'undefined') return DATA_COUNTRIES.slice();
    return [];
}

// Load (and cache) the universities for a given country code
function cmpLoadCountryUnis(code) {
    if (cmpCountryCache[code]) return Promise.resolve(cmpCountryCache[code]);
    return fetch('data/' + code + '.json')
        .then(function(r) { if (!r.ok) throw new Error('Missing'); return r.json(); })
        .then(function(data) {
            var list = (data.universities || []).concat(
                typeof getCustomUnisForCountry === 'function' ? getCustomUnisForCountry(code) : []
            );
            cmpCountryCache[code] = list;
            return list;
        })
        .catch(function() { cmpCountryCache[code] = []; return []; });
}

function buildVsSuggest(query, resultEl, slot) {
    if (!query) { resultEl.innerHTML = ''; return; }
    var q = query.toLowerCase();
    var pool = (cmpVsUnis[slot] && cmpVsUnis[slot].length) ? cmpVsUnis[slot] : UNI;
    var hits = pool.filter(function(u) {
        return (u.name + ' ' + u.abbr + ' ' + u.city).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 6);
    if (!hits.length) {
        resultEl.innerHTML = '<div class="cmp__vs__no__match">No universities found for "' + query + '"</div>';
        return;
    }
    resultEl.innerHTML = hits.map(function(u) {
        var tc = uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv';
        return '<div class="cmp__vs__suggest" data-id="' + u.id + '">' +
            '<div class="cmp__vs__suggest__abbr" style="background:' + u.color + '">' + u.abbr + '</div>' +
            '<div class="cmp__vs__suggest__info">' +
                '<div class="cmp__vs__suggest__name">' + u.name + '</div>' +
                '<div class="cmp__vs__suggest__meta">' +
                    '<span class="mp__badge mp__badge--city">' + u.city + '</span>' +
                    '<span class="mp__badge ' + tc + '">' + u.type + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');
    resultEl.querySelectorAll('.cmp__vs__suggest').forEach(function(el) {
        el.addEventListener('click', function() {
            // Look up within this slot's country pool first (it may be a different
            // country than the current destination), then fall back to global UNI.
            var u = hits.find(function(x){ return x.id === el.dataset.id; }) ||
                    UNI.find(function(x){ return x.id === el.dataset.id; });
            if (u) selectVsUni(slot, u);
        });
    });
}

function selectVsUni(slot, u) {
    cmpVsSelected[slot] = u;
    var searchEl   = document.getElementById('cmpSearch' + slot);
    var resultsEl  = document.getElementById('cmpResults' + slot);
    var selectedEl = document.getElementById('cmpSelected' + slot);
    var tc = uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv';
    searchEl.value = '';
    resultsEl.innerHTML = '';
    selectedEl.style.display = 'block';
    selectedEl.innerHTML =
        '<div class="cmp__vs__sel__card" style="border-color:' + u.color + '">' +
            '<div class="cmp__vs__sel__abbr" style="background:' + u.color + '">' + u.abbr + '</div>' +
            '<div class="cmp__vs__sel__info">' +
                '<div class="cmp__vs__sel__name">' + u.name + '</div>' +
                '<div class="cmp__vs__sel__meta">' +
                    '<span class="mp__badge mp__badge--city">' + u.city + '</span>' +
                    '<span class="mp__badge ' + tc + '">' + u.type + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="cmp__vs__clear__btn" data-slot="' + slot + '" title="Remove"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
    selectedEl.querySelector('.cmp__vs__clear__btn').addEventListener('click', function() {
        cmpVsSelected[slot] = null;
        selectedEl.style.display = 'none';
        selectedEl.innerHTML = '';
        renderVsComparison();
    });
    renderVsComparison();
}

var VS_METRIC_DEFS = {
    tuition:    { label:'Annual Tuition',   icon:'fa-solid fa-coins',        fn: function(u){ return uniTuitionLabel(u); } },
    difficulty: { label:'Entry Difficulty', icon:'fa-solid fa-fire',         fn: function(u){ return u.dl; } },
    fields:     { label:'Fields of Study',  icon:'fa-solid fa-book-open',    fn: function(u){ return u.fields.join(', '); } },
    languages:  { label:'Languages',        icon:'fa-solid fa-language',     fn: function(u){ return u.langs.join(', '); } },
    type:       { label:'University Type',  icon:'fa-solid fa-building',     fn: function(u){ return u.type; } },
    founded:    { label:'Founded',          icon:'fa-solid fa-calendar',     fn: function(u){ return u.founded || '—'; } },
    students:   { label:'Students',         icon:'fa-solid fa-users',        fn: function(u){ return u.students || '—'; } },
    city:       { label:'City',             icon:'fa-solid fa-location-dot', fn: function(u){ return u.city; } },
};

var _lastCmpPairKey = '';
function renderVsComparison() {
    var a = cmpVsSelected.A;
    var b = cmpVsSelected.B;
    var metricsEl = document.getElementById('cmpVsMetrics');
    var tableEl   = document.getElementById('cmpVsTable');
    var emptyEl   = document.getElementById('cmpVsEmpty');
    if (!metricsEl || !tableEl || !emptyEl) return;

    if (!a || !b) {
        metricsEl.style.display = 'none';
        tableEl.style.display   = 'none';
        emptyEl.style.display   = 'flex';
        return;
    }

    emptyEl.style.display   = 'none';
    metricsEl.style.display = 'block';
    tableEl.style.display   = 'block';

    // Count each unique completed comparison (for Titles)
    var _pairKey = a.id + '|' + b.id;
    if (_pairKey !== _lastCmpPairKey) {
        _lastCmpPairKey = _pairKey;
        if (typeof bumpCmpCount === 'function') bumpCmpCount();
    }

    var activeMetrics = [];
    document.querySelectorAll('.cmp__vs__mc input[type="checkbox"]').forEach(function(cb) {
        if (cb.checked) activeMetrics.push(cb.dataset.metric);
    });

    tableEl.innerHTML =
        '<div class="cmp__vs__tbl">' +
            '<div class="cmp__vs__tbl__header">' +
                '<div class="cmp__vs__tbl__lbl__col"></div>' +
                '<div class="cmp__vs__tbl__uni__col cmp__vs__tbl__col--a">' +
                    '<div class="cmp__vs__tbl__abbr" style="background:' + a.color + '">' + a.abbr + '</div>' +
                    '<div class="cmp__vs__tbl__uname">' + a.name + '</div>' +
                '</div>' +
                '<div class="cmp__vs__tbl__uni__col cmp__vs__tbl__col--b">' +
                    '<div class="cmp__vs__tbl__abbr" style="background:' + b.color + '">' + b.abbr + '</div>' +
                    '<div class="cmp__vs__tbl__uname">' + b.name + '</div>' +
                '</div>' +
            '</div>' +
            activeMetrics.map(function(m) {
                var def = VS_METRIC_DEFS[m]; if (!def) return '';
                return '<div class="cmp__vs__tbl__row">' +
                    '<div class="cmp__vs__tbl__lbl"><i class="' + def.icon + '"></i>' + def.label + '</div>' +
                    '<div class="cmp__vs__tbl__val cmp__vs__tbl__col--a">' + def.fn(a) + '</div>' +
                    '<div class="cmp__vs__tbl__val cmp__vs__tbl__col--b">' + def.fn(b) + '</div>' +
                '</div>';
            }).join('') +
        '</div>';
}

document.getElementById('cmpSearchA').addEventListener('input', function() {
    buildVsSuggest(this.value.trim(), document.getElementById('cmpResultsA'), 'A');
});
document.getElementById('cmpSearchB').addEventListener('input', function() {
    buildVsSuggest(this.value.trim(), document.getElementById('cmpResultsB'), 'B');
});
document.querySelectorAll('.cmp__vs__mc input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', renderVsComparison);
});

// ---- Per-slot country selection for head-to-head comparison ----
function cmpSetSlotCountry(slot, code) {
    cmpVsCountry[slot] = code;
    var flagEl   = document.getElementById('cmpFlag' + slot);
    var selEl    = document.getElementById('cmpCountry' + slot);
    var searchEl = document.getElementById('cmpSearch' + slot);
    if (selEl)  selEl.value = code;
    if (flagEl) flagEl.className = 'cmp__vs__country__flag fi fi-' + code;
    // Reset this slot's current selection — it belonged to the previous country
    cmpVsSelected[slot] = null;
    var selectedEl = document.getElementById('cmpSelected' + slot);
    if (selectedEl) { selectedEl.style.display = 'none'; selectedEl.innerHTML = ''; }
    var resultsEl = document.getElementById('cmpResults' + slot);
    if (resultsEl) resultsEl.innerHTML = '';
    if (searchEl) { searchEl.value = ''; searchEl.disabled = true; searchEl.placeholder = 'Loading universities…'; }
    renderVsComparison();
    cmpLoadCountryUnis(code).then(function(list) {
        if (cmpVsCountry[slot] !== code) return; // user changed again meanwhile
        cmpVsUnis[slot] = list;
        if (searchEl) { searchEl.disabled = false; searchEl.placeholder = 'Search by name or abbreviation…'; }
    });
}

function cmpInitCountrySelectors() {
    var list = cmpCountryList();
    if (!list.length) return;
    var def = (typeof currentCountryCode !== 'undefined' && currentCountryCode) ? currentCountryCode :
              (localStorage.getItem(COUNTRY_KEY) || list[0].code);
    if (!list.some(function(c){ return c.code === def; })) def = list[0].code;
    ['A','B'].forEach(function(slot) {
        var selEl = document.getElementById('cmpCountry' + slot);
        if (!selEl) return;
        selEl.innerHTML = list.map(function(c) {
            return '<option value="' + c.code + '">' + c.name + '</option>';
        }).join('');
        selEl.onchange = function() { cmpSetSlotCountry(slot, this.value); };
        if (!cmpVsCountry[slot]) cmpSetSlotCountry(slot, def);
    });
}

var FEED_UPDATES = [

    { uniId:'ucm',   cat:'deadline',    label:'Deadline',    text:'Undergraduate applications for 2025/26 close 30 June. Submit your documents early.',     date:'2 days ago' },
    { uniId:'ucm',   cat:'openday',     label:'Open Day',    text:'Virtual Open Day on 15 May — register now to join live Q&A sessions with faculty.',      date:'5 days ago' },
    { uniId:'uam',   cat:'scholarship', label:'Scholarship', text:'€3,000 Excellence Scholarship open for international students. Deadline: 1 July.',        date:'3 days ago' },
    { uniId:'upm',   cat:'ranking',     label:'Ranking',     text:'UPM rises 18 places in QS World Rankings 2025 — now #1 technical university in Spain.',   date:'1 week ago' },
    { uniId:'upm',   cat:'programme',   label:'Programme',   text:'New MSc in Artificial Intelligence launching September 2025. Applications now open.',     date:'4 days ago' },
    { uniId:'uc3m',  cat:'tuition',     label:'Tuition',     text:'Tuition fees frozen for 2025/26 academic year. No increase for continuing students.',     date:'1 week ago' },
    { uniId:'ie',    cat:'ranking',     label:'Ranking',     text:'IE Business School ranked #3 in Europe by FT European Business School Rankings 2025.',    date:'2 weeks ago' },
    { uniId:'ie',    cat:'scholarship', label:'Scholarship', text:'Merit scholarships up to 40% tuition reduction now open. Apply before 15 June.',          date:'6 days ago' },
    { uniId:'urjc',  cat:'openday',     label:'Open Day',    text:'Campus Open Days every Saturday in May — visit labs, meet professors and current students.',date:'3 days ago' },
    { uniId:'ub',    cat:'deadline',    label:'Deadline',    text:'Erasmus+ application window closes 20 May. Places limited — apply now.',                  date:'1 day ago' },
    { uniId:'uab',   cat:'programme',   label:'Programme',   text:'Joint Bachelor\'s in Bioinformatics with CRG now accepting applications for 2025.',       date:'5 days ago' },
    { uniId:'upf',   cat:'ranking',     label:'Ranking',     text:'UPF enters top 200 globally in THE World University Rankings for the first time.',        date:'2 weeks ago' },
    { uniId:'upc',   cat:'scholarship', label:'Scholarship', text:'Industry-funded PhD positions in Robotics & Automation — 6 fully funded spots available.', date:'4 days ago' },
    { uniId:'esade', cat:'openday',     label:'Open Day',    text:'MBA Open Evening in Barcelona — meet alumni and admissions directors. 22 May.',           date:'1 week ago' },
    { uniId:'uv',    cat:'tuition',     label:'Tuition',     text:'EU student tuition reduced by 8% for 2025/26 following regional government grant.',       date:'2 weeks ago' },
    { uniId:'upv',   cat:'deadline',    label:'Deadline',    text:'Pre-enrolment period for Engineering degrees: 2–20 June 2025.',                          date:'3 days ago' },
    { uniId:'us',    cat:'programme',   label:'Programme',   text:'New English-taught LLM in European Business Law launching October 2025.',                 date:'1 week ago' },
    { uniId:'ug',    cat:'openday',     label:'Open Day',    text:'Alhambra Campus Day — guided tours and faculty meetings. Free registration open.',        date:'6 days ago' },
    { uniId:'usal',  cat:'scholarship', label:'Scholarship', text:'USAL Global Scholarship: full tuition waiver for top-ranked international applicants.',    date:'5 days ago' },
    { uniId:'ehu',   cat:'ranking',     label:'Ranking',     text:'EHU/UPV enters top 50 European universities in research output for STEM fields.',         date:'2 weeks ago' },
    { uniId:'deusto',cat:'programme',   label:'Programme',   text:'Double Degree in Law + Business Administration — partnerships with 3 EU universities.',   date:'1 week ago' },

    { uniId:'oxford',  cat:'deadline',    label:'Deadline',    text:'Graduate applications for Michaelmas 2026 entry open 1 September. Check college deadlines.', date:'3 days ago' },
    { uniId:'oxford',  cat:'ranking',     label:'Ranking',     text:'Oxford retains #1 in QS World Rankings 2025 for the 9th consecutive year.',               date:'2 weeks ago' },
    { uniId:'cambridge',cat:'openday',    label:'Open Day',    text:'Undergraduate Open Days: 2–3 July 2025. Book your place — spaces fill within hours.',     date:'1 week ago' },
    { uniId:'cambridge',cat:'scholarship',label:'Scholarship', text:'Gates Cambridge Scholarships 2026 now accepting applications. Full funding available.',    date:'4 days ago' },
    { uniId:'imperial', cat:'programme',  label:'Programme',   text:'New MSc in Climate Change Science & Policy launching October 2025.',                      date:'5 days ago' },
    { uniId:'imperial', cat:'ranking',    label:'Ranking',     text:'Imperial ranked #2 in the UK and #8 globally in QS 2025 — highest ever position.',        date:'2 weeks ago' },
    { uniId:'ucl',      cat:'deadline',   label:'Deadline',    text:'UCAS undergraduate deadline: 29 January 2026. Personal statement workshops available.',    date:'6 days ago' },
    { uniId:'ucl',      cat:'scholarship',label:'Scholarship', text:'UCL Global Excellence Scholarships open — up to £10,000 for international students.',     date:'3 days ago' },
    { uniId:'lse',      cat:'ranking',    label:'Ranking',     text:'LSE ranked #1 globally for Social Sciences & Management by QS Subject Rankings.',         date:'1 week ago' },
    { uniId:'lse',      cat:'openday',    label:'Open Day',    text:'LSE Undergraduate Open Day: 21 June 2025. Register at lse.ac.uk/openday.',               date:'4 days ago' },
    { uniId:'kcl',      cat:'tuition',    label:'Tuition',     text:'International tuition for 2025/26 confirmed — fees unchanged from previous year.',        date:'2 weeks ago' },
    { uniId:'edinburgh',cat:'scholarship',label:'Scholarship', text:'Edinburgh Global Undergraduate Scholarships: up to £6,000. Apply by 1 March 2026.',       date:'5 days ago' },
    { uniId:'manchester',cat:'programme', label:'Programme',   text:'Alliance Manchester Business School launches new part-time MBA for working professionals.', date:'1 week ago' },

    { uniId:'sorbonne', cat:'deadline',   label:'Deadline',    text:'Campus France registration for non-EU students: deadline 2 December 2025.',              date:'1 week ago' },
    { uniId:'sciencespo',cat:'scholarship',label:'Scholarship',text:'Emile Boutmy Scholarship: up to full tuition for international students. Apply by 5 Jan.',date:'3 days ago' },
    { uniId:'polytechnique',cat:'ranking',label:'Ranking',     text:'École Polytechnique rises to #41 globally in QS 2025 Engineering & Technology.',         date:'2 weeks ago' },
    { uniId:'hec',      cat:'openday',    label:'Open Day',    text:'HEC MBA Virtual Information Session — 18 May. Register at hec.edu/openday.',             date:'4 days ago' },

    { uniId:'lmu',      cat:'deadline',   label:'Deadline',    text:'Winter semester application deadline: 15 July 2025 for international applicants.',        date:'5 days ago' },
    { uniId:'tum',      cat:'ranking',    label:'Ranking',     text:'TUM ranked #37 globally — highest ever — in QS World University Rankings 2025.',          date:'2 weeks ago' },
    { uniId:'tum',      cat:'scholarship',label:'Scholarship', text:'DAAD Scholarships for 2025/26 open — up to €850/month for Master\'s students.',           date:'3 days ago' },
    { uniId:'heidelberg',cat:'programme', label:'Programme',   text:'New International MD-PhD programme with Johns Hopkins University starting 2025.',         date:'1 week ago' },

    { uniId:'sapienza', cat:'deadline',   label:'Deadline',    text:'Applications for 2025/26 open via Universitaly from 15 April. Non-EU places limited.',   date:'2 days ago' },
    { uniId:'bocconi',  cat:'ranking',    label:'Ranking',     text:'Bocconi ranked #7 globally for Economics & Econometrics by QS Subject Rankings 2025.',   date:'1 week ago' },
    { uniId:'bocconi',  cat:'scholarship',label:'Scholarship', text:'Bocconi Merit Awards: up to full tuition. Application opens 1 October 2025.',             date:'4 days ago' },
    { uniId:'polimi',   cat:'openday',    label:'Open Day',    text:'PoliMi Campus Tour Days every Friday — book via polomilano.it/visit.',                   date:'6 days ago' },

    { uniId:'ulisboa',  cat:'deadline',   label:'Deadline',    text:'2025/26 international applications open — apply via the university portal by 31 July.',   date:'3 days ago' },
    { uniId:'nova',     cat:'scholarship',label:'Scholarship', text:'NOVA Excellence Scholarships: 50% tuition reduction for top international applicants.',   date:'5 days ago' },
    { uniId:'porto',    cat:'ranking',    label:'Ranking',     text:'University of Porto enters top 300 globally in THE World University Rankings 2025.',      date:'2 weeks ago' },
];

var NEWS_READ_KEY = 'us_news_read_' + user.id;
function getNewsRead() { try { return JSON.parse(localStorage.getItem(NEWS_READ_KEY) || '[]'); } catch(e) { return []; } }
function setNewsRead(ids) { localStorage.setItem(NEWS_READ_KEY, JSON.stringify(ids)); }

function parseDaysAgo(dateStr) {
    if (!dateStr) return 999;
    var m;
    m = dateStr.match(/(\d+)\s+day/);
    if (m) return parseInt(m[1]);
    m = dateStr.match(/(\d+)\s+week/);
    if (m) return parseInt(m[1]) * 7;
    m = dateStr.match(/(\d+)\s+month/);
    if (m) return parseInt(m[1]) * 30;
    if (dateStr === 'today' || dateStr === 'just now') return 0;
    return 999;
}

function getFeedItemId(u, i) { return u.uniId + '_' + u.cat + '_' + i; }

var CAT_STYLES = {
    deadline:   { color:'#e74c3c', bg:'rgba(231,76,60,.1)',   icon:'fa-solid fa-clock' },
    openday:    { color:'#2980b9', bg:'rgba(41,128,185,.1)',  icon:'fa-solid fa-calendar-check' },
    scholarship:{ color:'#27ae60', bg:'rgba(39,174,96,.1)',   icon:'fa-solid fa-medal' },
    tuition:    { color:'#8e44ad', bg:'rgba(142,68,173,.1)',  icon:'fa-solid fa-euro-sign' },
    ranking:    { color:'#d97c14', bg:'rgba(217,124,20,.1)',  icon:'fa-solid fa-trophy' },
    programme:  { color:'#16a085', bg:'rgba(22,160,133,.1)',  icon:'fa-solid fa-book-open' },
};

function renderUpdatesFeed() {
    var saved   = getSaved();
    var feedEl  = document.getElementById('feedList');
    var emptyEl = document.getElementById('feedEmpty');
    var dotEl   = document.getElementById('feedDot');
    if (!feedEl) return;

    var updates = FEED_UPDATES.filter(function(u) { return saved.indexOf(u.uniId) !== -1; });

    if (!updates.length) {
        if (emptyEl) emptyEl.style.display = 'flex';
        feedEl.querySelectorAll('.mp__feed__item').forEach(function(el){ el.remove(); });
        if (dotEl) dotEl.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    var readIds = getNewsRead();
    var hasUnread = FEED_UPDATES.some(function(u, i) {
        if (saved.indexOf(u.uniId) === -1) return false;
        return parseDaysAgo(u.date) < 2 && readIds.indexOf(getFeedItemId(u, i)) === -1;
    });
    if (dotEl) dotEl.style.display = hasUnread ? 'flex' : 'none';

    feedEl.querySelectorAll('.mp__feed__item').forEach(function(el){ el.remove(); });

    updates.forEach(function(u, i) {
        var uni = UNI.find(function(x){ return x.id === u.uniId; });
        if (!uni) return;
        var cs  = CAT_STYLES[u.cat] || CAT_STYLES.programme;
        var item = document.createElement('div');
        item.className = 'mp__feed__item';
        item.style.animationDelay = (i * 0.04) + 's';
        item.innerHTML =
            '<div class="mp__feed__avatar" style="background:' + uni.color + '">' + uni.abbr.slice(0,3) + '</div>' +
            '<div class="mp__feed__body">' +
                '<div class="mp__feed__top">' +
                    '<span class="mp__feed__badge" style="background:' + cs.bg + ';color:' + cs.color + '">' +
                        '<i class="' + cs.icon + '"></i> ' + u.label +
                    '</span>' +
                    '<span class="mp__feed__date">' + u.date + '</span>' +
                '</div>' +
                '<div class="mp__feed__uni">' + uni.name + '</div>' +
                '<p class="mp__feed__text">' + u.text + '</p>' +
            '</div>';
        if (emptyEl) feedEl.insertBefore(item, emptyEl);
        else feedEl.appendChild(item);
    });

    updateHeroFeed();
}

var feedOpen = false;
function openFeed()  {
    feedOpen = true;
    document.getElementById('feedSidebar').classList.add('open');
    document.getElementById('feedOverlay').classList.add('open');
    renderFriendRequests();
    renderUpdatesFeed();
}
function closeFeed() {
    feedOpen = false;
    document.getElementById('feedSidebar').classList.remove('open');
    document.getElementById('feedOverlay').classList.remove('open');
    var saved = getSaved();
    var readIds = getNewsRead();
    FEED_UPDATES.forEach(function(u, i) {
        if (saved.indexOf(u.uniId) === -1) return;
        var id = getFeedItemId(u, i);
        if (readIds.indexOf(id) === -1) readIds.push(id);
    });
    setNewsRead(readIds);
    updateHeroFeed();
    var dot = document.getElementById('feedDot');
    if (dot) dot.style.display = 'none';
}
document.getElementById('feedToggle').addEventListener('click', function() { feedOpen ? closeFeed() : openFeed(); });
document.getElementById('feedClose').addEventListener('click', closeFeed);
document.getElementById('feedOverlay').addEventListener('click', closeFeed);

setTimeout(renderUpdatesFeed, 0);

var COUNTRY_KEY = 'uniscout_country';
var _loadCountryGen = 0;

var CUSTOM_COUNTRY_NAMES = {
    es:'Spain', uk:'United Kingdom', gb:'United Kingdom', fr:'France', de:'Germany',
    it:'Italy', pt:'Portugal', us:'United States', ch:'Switzerland', ua:'Ukraine',
    nl:'Netherlands', se:'Sweden', dk:'Denmark', be:'Belgium', fi:'Finland', ie:'Ireland'
};

// Build a realistic description for an admin-added university when none was stored.
function buildCustomDesc(u, code) {
    var country = CUSTOM_COUNTRY_NAMES[code] || '';
    var loc = (u.city || '') + (country ? ', ' + country : '');
    var isPublic = (u.type || 'Public').toLowerCase() === 'public';
    var ts = u.ts || 2;
    var seed = 0;
    var nm = u.name || 'University';
    for (var i = 0; i < nm.length; i++) seed = (seed * 31 + nm.charCodeAt(i)) >>> 0;
    function pick(arr) { return arr[seed % arr.length]; }

    var opener = pick([
        nm + ' is a respected ' + (isPublic ? 'public' : 'private') + ' university based in ' + loc + '.',
        'Located in ' + loc + ', ' + nm + ' is a ' + (isPublic ? 'publicly funded' : 'private') + ' institution of higher education.',
        nm + ' is a leading ' + (isPublic ? 'public' : 'private') + ' university in ' + loc + ', attracting students from across the region and beyond.'
    ]);
    var character = isPublic
        ? pick(['As a state-funded institution, it offers a broad academic portfolio at accessible, regulated tuition while upholding rigorous national quality standards.',
                'Backed by public funding, the university combines affordable fees with a wide range of degree programmes and a strong research culture.',
                'As a public university, it provides regulated tuition, large faculties and degrees recognised throughout the country and internationally.'])
        : pick(['As a private institution, it is known for smaller class sizes, close faculty contact and a strongly industry-oriented curriculum.',
                'Operating privately, the university focuses on personalised teaching, modern facilities and close ties with employers and industry.',
                'As a private university, it offers a selective, career-focused environment with an emphasis on practical, employable skills.']);
    var costNote = ['',
        'With very affordable tuition, it is an excellent-value choice for both domestic and international students.',
        'Its moderate tuition makes it a popular, good-value destination for international applicants.',
        'Tuition sits in the mid-range, reflecting its established academic standing.',
        'Premium tuition reflects its strong reputation and the investment in a globally recognised degree.',
        'As a premium institution, its fees are among the higher tier — matched by its prestige and graduate outcomes.'][ts] || '';
    var cityNote = pick([
        'Students benefit from a vibrant city setting with a lively campus community and rich student life.',
        'The surrounding city offers an engaging environment, with plenty of culture, amenities and opportunities for students.',
        'Its location places students at the heart of an active, welcoming student city.'
    ]);
    return [opener, character, costNote, cityNote].filter(Boolean).join(' ');
}

// Admin-added universities (stored by the admin panel). Admin uses 'uk' for the UK; the app uses 'gb'.
function getCustomUnisForCountry(code) {
    var custom = [];
    try { custom = JSON.parse(localStorage.getItem('uniscout_custom_unis') || '[]'); } catch (e) { return []; }
    var adminCode = (code === 'gb') ? 'uk' : code;
    var PALETTE = ['#8B1A1A','#003087','#005691','#1565c0','#00573F','#8e44ad','#c0392b','#16a085'];
    return custom.filter(function (u) { return u.country === adminCode; }).map(function (u, i) {
        var diff = u.diff || 3;
        var mapped = {
            id: u.id,
            name: u.name,
            abbr: u.abbr || (u.name || 'UNI').slice(0, 6).toUpperCase(),
            color: u.color || PALETTE[i % PALETTE.length],
            city: u.city || '—',
            type: u.type || 'Public',
            tuition: u.tuition || '—',
            ts: u.ts || 2,
            diff: diff,
            dl: (['','Open','Low','Competitive','Highly selective','Elite selective'][diff]) || 'Competitive',
            fields: u.fields || [],
            langs: u.langs || ['English'],
            founded: u.founded || null,
            students: u.students || '—',
            website: u.website || ''
        };
        mapped.desc = (u.desc && u.desc.indexOf('admin panel') === -1) ? u.desc : buildCustomDesc(mapped, code);
        return mapped;
    });
}

function loadCountry(code) {
    var gen = ++_loadCountryGen;
    fetch('data/' + code + '.json')
    .then(function(r) { if (!r.ok) throw new Error('Missing'); return r.json(); })
    .then(function(data) { applyCountryData(code, data, gen); })
    .catch(function() {
        // No data file for this country yet — still navigate to it with an empty state.
        applyCountryData(code, buildEmptyCountry(code), gen);
    });
}

// Minimal data shape for a country we can reach but don't have content for yet.
function buildEmptyCountry(code) {
    var nm = (typeof countryNameByCode === 'function') ? countryNameByCode(code) : code.toUpperCase();
    return {
        meta: { name: nm, code: code, flag: code, uniCount: 0, cityCount: 0 },
        universities: [], cities: {}, tips: [], cityCards: [], featuredCities: []
    };
}

function applyCountryData(code, data, gen) {
        if (gen !== _loadCountryGen) return;
        localStorage.setItem(COUNTRY_KEY, code);
        currentCountryCode = code;
        if (typeof addVisitedCountry === 'function') addVisitedCountry(code);
        if (typeof window.fyRefresh === 'function') window.fyRefresh();   // update matcher country label/destinations

        UNI = data.universities.concat(getCustomUnisForCountry(code));

        var flagWrap = document.getElementById('headerFlagWrap');
        var flagEl   = document.getElementById('headerFlag');
        var nameEl   = document.getElementById('headerCountryName');
        var flagCode = data.meta.flag || data.meta.code || code;
        var countryName = data.meta.name || data.meta.country || code.toUpperCase();
        if (flagEl)   flagEl.className       = 'mp__header__fi fi fi-' + flagCode;
        if (nameEl)   nameEl.textContent     = countryName;
        if (flagWrap) flagWrap.style.display = 'flex';

        document.getElementById('csFlag').className = 'mp__cs__flag fi fi-' + flagCode;
        document.getElementById('csName').textContent = countryName;
        document.querySelectorAll('.mp__cs__country').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.code === code);
        });
        var _csPicker = document.getElementById('csPicker');
        if (_csPicker) _csPicker.classList.remove('mp__cs__picker--open');
        csPickerOpen = false;
        document.getElementById('csChangeBtn').innerHTML = '<i class="fa-solid fa-sliders"></i> Change country';

        var heroSub = document.getElementById('heroSub');
        if (heroSub) heroSub.textContent = 'Explore universities in ' + countryName + ', compare options and track your applications.';

        var insightPct = document.getElementById('heroInsightPct');
        var insightUni = document.getElementById('heroInsightUni');
        if (insightPct) insightPct.textContent = UNI.length;
        if (insightUni) insightUni.textContent = 'universities in ' + countryName;
        var hTotal = document.getElementById('heroStatTotal');
        if (hTotal) hTotal.textContent = UNI.length;

        var statUniEl  = document.getElementById('statUnis');
        var statCityEl = document.getElementById('statCities');
        if (statUniEl)  statUniEl.textContent  = data.meta.uniCount  || UNI.length;
        if (statCityEl) statCityEl.textContent = data.meta.cityCount || Object.keys(data.cities).length;

        if (data.tips && data.tips.length) {
            var tipsGrid = document.querySelector('.mp__tips__grid');
            if (tipsGrid) {
                tipsGrid.innerHTML = data.tips.map(function(t) {
                    return '<div class="mp__tip">' +
                        '<div class="mp__tip__icon" style="background:' + t.color + ';color:' + t.iconColor + '"><i class="' + t.icon + '"></i></div>' +
                        '<h4>' + t.title + '</h4>' +
                        '<p>' + t.text + '</p>' +
                    '</div>';
                }).join('');
                var tipsSection = tipsGrid.closest('.mp__section');
                if (tipsSection) {
                    var sub = tipsSection.querySelector('.mp__section__sub');
                    if (sub) sub.textContent = 'Everything you need to know about studying in ' + countryName;
                }
            }
        }

        var cgHl  = document.querySelector('.cg__highlight');
        var cgSub = document.querySelector('.cg__hero__sub');
        if (cgHl)  cgHl.textContent = countryName;
        if (cgSub) cgSub.textContent = 'Explore ' + (data.meta.cityCount || Object.keys(data.cities).length) + ' vibrant cities across ' + countryName + ' — culture, costs, climate and live weather at your fingertips.';

        var expTagEl = document.getElementById('expHeroTag');
        var expSubEl = document.getElementById('expHeroSub');
        if (expTagEl) expTagEl.textContent = 'Find in ' + countryName;
        if (expSubEl) expSubEl.textContent = 'Search all ' + UNI.length + ' universities in ' + countryName + ' by name, city, field or language. Click any result for full details.';

        if (data.cityCards && data.cityCards.length) {
            var cgGrid = document.querySelector('.cg__city__grid');
            if (cgGrid) {
                cgGrid.innerHTML = data.cityCards.map(function(c) {
                    var statIcons = c.statIcons || ['fa-solid fa-users','fa-solid fa-coins','fa-solid fa-sun'];
                    return '<div class="cg__city__card">' +
                        '<div class="cg__card__top" style="background:' + c.gradient + '">' +
                            '<i class="' + c.icon + ' cg__card__icon"></i>' +
                            '<div class="cg__card__region">' + c.region + '</div>' +
                            '<div class="cg__card__cname">' + c.city + '</div>' +
                        '</div>' +
                        '<div class="cg__card__body">' +
                            '<p class="cg__card__desc">' + c.desc + '</p>' +
                            '<div class="cg__card__stats">' +
                                c.stats.map(function(s, i) {
                                    return '<div class="cg__card__stat"><i class="' + (statIcons[i]||'fa-solid fa-circle') + '"></i>' + s + '</div>';
                                }).join('') +
                            '</div>' +
                            '<div class="cg__card__tags">' + c.tags.map(function(t){ return '<span>' + t + '</span>'; }).join('') + '</div>' +
                            '<button class="cg__card__wxbtn" data-city="' + c.city + '"><i class="fa-solid fa-cloud-sun"></i> Check Live Weather</button>' +
                        '</div>' +
                    '</div>';
                }).join('');
                cgGrid.querySelectorAll('.cg__card__wxbtn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var city = btn.dataset.city;
                        var _wi = document.getElementById('wxCityInput');
                        if (_wi) _wi.value = city;
                        showCityInfo(city);
                        fetchWeather(city);
                        var _cws = document.getElementById('cgWeatherSection');
                        if (_cws) _cws.scrollIntoView({ behavior:'smooth', block:'start' });
                    });
                });
            }
        }

        if (data.featuredCities && data.featuredCities.length) {
            var featGrid = document.querySelector('.wx__feat__grid');
            if (featGrid) {
                featGrid.innerHTML = data.featuredCities.map(function(fc) {
                    return '<div class="wx__feat__card" data-city="' + fc.city + '">' +
                        '<i class="' + fc.icon + '"></i>' +
                        '<span class="wx__feat__name">' + fc.city + '</span>' +
                        '<span class="wx__feat__sub">' + fc.sub + '</span>' +
                    '</div>';
                }).join('');
                featGrid.querySelectorAll('.wx__feat__card').forEach(function(card) {
                    card.addEventListener('click', function() {
                        var city = card.dataset.city;
                        var _wi2 = document.getElementById('wxCityInput');
                        if (_wi2) _wi2.value = city;
                        showCityInfo(city);
                        fetchWeather(city);
                    });
                });
            }
        }

        var fCity = document.getElementById('fCity');
        if (fCity) {
            var cities = Object.keys(data.cities);
            fCity.innerHTML = '<option value="">All cities</option>' +
                cities.map(function(c){ return '<option>' + c + '</option>'; }).join('');
        }

        renderCompare();
        populateInsightSelects();
        renderSaved();
        var _ecr = document.getElementById('expChipResults');
        if (_ecr) _ecr.innerHTML = '';
        expActiveFilters = { field: '', lang: '', type: '', budget: '', city: '' };
        document.querySelectorAll('.exp__chip').forEach(function(c){ c.classList.remove('active'); });
        var _ecReset = document.getElementById('expChipReset');
        if (_ecReset) _ecReset.style.display = 'none';
        if (nsInput.value) { nsInput.value = ''; runHeroSearch(); }

        cmpVsSelected = { A: null, B: null };
        ['A','B'].forEach(function(slot) {
            var si = document.getElementById('cmpSearch' + slot);
            var ri = document.getElementById('cmpResults' + slot);
            var se = document.getElementById('cmpSelected' + slot);
            if (si) si.value = '';
            if (ri) ri.innerHTML = '';
            if (se) { se.style.display = 'none'; se.innerHTML = ''; }
        });
        renderVsComparison();

        renderSavedPlaces();
        updateStats();
        applyCountryTheme(code);
        buildRankCarousel(code);
        fetchCountryWeather(code);
        renderUpdatesFeed();
        updateDshWidgets();

        updateSliderRange();
        renderBudgetMatches();

        var _wci = document.getElementById('wxCityInfo');
        if (_wci) _wci.classList.remove('open');
        var _wf = document.getElementById('wxFeatured');
        if (_wf) _wf.style.display = 'block';
        var _wxi = document.getElementById('wxCityInput');
        if (_wxi) _wxi.value = '';

        if (data.cities) {
            Object.keys(data.cities).forEach(function(city) {
                if (!CITY_INFO[city]) {
                    CITY_INFO[city] = data.cities[city];
                }
            });
        }

        var pillsContainer = document.getElementById('cg2Pills');
        if (pillsContainer && data.cities) {
            var cityNames = Object.keys(data.cities).slice(0, 7);
            pillsContainer.innerHTML = cityNames.map(function(city) {
                var icon = (typeof CITY_PILL_ICONS !== 'undefined' && CITY_PILL_ICONS[city]) || 'fa-location-dot';
                return '<button class="cg2__pill" data-city="' + city + '"><i class="fa-solid ' + icon + '"></i><span>' + city + '</span></button>';
            }).join('');
            pillsContainer.querySelectorAll('.cg2__pill').forEach(function(btn) {
                btn.addEventListener('click', function() { cg2RenderCity(btn.dataset.city); });
            });
        }

        var _panel = document.getElementById('cg2Panel');
        if (_panel) { _panel.style.display = 'none'; _panel.classList.remove('cg2__panel--in'); }

        if (typeof COUNTRY_FAMOUS !== 'undefined' && COUNTRY_FAMOUS[code]) {
            var famous = COUNTRY_FAMOUS[code];
            var qText = document.getElementById('cg2QuoteText');
            var qName = document.getElementById('cg2QuoteName');
            var qRole = document.getElementById('cg2QuoteRole');
            var qInit = document.getElementById('cg2QuoteInitials');
            var qAvatar = document.getElementById('cg2QuoteAvatar');
            if (qText)   qText.textContent   = famous.quote;
            if (qName)   qName.textContent   = famous.name;
            if (qRole)   qRole.textContent   = famous.role;
            if (qInit)   qInit.textContent   = famous.initials;
            if (qAvatar) qAvatar.style.background = famous.color;
        }
}

var DL_REMINDED_KEY = 'us_dl_rem_'  + user.id;
var DL_DONE_KEY     = 'us_dl_done_' + user.id;
var DL_CUSTOM_KEY   = 'us_dl_cust_' + user.id;
var DL_PIN_KEY      = 'us_dl_pin_'  + user.id;

function getDlReminded() { try { return JSON.parse(localStorage.getItem(DL_REMINDED_KEY) || '[]'); } catch(e) { return []; } }
function setDlReminded(d){ localStorage.setItem(DL_REMINDED_KEY, JSON.stringify(d)); }
function getDlDone()     { try { return JSON.parse(localStorage.getItem(DL_DONE_KEY)     || '[]'); } catch(e) { return []; } }
function setDlDone(d)    { localStorage.setItem(DL_DONE_KEY,     JSON.stringify(d)); }
function getDlCustom()   { try { return JSON.parse(localStorage.getItem(DL_CUSTOM_KEY)   || '[]'); } catch(e) { return []; } }
function setDlCustom(d)  { localStorage.setItem(DL_CUSTOM_KEY,   JSON.stringify(d)); }
function getDlPin()      { return localStorage.getItem(DL_PIN_KEY) || null; }
function setDlPin(id)    { if (id === null) localStorage.removeItem(DL_PIN_KEY); else localStorage.setItem(DL_PIN_KEY, id); }

var DEADLINE_TYPES = {
    application:   { label:'Application',   icon:'fa-solid fa-file-pen',       color:'#e74c3c', bg:'rgba(231,76,60,.13)' },
    scholarship:   { label:'Scholarship',   icon:'fa-solid fa-medal',           color:'#27ae60', bg:'rgba(39,174,96,.13)' },
    openday:       { label:'Open Day',      icon:'fa-solid fa-calendar-check',  color:'#2980b9', bg:'rgba(41,128,185,.13)' },
    accommodation: { label:'Accommodation', icon:'fa-solid fa-house',           color:'#8e44ad', bg:'rgba(142,68,173,.13)' },
    interview:     { label:'Interview',     icon:'fa-solid fa-user-tie',        color:'#d97c14', bg:'rgba(217,124,20,.13)' },
    other:         { label:'Reminder',      icon:'fa-solid fa-star',            color:'#6c63ff', bg:'rgba(108,99,255,.13)' },
};

var DEADLINES = [

    { id:'d_app_ucm',        uniId:'ucm',        uniName:'Univ. Complutense de Madrid',       uniAbbr:'UCM',   uniColor:'#8B1A1A', type:'application',   title:'Undergraduate Applications 2025/26',         date:'2026-06-30', country:'es' },
    { id:'d_app_ub',         uniId:'ub',         uniName:'Universidad de Barcelona',           uniAbbr:'UB',    uniColor:'#005691', type:'application',   title:'Erasmus+ Application Window Closes',         date:'2026-05-20', country:'es' },
    { id:'d_app_upv',        uniId:'upv',        uniName:'Univ. Politécnica de Valencia',      uniAbbr:'UPV',   uniColor:'#E5007A', type:'application',   title:'Pre-enrolment: Engineering Degrees',         date:'2026-06-20', country:'es' },
    { id:'d_app_upf',        uniId:'upf',        uniName:'Universidad Pompeu Fabra',           uniAbbr:'UPF',   uniColor:'#CC2529', type:'application',   title:'International Student Applications Open',    date:'2026-05-30', country:'es' },
    { id:'d_app_ie',         uniId:'ie',         uniName:'IE University',                      uniAbbr:'IE',    uniColor:'#1A1A2E', type:'application',   title:'IE University International Intake 2026',    date:'2026-06-01', country:'es' },
    { id:'d_app_oxford',     uniId:'oxford',     uniName:'University of Oxford',               uniAbbr:'OXF',   uniColor:'#002147', type:'application',   title:'Graduate Applications — Michaelmas 2026',    date:'2026-10-01', country:'gb' },
    { id:'d_app_ucl',        uniId:'ucl',        uniName:'University College London',          uniAbbr:'UCL',   uniColor:'#500778', type:'application',   title:'UCAS Undergraduate Deadline',                date:'2027-01-29', country:'gb' },
    { id:'d_app_cambridge',  uniId:'cambridge',  uniName:'University of Cambridge',            uniAbbr:'CAM',   uniColor:'#003B5C', type:'application',   title:'Undergraduate UCAS Deadline',                date:'2026-10-15', country:'gb' },
    { id:'d_app_manchester',  uniId:'manchester', uniName:'University of Manchester',          uniAbbr:'MAN',   uniColor:'#660099', type:'application',   title:'Postgraduate Applications — Autumn Intake',  date:'2026-07-01', country:'gb' },
    { id:'d_app_lmu',        uniId:'lmu',        uniName:'Ludwig Maximilian Universität',      uniAbbr:'LMU',   uniColor:'#005B99', type:'application',   title:'Winter Semester International Applications',  date:'2026-07-15', country:'de' },
    { id:'d_app_tum',        uniId:'tum',        uniName:'TU München',                         uniAbbr:'TUM',   uniColor:'#0065BD', type:'application',   title:'TUM International Graduate Applications',     date:'2026-05-31', country:'de' },
    { id:'d_app_sorbonne',   uniId:'sorbonne',   uniName:'Sorbonne Université',                uniAbbr:'SRB',   uniColor:'#003189', type:'application',   title:'Campus France Registration (non-EU)',         date:'2026-12-02', country:'fr' },
    { id:'d_app_sciencespo', uniId:'sciencespo', uniName:'Sciences Po',                        uniAbbr:'SCP',   uniColor:'#C8102E', type:'application',   title:'Sciences Po International Applications',      date:'2026-05-15', country:'fr' },
    { id:'d_app_sapienza',   uniId:'sapienza',   uniName:'Sapienza Università di Roma',        uniAbbr:'SAP',   uniColor:'#782A2A', type:'application',   title:'Universitaly Applications 2025/26',           date:'2026-07-31', country:'it' },
    { id:'d_app_bocconi',    uniId:'bocconi',    uniName:'Bocconi University',                 uniAbbr:'BOC',   uniColor:'#1B3A6B', type:'application',   title:'International Undergraduate Applications',    date:'2026-06-15', country:'it' },
    { id:'d_app_ulisboa',    uniId:'ulisboa',    uniName:'Universidade de Lisboa',             uniAbbr:'UL',    uniColor:'#003A6B', type:'application',   title:'International Applications 2025/26',          date:'2026-07-31', country:'pt' },
    { id:'d_app_porto',      uniId:'porto',      uniName:'Universidade do Porto',              uniAbbr:'UP',    uniColor:'#00539B', type:'application',   title:'Postgraduate International Applications',     date:'2026-06-30', country:'pt' },

    { id:'d_sch_uam',        uniId:'uam',        uniName:'Univ. Autónoma de Madrid',           uniAbbr:'UAM',   uniColor:'#2A5CAA', type:'scholarship',   title:'Excellence Scholarship — €3,000',             date:'2026-07-01', country:'es' },
    { id:'d_sch_ie',         uniId:'ie',         uniName:'IE University',                      uniAbbr:'IE',    uniColor:'#1A1A2E', type:'scholarship',   title:'Merit Scholarship — Up to 40% Tuition',       date:'2026-06-15', country:'es' },
    { id:'d_sch_upc',        uniId:'upc',        uniName:'Univ. Politècnica de Catalunya',     uniAbbr:'UPC',   uniColor:'#0057A8', type:'scholarship',   title:'PhD Scholarships: Robotics & Automation',     date:'2026-05-10', country:'es' },
    { id:'d_sch_usal',       uniId:'usal',       uniName:'Universidad de Salamanca',           uniAbbr:'USAL',  uniColor:'#A0001E', type:'scholarship',   title:'USAL Global Scholarship — Full Tuition',      date:'2026-06-05', country:'es' },
    { id:'d_sch_uab',        uniId:'uab',        uniName:'Univ. Autónoma de Barcelona',        uniAbbr:'UAB',   uniColor:'#006400', type:'scholarship',   title:'International Excellence Grant',               date:'2026-05-25', country:'es' },
    { id:'d_sch_cambridge',  uniId:'cambridge',  uniName:'University of Cambridge',            uniAbbr:'CAM',   uniColor:'#003B5C', type:'scholarship',   title:'Gates Cambridge Scholarships 2026',           date:'2026-10-12', country:'gb' },
    { id:'d_sch_ucl',        uniId:'ucl',        uniName:'University College London',          uniAbbr:'UCL',   uniColor:'#500778', type:'scholarship',   title:'UCL Global Excellence Scholarships — £10k',   date:'2026-06-01', country:'gb' },
    { id:'d_sch_edinburgh',  uniId:'edinburgh',  uniName:'University of Edinburgh',            uniAbbr:'UoE',   uniColor:'#00325F', type:'scholarship',   title:'Edinburgh Global Undergraduate — £6,000',     date:'2027-03-01', country:'gb' },
    { id:'d_sch_lse',        uniId:'lse',        uniName:'London School of Economics',         uniAbbr:'LSE',   uniColor:'#A50034', type:'scholarship',   title:'LSE Graduate Support Scheme',                 date:'2026-05-01', country:'gb' },
    { id:'d_sch_tum',        uniId:'tum',        uniName:'TU München',                         uniAbbr:'TUM',   uniColor:'#0065BD', type:'scholarship',   title:'DAAD Scholarship — €850/month',               date:'2026-05-15', country:'de' },
    { id:'d_sch_heidelberg', uniId:'heidelberg', uniName:'Heidelberg University',              uniAbbr:'HEI',   uniColor:'#CC0000', type:'scholarship',   title:'Heidelberg Excellence Initiative Grants',     date:'2026-06-30', country:'de' },
    { id:'d_sch_sciencespo', uniId:'sciencespo', uniName:'Sciences Po',                        uniAbbr:'SCP',   uniColor:'#C8102E', type:'scholarship',   title:'Emile Boutmy Scholarship — Full Tuition',     date:'2027-01-05', country:'fr' },
    { id:'d_sch_hec',        uniId:'hec',        uniName:'HEC Paris',                          uniAbbr:'HEC',   uniColor:'#003189', type:'scholarship',   title:'HEC Foundation Scholarships — MBA',           date:'2026-07-15', country:'fr' },
    { id:'d_sch_bocconi',    uniId:'bocconi',    uniName:'Bocconi University',                 uniAbbr:'BOC',   uniColor:'#1B3A6B', type:'scholarship',   title:'Bocconi Merit Awards — Applications Open',    date:'2026-10-01', country:'it' },
    { id:'d_sch_polimi',     uniId:'polimi',     uniName:'Politecnico di Milano',              uniAbbr:'PMI',   uniColor:'#0066B3', type:'scholarship',   title:'PoliMi International Merit Scholarships',     date:'2026-05-31', country:'it' },
    { id:'d_sch_nova',       uniId:'nova',       uniName:'Universidade NOVA de Lisboa',        uniAbbr:'NOV',   uniColor:'#003264', type:'scholarship',   title:'NOVA Excellence Scholarship — 50% Off',       date:'2026-06-20', country:'pt' },

    { id:'d_od_ucm',         uniId:'ucm',        uniName:'Univ. Complutense de Madrid',        uniAbbr:'UCM',   uniColor:'#8B1A1A', type:'openday',       title:'Virtual Open Day — Faculty Q&A Sessions',    date:'2026-05-15', country:'es' },
    { id:'d_od_urjc',        uniId:'urjc',       uniName:'Univ. Rey Juan Carlos',              uniAbbr:'URJC',  uniColor:'#9B1B30', type:'openday',       title:'Campus Open Days — Saturdays in May',        date:'2026-05-30', country:'es' },
    { id:'d_od_ug',          uniId:'ug',         uniName:'Universidad de Granada',             uniAbbr:'UGR',   uniColor:'#6B0F1A', type:'openday',       title:'Alhambra Campus Day — Free Registration',    date:'2026-05-22', country:'es' },
    { id:'d_od_esade',       uniId:'esade',      uniName:'ESADE Business School',              uniAbbr:'ESADE', uniColor:'#002060', type:'openday',       title:'MBA Open Evening — Barcelona',                date:'2026-05-22', country:'es' },
    { id:'d_od_ub',          uniId:'ub',         uniName:'Universidad de Barcelona',           uniAbbr:'UB',    uniColor:'#005691', type:'openday',       title:'UB Campus Discovery Day',                    date:'2026-05-28', country:'es' },
    { id:'d_od_oxford',      uniId:'oxford',     uniName:'University of Oxford',               uniAbbr:'OXF',   uniColor:'#002147', type:'openday',       title:'Oxford Open Days — Summer 2026',              date:'2026-06-24', country:'gb' },
    { id:'d_od_cambridge',   uniId:'cambridge',  uniName:'University of Cambridge',            uniAbbr:'CAM',   uniColor:'#003B5C', type:'openday',       title:'Undergraduate Open Days',                     date:'2026-07-02', country:'gb' },
    { id:'d_od_lse',         uniId:'lse',        uniName:'London School of Economics',         uniAbbr:'LSE',   uniColor:'#A50034', type:'openday',       title:'LSE Undergraduate Open Day',                  date:'2026-06-21', country:'gb' },
    { id:'d_od_imperial',    uniId:'imperial',   uniName:'Imperial College London',            uniAbbr:'ICL',   uniColor:'#003E74', type:'openday',       title:'Imperial College Open Day',                   date:'2026-06-20', country:'gb' },
    { id:'d_od_hec',         uniId:'hec',        uniName:'HEC Paris',                          uniAbbr:'HEC',   uniColor:'#003189', type:'openday',       title:'MBA Virtual Information Session',             date:'2026-05-18', country:'fr' },
    { id:'d_od_polytechnique',uniId:'polytechnique',uniName:'École Polytechnique',             uniAbbr:'ΕΡΧ',   uniColor:'#003189', type:'openday',       title:'Campus Visit & Open Day',                     date:'2026-06-05', country:'fr' },
    { id:'d_od_polimi',      uniId:'polimi',     uniName:'Politecnico di Milano',              uniAbbr:'PMI',   uniColor:'#0066B3', type:'openday',       title:'Campus Tour Days — Book Online',              date:'2026-05-29', country:'it' },

    { id:'d_acc_ucm',        uniId:'ucm',        uniName:'Univ. Complutense de Madrid',        uniAbbr:'UCM',   uniColor:'#8B1A1A', type:'accommodation', title:'Student Halls — Priority Application Closes', date:'2026-05-31', country:'es' },
    { id:'d_acc_upm',        uniId:'upm',        uniName:'Univ. Politécnica de Madrid',        uniAbbr:'UPM',   uniColor:'#004B87', type:'accommodation', title:'RESA Residence Priority Booking',             date:'2026-06-15', country:'es' },
    { id:'d_acc_ub',         uniId:'ub',         uniName:'Universidad de Barcelona',           uniAbbr:'UB',    uniColor:'#005691', type:'accommodation', title:'UB Residence Hall Early Applications',        date:'2026-06-01', country:'es' },
    { id:'d_acc_oxford',     uniId:'oxford',     uniName:'University of Oxford',               uniAbbr:'OXF',   uniColor:'#002147', type:'accommodation', title:'College Accommodation Allocation Deadline',   date:'2026-08-01', country:'gb' },
    { id:'d_acc_ucl',        uniId:'ucl',        uniName:'University College London',          uniAbbr:'UCL',   uniColor:'#500778', type:'accommodation', title:'UCL Student Halls Application Deadline',      date:'2026-07-01', country:'gb' },
    { id:'d_acc_lse',        uniId:'lse',        uniName:'London School of Economics',         uniAbbr:'LSE',   uniColor:'#A50034', type:'accommodation', title:'LSE Intercollegiate Halls — Apply Early',     date:'2026-07-15', country:'gb' },
    { id:'d_acc_tum',        uniId:'tum',        uniName:'TU München',                         uniAbbr:'TUM',   uniColor:'#0065BD', type:'accommodation', title:'Studentenwerk Munich Housing Application',    date:'2026-06-30', country:'de' },
    { id:'d_acc_sapienza',   uniId:'sapienza',   uniName:'Sapienza Università di Roma',        uniAbbr:'SAP',   uniColor:'#782A2A', type:'accommodation', title:'Campus Residences Priority Application',      date:'2026-06-01', country:'it' },

    { id:'d_int_ie',         uniId:'ie',         uniName:'IE University',                      uniAbbr:'IE',    uniColor:'#1A1A2E', type:'interview',     title:'IE University Admissions Assessment',         date:'2026-05-20', country:'es' },
    { id:'d_int_esade',      uniId:'esade',      uniName:'ESADE Business School',              uniAbbr:'ESADE', uniColor:'#002060', type:'interview',     title:'ESADE MBA Assessment Day — Barcelona',        date:'2026-06-10', country:'es' },
    { id:'d_int_oxford',     uniId:'oxford',     uniName:'University of Oxford',               uniAbbr:'OXF',   uniColor:'#002147', type:'interview',     title:'Graduate Admissions Interview Window',         date:'2026-11-01', country:'gb' },
    { id:'d_int_cambridge',  uniId:'cambridge',  uniName:'University of Cambridge',            uniAbbr:'CAM',   uniColor:'#003B5C', type:'interview',     title:'Cambridge Admissions Interviews',              date:'2026-12-01', country:'gb' },
    { id:'d_int_lse',        uniId:'lse',        uniName:'London School of Economics',         uniAbbr:'LSE',   uniColor:'#A50034', type:'interview',     title:'LSE PhD Programme Interviews',                date:'2026-09-15', country:'gb' },
    { id:'d_int_imperial',   uniId:'imperial',   uniName:'Imperial College London',            uniAbbr:'ICL',   uniColor:'#003E74', type:'interview',     title:'Imperial PhD Interview Days',                 date:'2026-05-15', country:'gb' },
    { id:'d_int_sciencespo', uniId:'sciencespo', uniName:'Sciences Po',                        uniAbbr:'SCP',   uniColor:'#C8102E', type:'interview',     title:'Sciences Po Entrance Assessment',              date:'2026-04-25', country:'fr' },
    { id:'d_int_hec',        uniId:'hec',        uniName:'HEC Paris',                          uniAbbr:'HEC',   uniColor:'#003189', type:'interview',     title:'HEC Paris MBA Interview Round',               date:'2026-05-30', country:'fr' },
    { id:'d_int_bocconi',    uniId:'bocconi',    uniName:'Bocconi University',                 uniAbbr:'BOC',   uniColor:'#1B3A6B', type:'interview',     title:'Bocconi International Selection Tests',       date:'2026-05-08', country:'it' },
    { id:'d_int_tum',        uniId:'tum',        uniName:'TU München',                         uniAbbr:'TUM',   uniColor:'#0065BD', type:'interview',     title:'TUM Graduate School Admission Interviews',    date:'2026-06-01', country:'de' },
];

var dlActiveCat  = 'all';
var dlSavedOnly  = false;

function getCountdown(dateStr) {
    var target = new Date(dateStr + 'T23:59:59');
    var now    = new Date();
    var diff   = target - now;
    if (diff < 0) {
        var od = Math.ceil(-diff / 864e5);
        return { label: od + 'd overdue', urgency: 'overdue', days: -od };
    }
    var days  = Math.floor(diff / 864e5);
    var hours = Math.floor((diff % 864e5) / 36e5);
    if (days === 0) return { label: hours > 0 ? hours + 'h left' : '< 1h left', urgency: 'today', days: 0 };
    if (days === 1) return { label: '1 day left',            urgency: 'today',  days: 1  };
    if (days <= 7)  return { label: days + ' days left',     urgency: 'week',   days: days };
    if (days <= 30) return { label: days + ' days left',     urgency: 'month',  days: days };
    return              { label: days + ' days left',     urgency: 'future', days: days };
}

function formatDlDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
}

function getVisibleDeadlines() {
    var saved    = getSaved();
    var reminded = getDlReminded();
    var done     = getDlDone();
    var custom   = getDlCustom();
    var cat      = dlActiveCat;

    var builtin = DEADLINES.filter(function(d) { return d.country === currentCountryCode; });

    if (dlSavedOnly) {
        builtin = builtin.filter(function(d) { return saved.indexOf(d.uniId) !== -1; });
    }

    if (cat === 'personal') {
        builtin = builtin.filter(function(d) { return reminded.indexOf(d.id) !== -1; });
    } else if (cat !== 'all') {
        builtin = builtin.filter(function(d) { return d.type === cat; });
    }

    var filteredCustom = custom.filter(function(d) {
        if (cat === 'all' || cat === 'personal') return true;
        return d.type === cat;
    });

    var all = builtin.map(function(d) {
        return { id:d.id, uniId:d.uniId, uniName:d.uniName, uniAbbr:d.uniAbbr, uniColor:d.uniColor,
                 type:d.type, title:d.title, date:d.date, notes:d.notes||null,
                 personal: reminded.indexOf(d.id) !== -1,
                 done:     done.indexOf(d.id) !== -1, custom: false };
    }).concat(filteredCustom.map(function(d) {
        return { id:d.id, uniId:null, uniName:d.uniName||null, uniAbbr:'★', uniColor:'#6c63ff',
                 type:d.type, title:d.title, date:d.date, notes:d.notes||null,
                 personal:true, done: done.indexOf(d.id) !== -1, custom:true };
    }));

    all.sort(function(a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return new Date(a.date) - new Date(b.date);
    });
    return all;
}

function buildDeadlineCard(d) {
    var cd  = getCountdown(d.date);
    var dt  = DEADLINE_TYPES[d.type] || DEADLINE_TYPES.other;
    var rem = getDlReminded();
    var isRem    = rem.indexOf(d.id) !== -1;
    var isPinned = getDlPin() === d.id;
    var cdCls = 'dl__cd--' + (d.done ? 'done' : cd.urgency);
    var uniDisplay = d.uniName || 'Personal Reminder';
    var abbr = (d.uniAbbr || '★').slice(0, 4);

    var cdNum = d.done ? '✓' : (cd.days === 0 ? '!' : Math.abs(cd.days));
    var cdLbl = d.done ? 'Done' : cd.label;

    return '<div class="dl__card' + (d.done ? ' dl__card--done' : ' dl__card--urgency-' + cd.urgency) + (isPinned ? ' dl__card--pinned' : '') + '" data-id="' + d.id + '">' +
        '<button class="dl__complete__btn' + (d.done ? ' done' : '') + '" data-id="' + d.id + '" title="' + (d.done ? 'Mark incomplete' : 'Mark complete') + '">' +
            '<i class="fa-' + (d.done ? 'solid' : 'regular') + ' fa-circle-check"></i>' +
        '</button>' +
        '<div class="dl__card__body">' +
            '<div class="dl__card__meta">' +
                '<div class="dl__card__abbr" style="background:' + d.uniColor + '">' + abbr + '</div>' +
                '<span class="dl__card__uname">' + uniDisplay + '</span>' +
                '<span class="dl__type__badge" style="background:' + dt.bg + ';color:' + dt.color + '">' +
                    '<i class="' + dt.icon + '"></i> ' + dt.label +
                '</span>' +
            '</div>' +
            '<div class="dl__card__title">' + d.title + '</div>' +
            (d.notes ? '<div class="dl__card__notes">' + d.notes + '</div>' : '') +
            '<div class="dl__card__date__row">' +
                '<i class="fa-regular fa-calendar"></i> ' + formatDlDate(d.date) +
                (isPinned ? ' <span class="dl__pin__label"><i class="fa-solid fa-thumbtack"></i> Pinned to overview</span>' : '') +
            '</div>' +
        '</div>' +
        '<div class="dl__card__right">' +
            '<div class="dl__countdown ' + cdCls + '">' +
                '<div class="dl__cd__num">' + cdNum + '</div>' +
                '<div class="dl__cd__lbl">' + cdLbl + '</div>' +
            '</div>' +
            '<div class="dl__card__actions">' +
                '<button class="dl__pin__btn' + (isPinned ? ' active' : '') + '" data-id="' + d.id + '" title="' + (isPinned ? 'Unpin from overview' : 'Pin to overview widget') + '"><i class="fa-' + (isPinned ? 'solid' : 'regular') + ' fa-thumbtack"></i></button>' +
                (!d.custom ? '<button class="dl__remind__btn' + (isRem ? ' active' : '') + '" data-id="' + d.id + '" title="' + (isRem ? 'Remove reminder' : 'Add to reminders') + '">' +
                    '<i class="fa-' + (isRem ? 'solid' : 'regular') + ' fa-bell"></i>' +
                '</button>' : '') +
                (d.custom ? '<button class="dl__del__btn" data-id="' + d.id + '" title="Delete"><i class="fa-solid fa-trash-can"></i></button>' : '') +
            '</div>' +
        '</div>' +
    '</div>';
}

function renderDeadlines() {
    var dlList  = document.getElementById('dlList');
    var dlEmpty = document.getElementById('dlEmpty');
    if (!dlList) return;

    var items = getVisibleDeadlines();
    var nonDone   = items.filter(function(d) { return !d.done; });
    var completed = items.filter(function(d) { return d.done; });

    var overdue = nonDone.filter(function(d) { return getCountdown(d.date).urgency === 'overdue'; });
    var today   = nonDone.filter(function(d) { return getCountdown(d.date).urgency === 'today';   });
    var week    = nonDone.filter(function(d) { return getCountdown(d.date).urgency === 'week';    });
    var month   = nonDone.filter(function(d) { return getCountdown(d.date).urgency === 'month';   });

    var safeNum = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    safeNum('dlCntOverdue', overdue.length);
    safeNum('dlCntSoon',    today.length + week.length);
    safeNum('dlCntMonth',   month.length);
    safeNum('dlCntDone',    completed.length);

    if (!items.length) {
        dlList.innerHTML = '';
        if (dlEmpty) dlEmpty.style.display = 'flex';
        return;
    }
    if (dlEmpty) dlEmpty.style.display = 'none';

    var uniGroups = {};
    var uniOrder  = [];
    nonDone.forEach(function(d) {
        var key = d.uniName || 'Personal Reminders';
        if (!uniGroups[key]) {
            uniGroups[key] = { name: key, abbr: d.uniAbbr || '★', color: d.uniColor || '#6c63ff', urgent: [], upcoming: [] };
            uniOrder.push(key);
        }
        var urg = getCountdown(d.date).urgency;
        if (urg === 'future') {
            uniGroups[key].upcoming.push(d);
        } else {
            uniGroups[key].urgent.push(d);
        }
    });

    uniOrder.sort(function(a, b) {
        var ga = uniGroups[a], gb = uniGroups[b];
        var aAll = ga.urgent.concat(ga.upcoming);
        var bAll = gb.urgent.concat(gb.upcoming);
        var aMin = aAll.length ? Math.min.apply(null, aAll.map(function(d){ return new Date(d.date).getTime(); })) : Infinity;
        var bMin = bAll.length ? Math.min.apply(null, bAll.map(function(d){ return new Date(d.date).getTime(); })) : Infinity;
        return aMin - bMin;
    });

    function buildSubSection(label, iconCls, cls, deadlines) {
        if (!deadlines.length) return '';
        return '<div class="dl__subsec dl__subsec--' + cls + '">' +
            '<div class="dl__subsec__hd">' +
                '<i class="' + iconCls + '"></i>' + label +
                '<span class="dl__subsec__count">' + deadlines.length + '</span>' +
            '</div>' +
            deadlines.map(buildDeadlineCard).join('') +
        '</div>';
    }

    var html = '';
    uniOrder.forEach(function(key) {
        var g = uniGroups[key];
        var abbr = (g.abbr || '★').slice(0, 4);
        var total = g.urgent.length + g.upcoming.length;
        html += '<div class="dl__uni__group">' +
            '<div class="dl__uni__group__hd">' +
                '<div class="dl__uni__group__badge" style="background:' + g.color + '">' + abbr + '</div>' +
                '<span class="dl__uni__group__name">' + g.name + '</span>' +
                '<span class="dl__uni__group__total">' + total + ' deadline' + (total !== 1 ? 's' : '') + '</span>' +
            '</div>' +
            buildSubSection('Overdue &amp; This Month', 'fa-solid fa-triangle-exclamation', 'urgent', g.urgent) +
            buildSubSection('Upcoming', 'fa-solid fa-calendar', 'upcoming', g.upcoming) +
        '</div>';
    });

    if (completed.length) {
        html += '<div class="dl__section dl__section--done">' +
            '<div class="dl__section__hd">' +
                '<i class="fa-solid fa-circle-check"></i> Completed' +
                '<span class="dl__section__count">' + completed.length + '</span>' +
            '</div>' +
            completed.map(buildDeadlineCard).join('') +
        '</div>';
    }

    dlList.innerHTML = html;

    dlList.querySelectorAll('.dl__complete__btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.dataset.id;
            var d  = getDlDone();
            var idx = d.indexOf(id);
            if (idx === -1) d.push(id); else d.splice(idx, 1);
            setDlDone(d);

            btn.classList.add('pulse');
            btn.addEventListener('animationend', function(){ btn.classList.remove('pulse'); }, { once: true });
            setTimeout(renderDeadlines, 220);
        });
    });

    dlList.querySelectorAll('.dl__remind__btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.dataset.id;
            var r  = getDlReminded();
            var idx = r.indexOf(id);
            if (idx === -1) { r.push(id); btn.classList.add('active'); btn.title = 'Remove reminder'; btn.querySelector('i').className = 'fa-solid fa-bell'; }
            else            { r.splice(idx, 1); btn.classList.remove('active'); btn.title = 'Add to reminders'; btn.querySelector('i').className = 'fa-regular fa-bell'; }
            setDlReminded(r);
            btn.classList.add('pulse');
            btn.addEventListener('animationend', function(){ btn.classList.remove('pulse'); }, { once: true });
        });
    });

    dlList.querySelectorAll('.dl__del__btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.dataset.id;
            if (getDlPin() === id) setDlPin(null);
            setDlCustom(getDlCustom().filter(function(d) { return d.id !== id; }));
            setDlDone(getDlDone().filter(function(x) { return x !== id; }));
            updateDshWidgets();
            renderDeadlines();
        });
    });

    dlList.querySelectorAll('.dl__pin__btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.dataset.id;
            setDlPin(getDlPin() === id ? null : id);
            updateDshWidgets();
            renderDeadlines();
        });
    });
}

document.querySelectorAll('.dl__cat').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.dl__cat').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        dlActiveCat = btn.dataset.cat;
        renderDeadlines();
    });
});

var dlSavedOnlyEl = document.getElementById('dlSavedOnly');
if (dlSavedOnlyEl) {
    dlSavedOnlyEl.addEventListener('change', function() {
        dlSavedOnly = this.checked;
        renderDeadlines();
    });
}

var dlAddOverlay = document.getElementById('dlAddOverlay');

function openDlModal() {
    dlAddOverlay.classList.add('open');
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('dlDate').min = today;
    document.getElementById('dlDate').value = '';
}
function closeDlModal() {
    dlAddOverlay.classList.remove('open');
    document.getElementById('dlAddErr').textContent = '';
    ['dlTitle','dlUniName','dlNotes','dlDate'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('dlType').value = 'application';
}

document.getElementById('dlAddBtn').addEventListener('click', openDlModal);
document.getElementById('dlEmptyAddBtn').addEventListener('click', openDlModal);
document.getElementById('dlAddClose').addEventListener('click', closeDlModal);
dlAddOverlay.addEventListener('click', function(e) { if (e.target === dlAddOverlay) closeDlModal(); });

// Save an event to Deadlines from a UniScout email link:
//   mainPage.html?dl_add=1&dl_title=..&dl_date=YYYY-MM-DD&dl_uni=..&dl_type=..
(function handleEmailDeadlineLink() {
    var p = new URLSearchParams(location.search);
    if (p.get('dl_add') !== '1') return;
    var title = (p.get('dl_title') || '').trim().slice(0, 160);
    var date  = (p.get('dl_date') || '').trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    var allowed = ['application', 'scholarship', 'openday', 'accommodation', 'interview', 'other'];
    var type = allowed.indexOf(p.get('dl_type')) !== -1 ? p.get('dl_type') : 'other';
    var uni = (p.get('dl_uni') || '').trim().slice(0, 120) || null;

    var custom = getDlCustom();
    if (!custom.some(function(d) { return d.title === title && d.date === date; })) {
        custom.push({ id: 'cust_' + Date.now(), uniName: uni, type: type, title: title, date: date, notes: 'Saved from UniScout email' });
        setDlCustom(custom);
    }
    history.replaceState({}, '', location.pathname);
    if (typeof showTab === 'function') showTab('tracker');
    if (typeof renderDeadlines === 'function') renderDeadlines();

    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:6000;display:flex;align-items:center;gap:9px;' +
        'padding:13px 20px;border-radius:13px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;color:#fff;' +
        'box-shadow:0 10px 30px rgba(0,0,0,.25);background:linear-gradient(135deg,#27ae60,#1e8e4f);animation:arIn .3s ease both';
    bar.innerHTML = '<i class="fa-regular fa-calendar-check"></i> Saved to your Deadlines';
    document.body.appendChild(bar);
    setTimeout(function() { bar.style.transition = 'opacity .4s'; bar.style.opacity = '0'; setTimeout(function() { bar.remove(); }, 400); }, 3500);
}());

document.getElementById('dlAddSave').addEventListener('click', function() {
    var title = document.getElementById('dlTitle').value.trim();
    var type  = document.getElementById('dlType').value;
    var uni   = document.getElementById('dlUniName').value.trim();
    var date  = document.getElementById('dlDate').value;
    var notes = document.getElementById('dlNotes').value.trim();
    if (!title) { document.getElementById('dlAddErr').textContent = 'Please enter a title.'; return; }
    if (!date)  { document.getElementById('dlAddErr').textContent = 'Please select a date.'; return; }
    var custom = getDlCustom();
    custom.push({ id:'cust_'+Date.now(), uniName:uni||null, type:type, title:title, date:date, notes:notes||null });
    setDlCustom(custom);
    closeDlModal();
    renderDeadlines();
});

document.querySelector('.mp__nav__btn[data-tab="tracker"]').addEventListener('click', function() {
    setTimeout(renderDeadlines, 40);
});

renderDeadlines();

setInterval(renderDeadlines, 60000);

var SALARY_DATA = {

    ucm:   { p3:72, p5:38, p10:12, p30:2  },
    uam:   { p3:74, p5:40, p10:14, p30:2  },
    upm:   { p3:85, p5:55, p10:18, p30:3  },
    uc3m:  { p3:82, p5:52, p10:16, p30:3  },
    urjc:  { p3:65, p5:30, p10:8,  p30:1  },
    ub:    { p3:70, p5:36, p10:11, p30:2  },
    uab:   { p3:72, p5:38, p10:12, p30:2  },
    upf:   { p3:80, p5:52, p10:18, p30:3  },
    upc:   { p3:84, p5:56, p10:20, p30:4  },
    uv:    { p3:68, p5:33, p10:9,  p30:1  },
    upv:   { p3:83, p5:54, p10:17, p30:3  },
    us:    { p3:67, p5:31, p10:9,  p30:1  },
    ug:    { p3:65, p5:29, p10:8,  p30:1  },
    usal:  { p3:64, p5:28, p10:8,  p30:1  },
    ehu:   { p3:73, p5:39, p10:13, p30:2  },

    ie:    { p3:95, p5:82, p10:45, p30:12 },
    esade: { p3:96, p5:85, p10:52, p30:15 },
    deusto:{ p3:80, p5:48, p10:15, p30:3  },

    oxford:    { p3:92, p5:75, p10:40, p30:10 },
    cambridge: { p3:93, p5:77, p10:42, p30:11 },
    imperial:  { p3:94, p5:80, p10:38, p30:8  },
    ucl:       { p3:90, p5:72, p10:35, p30:8  },
    lse:       { p3:94, p5:82, p10:48, p30:14 },
    kcl:       { p3:88, p5:68, p10:30, p30:7  },
    edinburgh: { p3:87, p5:65, p10:28, p30:6  },
    manchester:{ p3:86, p5:63, p10:27, p30:5  },

    sorbonne:     { p3:75, p5:45, p10:16, p30:3  },
    sciencespo:   { p3:92, p5:78, p10:42, p30:12 },
    polytechnique:{ p3:96, p5:88, p10:55, p30:18 },
    hec:          { p3:97, p5:90, p10:62, p30:22 },

    lmu:       { p3:82, p5:55, p10:22, p30:4  },
    tum:       { p3:90, p5:70, p10:30, p30:6  },
    heidelberg:{ p3:84, p5:58, p10:24, p30:5  },

    sapienza:{ p3:65, p5:32, p10:10, p30:2  },
    bocconi: { p3:93, p5:80, p10:48, p30:15 },
    polimi:  { p3:88, p5:65, p10:28, p30:5  },

    ulisboa: { p3:62, p5:28, p10:8,  p30:1  },
    nova:    { p3:75, p5:44, p10:15, p30:3  },
    porto:   { p3:68, p5:33, p10:10, p30:2  },
};

var FIELD_BONUS = {
    engineering: { p3:+5,  p5:+8,  p10:+6,  p30:+2  },
    finance:     { p3:+3,  p5:+10, p10:+14, p30:+8  },
    medicine:    { p3:+8,  p5:+10, p10:+8,  p30:+2  },
    law:         { p3:+4,  p5:+8,  p10:+10, p30:+4  },
    arts:        { p3:-8,  p5:-12, p10:-6,  p30:-1  },
};

var ADM_PARAMS = {
    1: { thresh:30, k:0.12 },
    2: { thresh:50, k:0.16 },
    3: { thresh:65, k:0.22 },
    4: { thresh:75, k:0.30 },
    5: { thresh:82, k:0.40 },
};

function cap(v) { return Math.min(99, Math.max(1, Math.round(v))); }
function sigmoid(grade, thresh, k) {
    return Math.round(100 / (1 + Math.exp(-k * (grade - thresh))));
}

function populateInsightSelects() {

    var salInput = document.getElementById('salUniInput');
    var admInput = document.getElementById('admUniInput');
    var salHid   = document.getElementById('salUni');
    var admHid   = document.getElementById('admUni');
    if (salInput) salInput.value = '';
    if (admInput) admInput.value = '';
    if (salHid)  salHid.value  = '';
    if (admHid)  admHid.value  = '';
}

document.getElementById('salCalcBtn').addEventListener('click', function() {
    var uniId = document.getElementById('salUni').value;
    var field = document.getElementById('salField').value;
    var resultEl = document.getElementById('salResult');
    if (!uniId) { resultEl.innerHTML = '<div class="ins__result__empty"><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c"></i><p>Please select a university first.</p></div>'; return; }

    var base = SALARY_DATA[uniId];
    if (!base) {
        // No curated figures — derive a sensible profile from the university's entry difficulty
        // (more selective → stronger graduate earning outcomes), so every university returns a result.
        var su = UNI.find(function(u){ return u.id === uniId; });
        var sd = su ? (su.diff || 3) : 3;
        base = ({
            1: { p3:60, p5:26, p10:7,  p30:1  },
            2: { p3:68, p5:33, p10:10, p30:2  },
            3: { p3:76, p5:44, p10:14, p30:3  },
            4: { p3:86, p5:60, p10:24, p30:6  },
            5: { p3:93, p5:80, p10:45, p30:12 },
        })[sd] || { p3:76, p5:44, p10:14, p30:3 };
    }

    var bonus = field && FIELD_BONUS[field] ? FIELD_BONUS[field] : { p3:0, p5:0, p10:0, p30:0 };
    var p3  = cap(base.p3  + bonus.p3);
    var p5  = cap(base.p5  + bonus.p5);
    var p10 = cap(base.p10 + bonus.p10);
    var p30 = cap(base.p30 + bonus.p30);

    var uni = UNI.find(function(u){ return u.id === uniId; });
    var uniName = uni ? uni.name : uniId;
    var fieldLabel = { engineering:'Engineering & Tech', finance:'Finance & Consulting', medicine:'Medicine & Healthcare', law:'Law', arts:'Arts & Humanities' }[field] || 'All fields (average)';

    var brackets = [
        { label:'Above €3,000/month',  sub:'Entry-level professional',  pct:p3,  color:'#27ae60', icon:'fa-solid fa-seedling' },
        { label:'Above €5,000/month',  sub:'Senior / specialist',        pct:p5,  color:'#2980b9', icon:'fa-solid fa-briefcase' },
        { label:'Above €10,000/month', sub:'Executive / high-earner',    pct:p10, color:'#8e44ad', icon:'fa-solid fa-star' },
        { label:'Above €30,000/month', sub:'Top 1% earner',              pct:p30, color:'#d97c14', icon:'fa-solid fa-crown' },
    ];

    resultEl.innerHTML =
        '<div class="ins__sal__header">' +
            '<div class="ins__sal__uni">' + uniName + '</div>' +
            '<div class="ins__sal__field"><i class="fa-solid fa-briefcase"></i> ' + fieldLabel + '</div>' +
        '</div>' +
        '<div class="ins__sal__source">Based on graduate employment outcome surveys (INE, HESA, AlmaLaurea, CEREQ, DAAD, 2023)</div>' +
        brackets.map(function(b) {
            var fill = b.pct;
            var barColor = b.pct >= 80 ? '#27ae60' : b.pct >= 55 ? '#2980b9' : b.pct >= 30 ? '#d97c14' : '#e74c3c';
            var conf = b.pct >= 75 ? 'High likelihood' : b.pct >= 45 ? 'Moderate likelihood' : b.pct >= 20 ? 'Lower likelihood' : 'Rare outcome';
            return '<div class="ins__sal__row">' +
                '<div class="ins__sal__row__top">' +
                    '<div class="ins__sal__icon" style="color:' + b.color + '"><i class="' + b.icon + '"></i></div>' +
                    '<div class="ins__sal__info">' +
                        '<div class="ins__sal__label">' + b.label + '</div>' +
                        '<div class="ins__sal__sub">' + b.sub + '</div>' +
                    '</div>' +
                    '<div class="ins__sal__pct" style="color:' + barColor + '">' + fill + '%</div>' +
                '</div>' +
                '<div class="ins__sal__bar__track">' +
                    '<div class="ins__sal__bar__fill" style="width:' + fill + '%;background:' + barColor + '"></div>' +
                '</div>' +
                '<div class="ins__sal__conf">' + conf + '</div>' +
            '</div>';
        }).join('');
});

var admSystemEl = document.getElementById('admSystem');
var admGradeField = document.getElementById('admGradeField');
var admAlevelField = document.getElementById('admAlevelField');
var admHint = document.getElementById('admHint');

admSystemEl.addEventListener('change', function() {
    var sys = this.value;
    if (sys === 'alevels') {
        admGradeField.style.display = 'none';
        admAlevelField.style.display = 'block';
    } else {
        admGradeField.style.display = 'block';
        admAlevelField.style.display = 'none';
        var hints = { pct:'Enter a number between 0 and 100', gpa:'Enter a number between 0.0 and 4.0', ib:'Enter a number between 1 and 45' };
        var maxes = { pct:100, gpa:4, ib:45 };
        admHint.textContent = hints[sys] || '';
        document.getElementById('admGrade').max = maxes[sys] || 100;
        document.getElementById('admGrade').placeholder = sys === 'gpa' ? 'e.g. 3.5' : sys === 'ib' ? 'e.g. 38' : 'e.g. 82';
    }
});

function toPercent(sys, raw) {
    if (sys === 'pct')     return raw;
    if (sys === 'gpa')     return (raw / 4.0) * 100;
    if (sys === 'ib')      return (raw / 45)  * 100;
    if (sys === 'alevels') return raw;
    return raw;
}

document.getElementById('admCalcBtn').addEventListener('click', function() {
    var uniId   = document.getElementById('admUni').value;
    var sys     = document.getElementById('admSystem').value;
    var resultEl = document.getElementById('admResult');

    if (!uniId) { resultEl.innerHTML = '<div class="ins__result__empty"><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c"></i><p>Please select a university first.</p></div>'; return; }

    var rawGrade;
    if (sys === 'alevels') {
        rawGrade = parseFloat(document.getElementById('admALevel').value);
    } else {
        rawGrade = parseFloat(document.getElementById('admGrade').value);
        if (isNaN(rawGrade)) { resultEl.innerHTML = '<div class="ins__result__empty"><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c"></i><p>Please enter your grade.</p></div>'; return; }
    }

    var grade = toPercent(sys, rawGrade);
    var uni = UNI.find(function(u){ return u.id === uniId; });
    if (!uni) return;
    var params = ADM_PARAMS[uni.diff] || ADM_PARAMS[3];
    var prob = cap(sigmoid(grade, params.thresh, params.k));

    var verdict, verdictColor, advice;
    if (prob >= 80)      { verdict = 'Strong Candidate';   verdictColor = '#27ae60'; advice = 'Your grades put you in an excellent position. Focus on a strong personal statement and gather outstanding references.'; }
    else if (prob >= 55) { verdict = 'Good Chances';       verdictColor = '#2980b9'; advice = 'You have a real shot — strengthen your application with extracurriculars and a compelling motivation letter.'; }
    else if (prob >= 35) { verdict = 'Competitive Entry';  verdictColor = '#d97c14'; advice = 'Entry is competitive. Consider retaking exams, broadening your portfolio, or applying to a wider range of universities.'; }
    else                 { verdict = 'Very Challenging';   verdictColor = '#e74c3c'; advice = 'This university\'s requirements are significantly above your current grades. Explore foundation programmes or alternative entry routes.'; }

    var sysLabel = { pct:rawGrade + '%', gpa:'GPA ' + rawGrade, ib:rawGrade + ' IB points', alevels:'A-Level grade' }[sys] || rawGrade + '%';

    var conf = prob >= 80 ? 'High likelihood' : prob >= 55 ? 'Good likelihood' : prob >= 35 ? 'Competitive' : 'Long shot';

    resultEl.innerHTML =
        '<div class="ins__sal__header">' +
            '<div class="ins__sal__uni">' + uni.name + '</div>' +
            '<div class="ins__sal__field"><i class="fa-solid fa-graduation-cap"></i> ' + uni.dl + ' &middot; ' + sysLabel + '</div>' +
        '</div>' +
        '<div class="ins__sal__source">Estimated from your grade against this university\'s typical entry profile</div>' +
        '<div class="ins__sal__row">' +
            '<div class="ins__sal__row__top">' +
                '<div class="ins__sal__icon" style="color:' + verdictColor + '"><i class="fa-solid fa-percent"></i></div>' +
                '<div class="ins__sal__info">' +
                    '<div class="ins__sal__label">Estimated admission chance</div>' +
                    '<div class="ins__sal__sub">' + verdict + '</div>' +
                '</div>' +
                '<div class="ins__sal__pct" style="color:' + verdictColor + '">' + prob + '%</div>' +
            '</div>' +
            '<div class="ins__sal__bar__track">' +
                '<div class="ins__sal__bar__fill" style="width:' + prob + '%;background:' + verdictColor + '"></div>' +
            '</div>' +
            '<div class="ins__sal__conf">' + conf + ' — ' + advice + '</div>' +
        '</div>' +
        '<div class="adm2__actions">' +
            '<button class="adm2__btn adm2__btn--save ins__save__hero__btn" ' +
                'data-uid="'           + uniId        + '" ' +
                'data-name="'          + uni.name      + '" ' +
                'data-color="'         + uni.color     + '" ' +
                'data-prob="'          + prob          + '" ' +
                'data-verdict="'       + verdict       + '" ' +
                'data-verdict-color="' + verdictColor  + '" ' +
                'data-grade="'         + sysLabel      + '">' +
                '<i class="fa-solid fa-bookmark"></i> Save' +
            '</button>' +
            '<a class="adm2__btn adm2__btn--apply" href="applicationForm.html?uni=' + uniId + '">' +
                '<i class="fa-solid fa-file-signature"></i> Apply' +
            '</a>' +
        '</div>';
});

populateInsightSelects();

/* ── ROI / "Is it worth it?" calculator ── */
var ROI_FIELD_SALARY = { cs:42000, engineering:40000, finance:38000, medicine:48000, law:36000, science:34000, arts:28000 };
var ROI_FIELD_LABEL  = { cs:'Computer Science / IT', engineering:'Engineering', finance:'Business & Finance', medicine:'Medicine & Healthcare', law:'Law', science:'Science', arts:'Arts & Humanities' };
var ROI_DEGREE = { bachelor:{ y:4, label:"Bachelor's" }, master:{ y:2, label:"Master's" }, phd:{ y:4, label:'PhD' } };

(function() {
    var btn = document.getElementById('roiCalcBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var resultEl = document.getElementById('roiResult');
        var uniId = document.getElementById('roiUni').value;
        if (!uniId) {
            resultEl.innerHTML = '<div class="ins__result__empty"><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c"></i><p>Please select a university first.</p></div>';
            return;
        }
        var u = (typeof UNI !== 'undefined' ? UNI : []).find(function(x){ return x.id === uniId; });
        if (!u) { resultEl.innerHTML = '<div class="ins__result__empty"><i class="fa-solid fa-triangle-exclamation"></i><p>No data for this university.</p></div>'; return; }

        var deg   = ROI_DEGREE[document.getElementById('roiDegree').value] || ROI_DEGREE.bachelor;
        var field = document.getElementById('roiField').value;
        var annualTuition = (typeof tuitionMinCost === 'function') ? tuitionMinCost(u) : 3000;
        var totalCost = annualTuition * deg.y;
        var salary    = ROI_FIELD_SALARY[field] || 35000;
        var payback   = salary > 0 ? totalCost / salary : 0;

        var cls, verdict;
        if (payback < 1.5)      { cls = 'fast'; verdict = 'Excellent value'; }
        else if (payback < 3)   { cls = 'good'; verdict = 'Good value'; }
        else if (payback < 5)   { cls = 'mid';  verdict = 'Moderate value'; }
        else                    { cls = 'slow'; verdict = 'Slow to pay off'; }

        var fieldLabel = ROI_FIELD_LABEL[field] || 'All fields (average)';

        resultEl.innerHTML =
            '<div class="ins__sal__header">' +
                '<div class="ins__sal__uni">' + (u.name || uniId) + '</div>' +
                '<div class="ins__sal__field"><i class="fa-solid fa-graduation-cap"></i> ' + deg.label + ' · ' + fieldLabel + '</div>' +
            '</div>' +
            '<div class="roi__result__grid">' +
                '<div class="roi__stat"><div class="roi__stat__lbl"><i class="fa-solid fa-coins"></i> Total Cost</div><div class="roi__stat__val">€' + totalCost.toLocaleString() + '</div></div>' +
                '<div class="roi__stat"><div class="roi__stat__lbl"><i class="fa-solid fa-sack-dollar"></i> Avg. Salary</div><div class="roi__stat__val">€' + salary.toLocaleString() + '<span style="font-size:11px;color:var(--text3);font-weight:600">/yr</span></div></div>' +
            '</div>' +
            '<div class="roi__payback roi__payback--' + cls + '">' +
                '<div class="roi__payback__num">' + payback.toFixed(1) + ' years</div>' +
                '<div class="roi__payback__lbl">until the degree pays for itself · ' + verdict + '</div>' +
            '</div>' +
            '<p class="roi__note"><i class="fa-solid fa-circle-info"></i> Payback time = total cost ÷ average annual salary. Estimates based on typical tuition and graduate earnings.</p>';
    });
}());

var APPROVED_KEY = 'us_approved_' + user.id;
function getApproved() { try { return JSON.parse(localStorage.getItem(APPROVED_KEY) || '{}'); } catch(e) { return {}; } }
function setApproved(d) { localStorage.setItem(APPROVED_KEY, JSON.stringify(d)); }
function markApproved(uniId, score) {
    var a = getApproved();
    if (score >= 80) { a[uniId] = Math.max(a[uniId] || 0, score); setApproved(a); }
}
function countApproved() {
    var a = getApproved(); var saved = getSaved();
    return Object.keys(a).filter(function(id){ return saved.indexOf(id) !== -1 && a[id] >= 80; }).length;
}
function updateAppcount() {
    updateFriendStats();
}

var INSIGHT_SAVES_KEY = 'us_insight_saves';
function getInsightSaves() { try { return JSON.parse(localStorage.getItem(INSIGHT_SAVES_KEY) || '[]'); } catch(e) { return []; } }
function setInsightSaves(d) { localStorage.setItem(INSIGHT_SAVES_KEY, JSON.stringify(d)); }

/* Close the result card with an animation */
document.getElementById('admResult').addEventListener('click', function (e) {
    var close = e.target.closest('.adm2__close');
    if (!close) return;
    var panel = document.getElementById('admResult');
    var card = panel.querySelector('.adm2');
    if (!card) { panel.innerHTML = ''; return; }
    card.classList.add('adm2--closing');
    setTimeout(function () { panel.innerHTML = ''; }, 260);
});

document.getElementById('admResult').addEventListener('click', function (e) {
    var btn = e.target.closest('.ins__save__hero__btn');
    if (!btn || btn.disabled) return;

    var result = {
        uniId:        btn.dataset.uid,
        name:         btn.dataset.name,
        color:        btn.dataset.color,
        prob:         parseInt(btn.dataset.prob, 10),
        verdict:      btn.dataset.verdict,
        verdictColor: btn.dataset.verdictColor,
        grade:        btn.dataset.grade
    };

    var saves = getInsightSaves().filter(function (s) { return s.uniId !== result.uniId; });
    saves.unshift(result);
    setInsightSaves(saves);

    btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved to Hero';
    btn.disabled  = true;

    heroInsightIdx = 0;
    updateHeroInsight();
});

var EV_PROMPT = [
'You are an expert university admissions officer and professional academic writing coach.',
'Your task is to evaluate and improve a student\'s university application in a single response.',
'',
'### RULES:',
'* Be honest, critical, and constructive.',
'* Do NOT give generic advice.',
'* Do NOT invent or exaggerate achievements.',
'* Only use the information provided.',
'* Maintain a professional and encouraging tone.',
'',
'### APPLICATION DATA:',
'Program Applying To:\n{{program}}',
'GPA / Academic Performance:\n{{gpa}}',
'Test Scores:\n{{scores}}',
'Extracurricular Activities:\n{{activities}}',
'Awards / Achievements:\n{{awards}}',
'',
'### WRITTEN RESPONSES:',
'Personal Statement:\n{{personal_statement}}',
'Why This University:\n{{motivation}}',
'Career Goals:\n{{goals}}',
'Additional Information:\n{{additional_info}}',
'',
'### TASKS:',
'1. Evaluate the application as a whole (academics + writing + profile).',
'2. Give an overall score from 0 to 100.',
'3. Give section scores (0-10): Clarity, Structure, Originality, Persuasiveness, Profile Strength.',
'4. Identify: Strengths, Weaknesses, Missed Opportunities.',
'5. Provide specific, actionable improvements.',
'6. Rewrite the Personal Statement and the "Why This University" section — clearer, more structured, more compelling.',
'7. Do NOT add new achievements. Only improve wording, structure, and clarity.',
'',
'### OUTPUT FORMAT (STRICT):',
'Overall Score: X/100',
'',
'Section Scores:',
'Clarity: X/10',
'Structure: X/10',
'Originality: X/10',
'Persuasiveness: X/10',
'Profile Strength: X/10',
'',
'---',
'',
'Strengths:\n* ...',
'',
'Weaknesses:\n* ...',
'',
'Missed Opportunities:\n* ...',
'',
'Actionable Improvements:\n* ...',
'',
'---',
'',
'Improved Personal Statement:\n(Full rewritten version)',
'',
'---',
'',
'Improved "Why This University":\n(Full rewritten version)',
'',
'---',
'',
'Final Advice:\n(2-3 concise sentences summarizing the most important improvement priorities)'
].join('\n');

function buildEvalPrompt() {
    function v(id) { return document.getElementById(id).value.trim() || '(not provided)'; }
    return EV_PROMPT
        .replace('{{program}}',           v('evProgram'))
        .replace('{{gpa}}',               v('evGpa'))
        .replace('{{scores}}',            v('evScores'))
        .replace('{{activities}}',        v('evActivities'))
        .replace('{{awards}}',            v('evAwards'))
        .replace('{{personal_statement}}',v('evStatement'))
        .replace('{{motivation}}',        v('evMotivation'))
        .replace('{{goals}}',             v('evGoals'))
        .replace('{{additional_info}}',   v('evAdditional'));
}

function evScore(fields) {
    var v = function(s) { return (s || '').toLowerCase(); };
    var wc = function(s) { return (s || '').trim().split(/\s+/).filter(Boolean).length; };
    var cats = [];

    cats.push({ name: 'Academic Strength', weight: 0.25, score: (function() {
        var g = v(fields.gpa);
        var s = 5;
        if (/4\.0|summa|distinction|highest honor/.test(g)) s = 10;
        else if (/3\.[89]/.test(g)) s = 9.5;
        else if (/3\.[67]/.test(g)) s = 8.5;
        else if (/3\.[45]/.test(g)) s = 8;
        else if (/3\.[23]/.test(g)) s = 7;
        else if (/3\.[01]/.test(g)) s = 6;
        else if (/first class|1st class|2:1|upper second/.test(g)) s = 8.5;
        else if (/2:2|lower second/.test(g)) s = 6;
        else if (/9[0-9]%/.test(g)) s = 9.5;
        else if (/8[0-9]%/.test(g)) s = 8;
        else if (/7[0-9]%/.test(g)) s = 6.5;
        if (g.length < 3) s = 5;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Motivation', weight: 0.15, score: (function() {
        var t = fields.motivation || '';
        var s = Math.min(7, wc(t) / 20);
        if (/research|lab|professor|faculty|curriculum|module|course|program|opportunity|project/i.test(t)) s += 1.5;
        if (/passion|driven|inspired|fascinated|compelled|eager|dedicated/i.test(t)) s += 1;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Writing Quality', weight: 0.10, score: (function() {
        var t = fields.statement || '';
        var s = Math.min(7, wc(t) / 71);
        if (/however|therefore|furthermore|moreover|consequently|firstly|secondly/i.test(t)) s += 1;
        if (/from a young age|i have always|ever since i was|as a child/i.test(t)) s -= 0.5;
        return Math.min(10, Math.max(0, s));
    }())});

    cats.push({ name: 'Program Fit', weight: 0.12, score: (function() {
        var t = (fields.program || '') + ' ' + (fields.goals || '');
        var s = 5;
        if (wc(fields.goals) > 30) s += 2;
        if (/specific|career|industry|role|sector|position/i.test(t)) s += 1.5;
        if (/align|complement|build on|leverage|because|reason/i.test(t)) s += 1;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Extracurriculars', weight: 0.10, score: (function() {
        var t = fields.activities || '';
        if (!t.trim()) return 2;
        var s = Math.min(6, wc(t) / 10);
        if (/president|founder|captain|head|lead|organiz|chair|direct/i.test(t)) s += 1.5;
        if (/volunteer|community|outreach|mentor|tutor|charity/i.test(t)) s += 1;
        if (/competition|tournament|champion|finalist|winner/i.test(t)) s += 1;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Research Experience', weight: 0.08, score: (function() {
        var t = (fields.activities || '') + ' ' + (fields.additional || '') + ' ' + (fields.statement || '');
        var s = 3;
        if (/research|thesis|dissertation|paper|publication|journal|experiment|lab/i.test(t)) s += 3;
        if (/author|co-author|published|presented|conference/i.test(t)) s += 2;
        if (/professor|supervisor|internship|placement/i.test(t)) s += 1.5;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Authenticity', weight: 0.08, score: (function() {
        var t = (fields.statement || '') + ' ' + (fields.motivation || '');
        if (wc(t) < 30) return 3;
        var specifics = (t.match(/[0-9]+|specifically|particular|during|when i|in \d{4}|at the age|my \w+/gi) || []).length;
        var s = Math.min(7, 3 + specifics * 0.3);
        var generics = (t.match(/from a young age|i have always|passionate about|my whole life|unique opportunity/gi) || []).length;
        return Math.min(10, Math.max(2, s - generics * 0.5));
    }())});

    cats.push({ name: 'Leadership', weight: 0.07, score: (function() {
        var t = (fields.activities || '') + ' ' + (fields.additional || '');
        var s = 3;
        if (/president|founder|captain|head of|chair/i.test(t)) s += 3;
        else if (/officer|coordinator|organiz|director/i.test(t)) s += 2;
        else if (/team|group|member/i.test(t)) s += 1;
        if (/100\+|50\+|nationwide|regional|national|international/i.test(t)) s += 1.5;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Awards / Scholarship', weight: 0.03, score: (function() {
        var t = fields.awards || '';
        if (!t.trim()) return 2;
        var s = 5;
        if (/national|international|global/i.test(t)) s += 3;
        else if (/regional|state|provincial/i.test(t)) s += 2;
        if (/olympiad|scholarship|fellowship|grant/i.test(t)) s += 1.5;
        if (/finalist|winner|champion|first place|gold/i.test(t)) s += 1;
        return Math.min(10, s);
    }())});

    cats.push({ name: 'Test Scores', weight: 0.02, score: (function() {
        var t = fields.scores || '';
        if (!t.trim()) return 4;
        var s = 5;
        var sat = t.match(/sat\s*:?\s*([0-9]+)/i);
        if (sat) { var sv = parseInt(sat[1]); s += sv >= 1500 ? 4 : sv >= 1400 ? 3 : sv >= 1300 ? 2 : 1; }
        var ielts = t.match(/ielts\s*:?\s*([0-9.]+)/i);
        if (ielts) { var iv = parseFloat(ielts[1]); s += iv >= 8 ? 4 : iv >= 7.5 ? 3 : iv >= 7 ? 2 : 1; }
        return Math.min(10, s);
    }())});

    var total = cats.reduce(function(sum, c) { return sum + c.score * c.weight; }, 0);
    return { score: Math.round(total * 10), cats: cats };
}

function evInsights(score, cats, uniName, program) {
    var sorted = cats.slice().sort(function(a, b) { return b.score - a.score; });
    var strengths = sorted.filter(function(c) { return c.score >= 7; }).slice(0, 3).map(function(c) {
        return c.name + ' (' + Math.round(c.score * 10) + '/100)';
    });
    var weaknesses = sorted.slice().reverse().filter(function(c) { return c.score < 6; }).slice(0, 3).map(function(c) {
        return c.name + ' (' + Math.round(c.score * 10) + '/100)';
    });
    var verdict, color;
    if (score >= 80) { verdict = 'Strong Application'; color = '#27ae60'; }
    else if (score >= 65) { verdict = 'Competitive'; color = '#f39c12'; }
    else if (score >= 50) { verdict = 'Needs Improvement'; color = '#e67e22'; }
    else { verdict = 'Significant Gaps'; color = '#e74c3c'; }
    var fb = [];
    if (score >= 80) fb.push('Your profile shows strong potential for ' + (uniName || 'this university') + '. Focus on polishing the final details.');
    else if (score >= 65) fb.push('You have a competitive profile for ' + (uniName || 'this university') + ', but addressing weak areas will significantly improve your chances.');
    else fb.push('Your application needs development in several areas before applying to ' + (uniName || 'this university') + '.');
    cats.forEach(function(c) {
        if (c.score < 6) {
            if (c.name === 'Academic Strength') fb.push('Clarify your GPA with exact numbers and scale.');
            else if (c.name === 'Motivation') fb.push('Expand your motivation letter — mention specific faculty, labs, or courses at ' + (uniName || 'the university') + '.');
            else if (c.name === 'Writing Quality') fb.push('Strengthen your personal statement with concrete anecdotes and clear connective language.');
            else if (c.name === 'Program Fit') fb.push('Explicitly link your career goals to the ' + (program || 'program') + ' curriculum.');
            else if (c.name === 'Extracurriculars') fb.push('Highlight leadership roles and impact in your activities.');
            else if (c.name === 'Research Experience') fb.push('Mention any lab work, projects, or independent research.');
        }
    });
    return { verdict: verdict, color: color, strengths: strengths, weaknesses: weaknesses, feedback: fb.join(' ') };
}

function renderEvalHTML(score, cats, ins, uniName, approved) {
    var c = ins.color;
    var catsHtml = cats.map(function(cat) {
        var pct = Math.round(cat.score * 10);
        var bc = pct >= 75 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c';
        return '<div class="ev__cat">' +
            '<div class="ev__cat__hd"><span>' + cat.name + '</span><span style="color:' + bc + '">' + pct + '/100</span></div>' +
            '<div class="ev__cat__bar__wrap"><div class="ev__cat__bar" style="width:' + pct + '%;background:' + bc + '"></div></div>' +
        '</div>';
    }).join('');
    var strHtml = ins.strengths.length
        ? '<ul>' + ins.strengths.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul>'
        : '<ul><li style="color:var(--text3)">No standout strengths detected yet</li></ul>';
    var wkHtml = ins.weaknesses.length
        ? '<ul>' + ins.weaknesses.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul>'
        : '<ul><li style="color:var(--text3)">No major weaknesses found</li></ul>';
    var approvedPill = approved
        ? '<div class="ev__approved__pill"><i class="fa-solid fa-circle-check"></i> Approved</div>' : '';
    var approvedBanner = approved
        ? '<div class="ev__approved__banner"><i class="fa-solid fa-circle-check"></i> Scored ≥ 80 — counted as Approved for ' + (uniName || 'this university') + '</div>' : '';
    return '<div class="ev__score__hd">' +
            '<div class="ev__score__ring" style="border-color:' + c + ';color:' + c + '">' +
                '<div class="ev__score__num">' + score + '</div>' +
                '<div class="ev__score__denom">/100</div>' +
            '</div>' +
            '<div class="ev__score__info">' +
                '<div class="ev__score__verdict" style="color:' + c + '">' + ins.verdict + '</div>' +
                '<div class="ev__score__meta">' + (uniName ? uniName + ' · ' : '') + 'UniScout AI Evaluation</div>' +
                approvedPill +
            '</div>' +
        '</div>' +
        '<div class="ev__cats">' + catsHtml + '</div>' +
        '<div class="ev__lists">' +
            '<div class="ev__list"><div class="ev__list__title"><i class="fa-solid fa-check" style="color:#27ae60"></i> Strengths</div>' + strHtml + '</div>' +
            '<div class="ev__list"><div class="ev__list__title"><i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c"></i> To Improve</div>' + wkHtml + '</div>' +
        '</div>' +
        '<div class="ev__feedback">' + ins.feedback + '</div>' +
        approvedBanner;
}

(function () {
    var submitBtn = document.getElementById('evSubmitBtn');
    if (!submitBtn) return;

    submitBtn.addEventListener('click', function () {
        var program  = document.getElementById('evProgram').value.trim();
        var uniId    = document.getElementById('evUniSel').value.trim();
        var uniInput = document.getElementById('evUniInput').value.trim();
        if (!program) { document.getElementById('evProgram').focus(); return; }
        if (!uniId) {
            var evUniEl = document.getElementById('evUniInput');
            if (evUniEl) {
                evUniEl.focus();
                evUniEl.style.borderColor = '#e74c3c';
                setTimeout(function(){ evUniEl.style.borderColor = ''; }, 1800);
            }
            return;
        }
        var saved = getSaved();
        if (saved.indexOf(uniId) === -1) { alert('Please select a university from your saved list.'); return; }

        var uniName = uniInput;
        var fields = {
            program:    document.getElementById('evProgram').value,
            gpa:        document.getElementById('evGpa').value,
            scores:     document.getElementById('evScores').value,
            awards:     document.getElementById('evAwards').value,
            activities: document.getElementById('evActivities').value,
            statement:  document.getElementById('evStatement').value,
            motivation: document.getElementById('evMotivation').value,
            goals:      document.getElementById('evGoals').value,
            additional: document.getElementById('evAdditional').value
        };

        var result   = evScore(fields);
        var score    = result.score;
        var approved = score >= 80;
        var ins      = evInsights(score, result.cats, uniName, fields.program);

        if (approved) markApproved(uniId, score);
        if (typeof updateAppcount === 'function') updateAppcount();

        var resultEl = document.getElementById('evResult');
        var outputEl = document.getElementById('evOutput');
        var titleEl  = document.getElementById('evResultTitle');
        titleEl.textContent = 'AI Evaluation Complete';
        outputEl.innerHTML  = renderEvalHTML(score, result.cats, ins, uniName, approved);
        resultEl.style.display = 'block';
        setTimeout(function() { resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);

        var apiKey = document.getElementById('evApiKey').value.trim();
        if (!apiKey) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enhancing with AI…';

        fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-opus-4-6',
                max_tokens: 1200,
                messages: [{ role: 'user', content: buildEvalPrompt() + '\n\nIn 3-5 sentences, provide personalised feedback on the weakest areas of this application.' }]
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Evaluate My Application';
            if (data.content && data.content[0] && data.content[0].text) {
                var fb = outputEl.querySelector('.ev__feedback');
                if (fb) fb.innerHTML += '<hr style="margin:10px 0;border:none;border-top:1px solid var(--border)"><strong>Claude AI:</strong> ' + data.content[0].text;
            }
        })
        .catch(function() {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Evaluate My Application';
        });
    });

    var copyBtn  = document.getElementById('evCopyBtn');
    var resetBtn = document.getElementById('evResetBtn');

    if (copyBtn) copyBtn.addEventListener('click', function () {
        var text = document.getElementById('evOutput').textContent;
        navigator.clipboard.writeText(text).then(function () {
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(function () { copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 2000);
        });
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
        document.getElementById('evResult').style.display = 'none';
    });
}());

var THEME_KEY = 'us_theme';
function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var icon = document.getElementById('themeIcon');
    if (icon) icon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}
(function(){ applyTheme(localStorage.getItem(THEME_KEY) === 'dark'); }());
document.getElementById('themeToggle').addEventListener('click', function() {
    applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
    applyCountryTheme(currentCountryCode || 'es');
});

var CAPITALS = {
    es: { lat: 40.4168, lon: -3.7038, city: 'Madrid'  },
    gb: { lat: 51.5074, lon: -0.1278, city: 'London'  },
    fr: { lat: 48.8566, lon:  2.3522, city: 'Paris'   },
    de: { lat: 52.5200, lon: 13.4050, city: 'Berlin'  },
    it: { lat: 41.9028, lon: 12.4964, city: 'Rome'    },
    pt: { lat: 38.7223, lon: -9.1393, city: 'Lisbon'  },
};

function wmoIcon(code) {
    if (code === 0)  return { fa:'fa-sun',                 cls:'wx__ani--sun',     col:'#f5a030' };
    if (code <= 2)   return { fa:'fa-cloud-sun',           cls:'wx__ani--partly',  col:'#90b8d8' };
    if (code === 3)  return { fa:'fa-cloud',               cls:'wx__ani--cloud',   col:'#a0b4c8' };
    if (code <= 48)  return { fa:'fa-smog',                cls:'wx__ani--fog',     col:'#a8bbc8' };
    if (code <= 55)  return { fa:'fa-cloud-drizzle',       cls:'wx__ani--drizzle', col:'#7ab4d8' };
    if (code <= 67)  return { fa:'fa-cloud-rain',          cls:'wx__ani--rain',    col:'#5a9fd4' };
    if (code <= 77)  return { fa:'fa-snowflake',           cls:'wx__ani--snow',    col:'#a8d4f0' };
    if (code <= 82)  return { fa:'fa-cloud-showers-heavy', cls:'wx__ani--rain',    col:'#4a8fc4' };
    return                  { fa:'fa-bolt',                cls:'wx__ani--storm',   col:'#e0d040' };
}

var WX_LABELS = {
    'wx__ani--sun':'Clear sky','wx__ani--partly':'Partly cloudy','wx__ani--cloud':'Overcast',
    'wx__ani--fog':'Foggy','wx__ani--drizzle':'Drizzle','wx__ani--rain':'Rain',
    'wx__ani--snow':'Snow','wx__ani--storm':'Thunderstorm'
};

function fetchCountryWeather(code) {
    var cap  = CAPITALS[code];
    var hero = document.getElementById('heroWxCard');
    if (!cap) {
        if (hero) hero.style.display = 'none';
        return;
    }
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + cap.lat +
          '&longitude=' + cap.lon + '&current_weather=true')
    .then(function(r) { return r.json(); })
    .then(function(d) {
        var wx = d.current_weather;
        if (!wx) return;
        var inf   = wmoIcon(wx.weathercode);
        var tmp   = Math.round(wx.temperature);
        var label = WX_LABELS[inf.cls] || '';

        if (hero) {
            var iconWrap = document.getElementById('heroWxIconWrap');
            var tempEl   = document.getElementById('heroWxTemp');
            var condEl   = document.getElementById('heroWxCond');
            var cityEl   = document.getElementById('heroWxCity');
            if (iconWrap) iconWrap.innerHTML =
                '<span class="mp__hero__wx__ani ' + inf.cls + '" style="color:' + inf.col + '">' +
                    '<i class="fa-solid ' + inf.fa + '"></i>' +
                '</span>';
            if (tempEl) tempEl.textContent = tmp + '°C';
            if (condEl) condEl.textContent = label;
            if (cityEl) cityEl.innerHTML   = '<i class="fa-solid fa-location-dot"></i> ' + (cap.city || '');
            hero.style.display = 'flex';
        }
    })
    .catch(function() {
        if (hero) hero.style.display = 'none';
    });
}

/* ── Country list, favourites & destination picker ──────────── */

// Countries we already have full data files for (used by the compare dropdowns).
var DATA_COUNTRIES = [
    { code:'gb', name:'United Kingdom' }, { code:'es', name:'Spain' },
    { code:'de', name:'Germany' },        { code:'fr', name:'France' },
    { code:'it', name:'Italy' },          { code:'pt', name:'Portugal' },
    { code:'nl', name:'Netherlands' },    { code:'se', name:'Sweden' },
    { code:'ch', name:'Switzerland' },    { code:'dk', name:'Denmark' },
    { code:'be', name:'Belgium' },        { code:'fi', name:'Finland' },
    { code:'ie', name:'Ireland' },        { code:'ua', name:'Ukraine' },
    { code:'us', name:'United States' }
];

// Every country selectable in the Elite search (flag-icons supports all ISO codes).
var ALL_COUNTRIES = [
    {code:'gb',name:'United Kingdom'},{code:'us',name:'United States'},{code:'ca',name:'Canada'},
    {code:'au',name:'Australia'},{code:'nz',name:'New Zealand'},{code:'ie',name:'Ireland'},
    {code:'fr',name:'France'},{code:'de',name:'Germany'},{code:'es',name:'Spain'},
    {code:'it',name:'Italy'},{code:'pt',name:'Portugal'},{code:'nl',name:'Netherlands'},
    {code:'be',name:'Belgium'},{code:'ch',name:'Switzerland'},{code:'at',name:'Austria'},
    {code:'se',name:'Sweden'},{code:'no',name:'Norway'},{code:'dk',name:'Denmark'},
    {code:'fi',name:'Finland'},{code:'is',name:'Iceland'},{code:'pl',name:'Poland'},
    {code:'cz',name:'Czechia'},{code:'sk',name:'Slovakia'},{code:'hu',name:'Hungary'},
    {code:'ro',name:'Romania'},{code:'bg',name:'Bulgaria'},{code:'gr',name:'Greece'},
    {code:'hr',name:'Croatia'},{code:'si',name:'Slovenia'},{code:'rs',name:'Serbia'},
    {code:'ua',name:'Ukraine'},{code:'ee',name:'Estonia'},{code:'lv',name:'Latvia'},
    {code:'lt',name:'Lithuania'},{code:'lu',name:'Luxembourg'},{code:'mt',name:'Malta'},
    {code:'cy',name:'Cyprus'},{code:'tr',name:'Turkey'},{code:'ru',name:'Russia'},
    {code:'by',name:'Belarus'},{code:'md',name:'Moldova'},{code:'al',name:'Albania'},
    {code:'ba',name:'Bosnia & Herzegovina'},{code:'mk',name:'North Macedonia'},{code:'me',name:'Montenegro'},
    {code:'cn',name:'China'},{code:'jp',name:'Japan'},{code:'kr',name:'South Korea'},
    {code:'in',name:'India'},{code:'sg',name:'Singapore'},{code:'hk',name:'Hong Kong'},
    {code:'my',name:'Malaysia'},{code:'th',name:'Thailand'},{code:'vn',name:'Vietnam'},
    {code:'id',name:'Indonesia'},{code:'ph',name:'Philippines'},{code:'tw',name:'Taiwan'},
    {code:'pk',name:'Pakistan'},{code:'bd',name:'Bangladesh'},{code:'lk',name:'Sri Lanka'},
    {code:'np',name:'Nepal'},{code:'kz',name:'Kazakhstan'},{code:'ae',name:'United Arab Emirates'},
    {code:'sa',name:'Saudi Arabia'},{code:'qa',name:'Qatar'},{code:'il',name:'Israel'},
    {code:'jo',name:'Jordan'},{code:'lb',name:'Lebanon'},{code:'ir',name:'Iran'},
    {code:'eg',name:'Egypt'},{code:'ma',name:'Morocco'},{code:'tn',name:'Tunisia'},
    {code:'dz',name:'Algeria'},{code:'za',name:'South Africa'},{code:'ng',name:'Nigeria'},
    {code:'ke',name:'Kenya'},{code:'gh',name:'Ghana'},{code:'et',name:'Ethiopia'},
    {code:'tz',name:'Tanzania'},{code:'ug',name:'Uganda'},{code:'br',name:'Brazil'},
    {code:'ar',name:'Argentina'},{code:'cl',name:'Chile'},{code:'co',name:'Colombia'},
    {code:'mx',name:'Mexico'},{code:'pe',name:'Peru'},{code:'uy',name:'Uruguay'},
    {code:'ec',name:'Ecuador'},{code:'cr',name:'Costa Rica'},{code:'pa',name:'Panama'}
];

function countryNameByCode(code) {
    var c = ALL_COUNTRIES.find(function(x) { return x.code === code; });
    return c ? c.name : (code || '').toUpperCase();
}

// ── Favourite countries (the user's customised destination list) ──
var FAV_COUNTRIES_KEY = 'us_fav_countries_' + user.id;
var DEFAULT_FAVS = ['gb','ch','de','nl','se','fr','dk','be','fi','ie'];
function getFavCountries() {
    try { var v = JSON.parse(localStorage.getItem(FAV_COUNTRIES_KEY)); if (Array.isArray(v)) return v; } catch (e) {}
    return DEFAULT_FAVS.slice();
}
function setFavCountries(arr) { localStorage.setItem(FAV_COUNTRIES_KEY, JSON.stringify(arr)); }
function isFavCountry(code) { return getFavCountries().indexOf(code) !== -1; }
function toggleFavCountry(code) {
    var f = getFavCountries();
    var i = f.indexOf(code);
    if (i === -1) f.push(code); else f.splice(i, 1);
    setFavCountries(f);
    renderCountryGrid();
}

function renderCountryGrid() {
    var grid = document.getElementById('csGrid');
    if (!grid) return;
    var favs = getFavCountries();
    var empty = document.getElementById('csGridEmpty');
    if (empty) empty.style.display = favs.length ? 'none' : 'block';
    grid.innerHTML = favs.map(function(code) {
        var name = countryNameByCode(code);
        return '<button class="mp__cs__country' + (code === currentCountryCode ? ' active' : '') + '" data-code="' + code + '" data-name="' + name + '">' +
            '<span class="fi fi-' + code + '"></span>' + name +
            '<i class="mp__cs__fav fa-solid fa-heart" data-fav="' + code + '" title="Remove from your countries"></i>' +
        '</button>';
    }).join('');
}

function renderCountrySearch(q) {
    var box = document.getElementById('csSearchResults');
    if (!box) return;
    q = (q || '').trim().toLowerCase();
    if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }
    var hits = ALL_COUNTRIES.filter(function(c) {
        return c.name.toLowerCase().indexOf(q) !== -1 || c.code === q;
    }).slice(0, 8);
    box.classList.add('open');
    if (!hits.length) { box.innerHTML = '<div class="mp__cs__sr__empty">No country found for "' + q + '"</div>'; return; }
    box.innerHTML = hits.map(function(c) {
        var fav = isFavCountry(c.code);
        return '<div class="mp__cs__sr__item" data-code="' + c.code + '">' +
            '<span class="fi fi-' + c.code + '"></span>' +
            '<span class="mp__cs__sr__name">' + c.name + '</span>' +
            '<i class="mp__cs__sr__fav fa-' + (fav ? 'solid' : 'regular') + ' fa-heart' + (fav ? ' is-fav' : '') + '" data-fav="' + c.code + '" title="' + (fav ? 'Saved' : 'Save to your countries') + '"></i>' +
        '</div>';
    }).join('');
}

function pickerIsElite() { return typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite; }
function updateCountryPickerMode() {
    var elite = pickerIsElite();
    var search = document.getElementById('csSearchWrap');
    var bottom = document.getElementById('csBottom');
    if (search) search.style.display = elite ? 'block' : 'none';
    if (bottom) bottom.style.display = elite ? 'none' : 'flex';
}

var csPickerOpen = false;
(function() {
    var btn = document.getElementById('csChangeBtn');
    var picker = document.getElementById('csPicker');
    if (!btn || !picker) return;

    btn.addEventListener('click', function() {
        csPickerOpen = !csPickerOpen;
        if (csPickerOpen) {
            renderCountryGrid();
            updateCountryPickerMode();
            picker.classList.add('mp__cs__picker--open');
        } else {
            picker.classList.remove('mp__cs__picker--open');
        }
        btn.innerHTML = csPickerOpen
            ? '<i class="fa-solid fa-xmark"></i> Close'
            : '<i class="fa-solid fa-sliders"></i> Change country';
    });

    // Grid: select a country (or heart to remove it from favourites)
    var grid = document.getElementById('csGrid');
    if (grid) grid.addEventListener('click', function(e) {
        var heart = e.target.closest('.mp__cs__fav');
        if (heart) { e.stopPropagation(); toggleFavCountry(heart.dataset.fav); return; }
        var chip = e.target.closest('.mp__cs__country');
        if (chip) loadCountry(chip.dataset.code);
    });

    // Elite search input
    var searchInput = document.getElementById('csSearchInput');
    if (searchInput) searchInput.addEventListener('input', function() { renderCountrySearch(this.value); });

    // Search results: heart to save/unsave, click row to navigate
    var results = document.getElementById('csSearchResults');
    if (results) results.addEventListener('click', function(e) {
        var heart = e.target.closest('.mp__cs__sr__fav');
        if (heart) {
            e.stopPropagation();
            toggleFavCountry(heart.dataset.fav);
            renderCountrySearch(searchInput ? searchInput.value : '');
            return;
        }
        var item = e.target.closest('.mp__cs__sr__item');
        if (item) {
            loadCountry(item.dataset.code);
            if (searchInput) searchInput.value = '';
            results.classList.remove('open');
            results.innerHTML = '';
        }
    });

    renderCountryGrid();
    updateCountryPickerMode();
}());

function applyCountryTheme(code) {
    var themes = {
        es:{primary:'#c0392b',accent:'#e67e22'},
        gb:{primary:'#003399',accent:'#cc0000'},
        fr:{primary:'#003087',accent:'#ED2939'},
        de:{primary:'#212121',accent:'#c62828'},
        it:{primary:'#006400',accent:'#c62828'},
        pt:{primary:'#003399',accent:'#006600'},
        us:{primary:'#3C3B6E',accent:'#B22234'},
        ch:{primary:'#cc0000',accent:'#cc0000'},
        ua:{primary:'#1a5276',accent:'#f39c12'}
    };
    var t = themes[code] || themes.es;
    document.documentElement.style.setProperty('--country-primary', t.primary);
    document.documentElement.style.setProperty('--country-accent',  t.accent);

    function hexRgba(hex, a) {
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return 'rgba('+r+','+g+','+b+','+a+')';
    }
    var bg = 'linear-gradient(135deg, #ffffff 52%, ' + hexRgba(t.primary, 0.06) + ' 100%)';
    var glow = 'radial-gradient(ellipse 65% 75% at 100% 0%, ' + hexRgba(t.primary, 0.09) + ' 0%, transparent 65%)';
    document.documentElement.style.setProperty('--country-hero-bg',   bg);
    document.documentElement.style.setProperty('--country-hero-glow', glow);
}

(function() {
    var track = document.getElementById('rnkTrack');
    var wrap  = document.querySelector('.rnk__section__wrap .rnk__track__wrap');
    if (wrap && track) {
        wrap.addEventListener('mouseenter', function() { track.style.animationPlayState = 'paused'; });
        wrap.addEventListener('mouseleave', function() { track.style.animationPlayState = 'running'; });
        track.addEventListener('click', function(e) {
            var card = e.target.closest('.rnk__card[data-id]');
            if (!card) return;
            var u = UNI.find(function(x) { return x.id === card.dataset.id; });
            if (u) showUniDetail(u);
        });
    }
}());

function buildRankCarousel(code) {
    var track = document.getElementById('rnkTrack');
    var label = document.getElementById('rnkCountryLabel');
    if (!track) return;

    var names = { es:'Spain', gb:'United Kingdom', fr:'France', de:'Germany',
                  it:'Italy', pt:'Portugal', us:'United States', ch:'Switzerland', ua:'Ukraine',
                  nl:'Netherlands', se:'Sweden', dk:'Denmark', be:'Belgium', fi:'Finland', ie:'Ireland' };
    if (label) label.textContent = names[code] || code.toUpperCase();

    var list = (typeof RANKING_DATA !== 'undefined' && RANKING_DATA[code]) || [];

    // Fallback: build a ranking from this country's own universities
    if (!list.length && typeof UNI !== 'undefined' && UNI.length) {
        list = UNI.slice()
            .sort(function(a, b) {
                if ((b.diff || 0) !== (a.diff || 0)) return (b.diff || 0) - (a.diff || 0);
                return (b.ts || 0) - (a.ts || 0);
            })
            .slice(0, 10)
            .map(function(u) { return { id: u.id, trend: 'stable' }; });
    }

    if (!list.length) { track.innerHTML = ''; return; }

    function cardHtml(item, i) {
        var u = UNI.find(function(x) { return x.id === item.id; }) ||
                { id: item.id, name: item.id, abbr: item.id.toUpperCase().slice(0,5), color: '#555', type: 'Public', fields: [], city: '' };

        var dbEntry = (typeof UNI_DB !== 'undefined') ? UNI_DB.find(function(x){ return x.id === u.id; }) : null;
        if (dbEntry && dbEntry.color) u = Object.assign({}, u, { color: dbEntry.color });
        var logo       = (typeof UNI_LOGOS !== 'undefined' && UNI_LOGOS[u.id]) || '';
        var medalCls   = i === 0 ? ' rnk__card--gold' : i === 1 ? ' rnk__card--silver' : i === 2 ? ' rnk__card--bronze' : '';
        var trendCls   = item.trend === 'up' ? 'up' : item.trend === 'down' ? 'down' : 'stable';
        var trendLabel = item.trend === 'up' ? '↑ Rising' : item.trend === 'down' ? '↓ Falling' : '— Stable';
        var trendGlyph = item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '—';
        var abbr4      = (u.abbr || u.name.slice(0,4)).slice(0,5);
        var logoHtml   = logo
            ? '<img class="rnk__logo__img" src="' + logo + '" alt="' + abbr4 + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
              '<div class="rnk__logo__fallback" style="background:' + (u.color||'#555') + ';display:none">' + abbr4 + '</div>'
            : '<div class="rnk__logo__fallback" style="background:' + (u.color||'#555') + '">' + abbr4 + '</div>';
        var fields = (u.fields || []).slice(0, 2);
        return '<div class="rnk__card' + medalCls + '" data-id="' + u.id + '" style="cursor:pointer">' +
            '<div class="rnk__rank__overlay"><span class="rnk__num">' + (i + 1) + '</span></div>' +
            '<div class="rnk__trend__pill rnk__trend__pill--' + trendCls + '">' + trendGlyph + '</div>' +
            logoHtml +
            '<div class="rnk__hover__panel">' +
                '<div class="rnk__hv__top">' +
                    '<div class="rnk__hv__abbr" style="background:' + (u.color||'#555') + '">' + abbr4 + '</div>' +
                    '<div class="rnk__hv__meta">' +
                        '<div class="rnk__hv__name">' + (u.name || u.abbr) + '</div>' +
                        '<div class="rnk__hv__trend rnk__hv__trend--' + trendCls + '">' + trendLabel + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="rnk__hv__stats">' +
                    '<div class="rnk__hv__stat"><i class="fa-solid fa-location-dot"></i><span>' + (u.city || '—') + '</span></div>' +
                    '<div class="rnk__hv__stat"><i class="fa-solid fa-building-columns"></i><span>' + (u.type || '—') + '</span></div>' +
                    (fields[0] ? '<div class="rnk__hv__stat"><i class="fa-solid fa-book-open"></i><span>' + fields[0] + '</span></div>' : '') +
                    (fields[1] ? '<div class="rnk__hv__stat"><i class="fa-solid fa-star"></i><span>' + fields[1] + '</span></div>' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    var cards = list.map(cardHtml).join('');

    // Repeat cards so a single set is always wide enough to overflow the screen,
    // otherwise the marquee shows empty space / its end before looping.
    var MIN_CARDS = 14;
    if (list.length && list.length < MIN_CARDS) {
        var reps = Math.ceil(MIN_CARDS / list.length);
        cards = new Array(reps).fill(cards).join('');
    }

    track.innerHTML = '<div class="rnk__set">' + cards + '</div>' +
                      '<div class="rnk__set" aria-hidden="true">' + cards + '</div>';
}

function updateSliderRange() {
    var slider = document.getElementById('mpdBudgetSlider');
    if (!slider) return;

    var unis  = (typeof UNI !== 'undefined' && UNI.length) ? UNI : [];
    var costs = unis.map(tuitionMinCost).filter(function(c) { return c > 0; });
    var cheapest = costs.length ? Math.min.apply(null, costs) : 700;

    var rMin = Math.max(300, Math.floor(cheapest / 100) * 100);
    var rMax = 30000;

    slider.min  = rMin;
    slider.max  = rMax;
    slider.step = 100;
    if (+slider.value < rMin) slider.value = rMin;
    if (+slider.value > rMax) slider.value = rMax;

    var minLbl = document.getElementById('mpdBudgetMin');
    var maxLbl = document.getElementById('mpdBudgetMax');
    if (minLbl) minLbl.textContent = '€' + rMin.toLocaleString() + '/yr';
    if (maxLbl) maxLbl.textContent = '€' + rMax.toLocaleString() + '/yr';
    renderBudgetMatches();
}

var _bmPage = 1;
var BM_PER_PAGE = 8;
var _bmMatched = [];

function renderBudgetPage() {
    var grid = document.getElementById('budgetMatchGrid');
    var pagEl = document.getElementById('bmPagination');
    var prevBtn = document.getElementById('bmPrev');
    var nextBtn = document.getElementById('bmNext');
    var infoEl  = document.getElementById('bmPagInfo');
    if (!grid) return;

    var total = _bmMatched.length;
    var totalPages = Math.max(1, Math.ceil(total / BM_PER_PAGE));
    if (_bmPage > totalPages) _bmPage = totalPages;
    if (_bmPage < 1) _bmPage = 1;

    var slice = _bmMatched.slice((_bmPage - 1) * BM_PER_PAGE, _bmPage * BM_PER_PAGE);

    grid.innerHTML = slice.map(function(u) {
        var on       = getSaved().indexOf(u.id) !== -1;
        var col      = u.color || 'var(--orange)';
        var cRank    = (typeof UNI !== 'undefined') ? UNI.indexOf(u) + 1 : 0;
        var rankHtml = cRank > 0 ? '<span class="bm__rank">#' + cRank + '</span>' : '';
        var tc       = uniIsPublic(u) ? 'bm__chip--pub' : 'bm__chip--priv';
        var fields   = (u.fields || []).slice(0, 3);
        var extra    = (u.fields || []).length > 3 ? '<span class="bm__field__more">+' + ((u.fields.length) - 3) + '</span>' : '';
        return '<div class="bm__card" style="--bm-accent:' + col + ';border-left-color:' + col + '" data-id="' + u.id + '">' +
            '<div class="bm__card__head">' +
                '<div class="bm__card__head__left">' +
                    '<div class="bm__abbr" style="background:' + col + '">' + (u.abbr || '?') + '</div>' +
                    rankHtml +
                '</div>' +
                '<button class="bm__save mp__save__btn" data-id="' + u.id + '" style="color:' + (on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)') + '">' +
                    '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>' +
                '</button>' +
            '</div>' +
            '<div class="bm__name">' + (u.name || '?') + '</div>' +
            '<div class="bm__chips">' +
                '<span class="bm__chip bm__chip--city"><i class="fa-solid fa-location-dot"></i> ' + (u.city || '—') + '</span>' +
                '<span class="bm__chip ' + tc + '">' + uniTypeLabel(u) + '</span>' +
                '<span class="bm__chip bm__chip--tuition"><i class="fa-solid fa-coins"></i> ' + uniTuitionLabel(u) + '</span>' +
            '</div>' +
            '<div class="bm__fields">' +
                fields.map(function(f){ return '<span class="bm__field__tag">' + f + '</span>'; }).join('') +
                extra +
            '</div>' +
            '<div class="bm__stats">' +
                (u.dl       ? '<span class="bm__stat"><i class="fa-solid fa-gauge-high"></i> ' + u.dl + '</span>' : '') +
                (u.founded  ? '<span class="bm__stat"><i class="fa-solid fa-building-columns"></i> Est. ' + u.founded + '</span>' : '') +
                (u.students ? '<span class="bm__stat"><i class="fa-solid fa-user-group"></i> ' + u.students + '</span>' : '') +
            '</div>' +
        '</div>';
    }).join('');

    grid.querySelectorAll('.bm__card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (e.target.closest('.mp__save__btn')) return;
            var u = UNI.find(function(x) { return x.id === card.dataset.id; });
            if (u) showUniDetail(u);
        });
    });
    attachSave(grid);

    if (pagEl) {
        pagEl.style.display = totalPages > 1 ? 'flex' : 'none';
        if (infoEl) infoEl.textContent = 'Page ' + _bmPage + ' of ' + totalPages + ' (' + total + ' total)';
        if (prevBtn) prevBtn.disabled = _bmPage <= 1;
        if (nextBtn) nextBtn.disabled = _bmPage >= totalPages;
    }
}

(function() {
    var prevBtn = document.getElementById('bmPrev');
    var nextBtn = document.getElementById('bmNext');
    if (prevBtn) prevBtn.addEventListener('click', function() { _bmPage--; renderBudgetPage(); });
    if (nextBtn) nextBtn.addEventListener('click', function() { _bmPage++; renderBudgetPage(); });
}());

function renderBudgetMatches() {
    var section = document.getElementById('budgetSection');
    var slider  = document.getElementById('mpdBudgetSlider');
    var subEl   = document.getElementById('budgetSectionSub');
    if (!slider || !section) return;

    var budget = +slider.value;
    var budgetChosen = !!getProfile().budgetSet;

    // Header badge: show the prompt until the user actually picks a budget.
    var badge = document.getElementById('budgetBadge');
    if (badge) {
        if (!budgetChosen) {
            badge.innerHTML = '<span class="mp__budget__badge__lbl">Budget</span>' +
                              '<span class="mp__budget__badge__hint">How much are we spending this year?</span>';
            badge.className = 'mp__budget__badge mp__budget__badge--prompt';
            badge.style.display = 'inline-flex';
        } else {
            var kLabel = budget >= 1000
                ? '€' + (budget / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k/year'
                : '€' + budget.toLocaleString() + '/year';
            badge.textContent = kLabel;
            badge.className = 'mp__budget__badge' +
                (budget > 15000 ? ' mp__budget__badge--high' : budget > 5000 ? ' mp__budget__badge--mid' : '');
            badge.style.display = 'inline-flex';
        }
    }

    _bmMatched = (typeof UNI !== 'undefined' ? UNI : []).filter(function(u) {
        return tuitionMinCost(u) <= budget;
    });

    if (_bmMatched.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    var n = _bmMatched.length;
    if (subEl) {
        subEl.textContent = 'Budget: €' + budget.toLocaleString() + '/yr — '
            + n + ' universit' + (n === 1 ? 'y fits' : 'ies fit');
    }

    _bmPage = 1;
    renderBudgetPage();
}

function updateDshWidgets() {
    var dlEl    = document.getElementById('dshNextDeadline');
    var lblEl   = document.getElementById('dshDeadlineLabel');
    if (dlEl) {
        var done   = getDlDone ? getDlDone() : [];
        var custom = getDlCustom ? getDlCustom() : [];
        var pinId  = getDlPin ? getDlPin() : null;

        var allItems = (typeof DEADLINES !== 'undefined' ? DEADLINES : [])
            .filter(function(d) { return d.country === currentCountryCode; })
            .concat(custom.map(function(d) {
                return { id: d.id, uniAbbr: '★', uniColor: '#6c63ff', type: d.type, title: d.title, date: d.date };
            }));

        var pinned = pinId ? allItems.find(function(d) { return d.id === pinId; }) : null;
        var next   = null;
        if (!pinned) {
            next = allItems
                .filter(function(d) { return done.indexOf(d.id) === -1; })
                .sort(function(a, b) { return new Date(a.date) - new Date(b.date); })[0] || null;
        }

        var d = pinned || next;
        if (lblEl) lblEl.textContent = pinned ? '📌 Pinned' : 'Next Deadline';

        if (!d) {
            dlEl.textContent = 'No upcoming deadlines';
        } else {
            var cd   = typeof getCountdown === 'function' ? getCountdown(d.date) : { label: d.date };
            var abbr = (d.uniAbbr || '★').slice(0, 3);
            dlEl.textContent = abbr + ' — ' + (cd.label || d.date);
        }
    }

    if (typeof updateHeroFeed === 'function') updateHeroFeed();
}

(function() {
    var w = document.getElementById('dshDeadlineWidget');
    if (w) w.addEventListener('click', function() { showTab('tracker'); });
})();

var COUNTRY_TZ = {
    es: 'Europe/Madrid',  gb: 'Europe/London',   fr: 'Europe/Paris',
    de: 'Europe/Berlin',  it: 'Europe/Rome',      pt: 'Europe/Lisbon',
    us: 'America/New_York', ch: 'Europe/Zurich',  ua: 'Europe/Kyiv'
};

function getDestTime() {
    var tz  = COUNTRY_TZ[currentCountryCode] || Intl.DateTimeFormat().resolvedOptions().timeZone;
    var now = new Date();

    var parts = {};
    new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
    }).formatToParts(now).forEach(function(p) { parts[p.type] = parseInt(p.value) || 0; });
    return { h: parts.hour || 0, m: parts.minute || 0, s: parts.second || 0, tz: tz, raw: now };
}

(function() {
    var canvas  = document.getElementById('dshClockCanvas');
    var timeEl  = document.getElementById('dshClockTime');
    var dateEl  = document.getElementById('dshClockDate');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    function draw() {
        var W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
        var r = Math.min(W, H) / 2 - 4;
        var dt = getDestTime();
        var h = dt.h % 12, m = dt.m, s = dt.s;

        ctx.clearRect(0, 0, W, H);

        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1.5; ctx.stroke();

        for (var i = 0; i < 12; i++) {
            var ang = (i / 12) * 2 * Math.PI - Math.PI / 2;
            var isMaj = i % 3 === 0;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * (r - (isMaj ? 8 : 5)),
                       cy + Math.sin(ang) * (r - (isMaj ? 8 : 5)));
            ctx.lineTo(cx + Math.cos(ang) * (r - 1),
                       cy + Math.sin(ang) * (r - 1));
            ctx.strokeStyle = isMaj ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.25)';
            ctx.lineWidth = isMaj ? 2 : 1; ctx.stroke();
        }

        var hAng = ((h + m / 60) / 12) * 2 * Math.PI - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(hAng) * r * 0.50, cy + Math.sin(hAng) * r * 0.50);
        ctx.strokeStyle = 'rgba(0,0,0,0.90)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.stroke();

        var mAng = ((m + s / 60) / 60) * 2 * Math.PI - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(mAng) * r * 0.74, cy + Math.sin(mAng) * r * 0.74);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();

        var sAng = (s / 60) * 2 * Math.PI - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(sAng) * r * 0.20, cy - Math.sin(sAng) * r * 0.20);
        ctx.lineTo(cx + Math.cos(sAng) * r * 0.84, cy + Math.sin(sAng) * r * 0.84);
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#e74c3c'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fill();

        if (timeEl) timeEl.textContent = String(dt.h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
        if (dateEl) {
            dateEl.textContent = new Intl.DateTimeFormat('en-GB', {
                timeZone: dt.tz, weekday: 'short', day: 'numeric', month: 'short'
            }).format(dt.raw);
        }
    }
    draw();
    setInterval(draw, 1000);
}());

(function() {
    var saved = localStorage.getItem(typeof COUNTRY_KEY !== 'undefined' ? COUNTRY_KEY : 'uniscout_country') || 'es';

    var CS_NAMES = { es:'Spain', gb:'United Kingdom', fr:'France', de:'Germany',
                     it:'Italy', pt:'Portugal', us:'United States', ch:'Switzerland', ua:'Ukraine' };
    var csFlagEl = document.getElementById('csFlag');
    var csNameEl = document.getElementById('csName');
    if (csFlagEl) csFlagEl.className = 'mp__cs__flag fi fi-' + saved;
    if (csNameEl) csNameEl.textContent = CS_NAMES[saved] || saved.toUpperCase();
    document.querySelectorAll('.mp__cs__country').forEach(function(b) {
        b.classList.toggle('active', b.dataset.code === saved);
    });

    loadCountry(saved);

    var slider = document.getElementById('mpdBudgetSlider');
    if (slider) {
        slider.addEventListener('input', function() { renderBudgetMatches(); });
        updateSliderRange();
    }
    var adjBtn = document.getElementById('budgetAdjustBtn');
    if (adjBtn) {
        adjBtn.addEventListener('click', function() {

            var drop = document.getElementById('profileDropdown');
            if (drop) drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
        });
    }
}());

(function() {
    var overlay   = document.getElementById('browseAllOverlay');
    var openBtn   = document.getElementById('browseAllBtn');
    var closeBtn  = document.getElementById('browseAllClose');
    var listEl    = document.getElementById('baList');
    var pagEl     = document.getElementById('baPagination');
    var searchEl  = document.getElementById('baSearch');
    var clearEl   = document.getElementById('baClearSearch');
    var labelEl   = document.getElementById('baResultsLabel');
    var countryLbl= document.getElementById('baCountryLabel');
    if (!overlay || !openBtn) return;

    var baPage = 1;
    var BA_PER = 15;
    var baQuery = '';

    function baFilteredList() {
        var q = baQuery.toLowerCase();
        if (!q) return UNI.slice();
        return UNI.filter(function(u) {
            return (u.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (u.abbr || '').toLowerCase().indexOf(q) !== -1 ||
                   (u.city || '').toLowerCase().indexOf(q) !== -1;
        });
    }

    function baRenderPage() {
        var hits  = baFilteredList();
        var total = Math.max(1, Math.ceil(hits.length / BA_PER));
        baPage    = Math.min(baPage, total);
        var page  = hits.slice((baPage - 1) * BA_PER, baPage * BA_PER);

        if (labelEl) labelEl.textContent = hits.length + ' universit' + (hits.length === 1 ? 'y' : 'ies') + (baQuery ? ' matching "' + baQuery + '"' : '');

        listEl.innerHTML = page.map(function(u) {
            var on  = getSaved().indexOf(u.id) !== -1;
            var col = u.color || '#555';
            return '<div class="ba__item" data-id="' + u.id + '">' +
                '<div class="ba__item__abbr" style="background:' + col + '">' + (u.abbr || '?') + '</div>' +
                '<div class="ba__item__info">' +
                    '<div class="ba__item__name">' + (u.name || '?') + '</div>' +
                    '<div class="ba__item__meta">' +
                        '<span class="mp__badge mp__badge--city"><i class="fa-solid fa-location-dot" style="font-size:7px;margin-right:2px"></i>' + (u.city || '—') + '</span>' +
                        '<span class="mp__badge ' + (uniIsPublic(u) ? 'mp__badge--pub' : 'mp__badge--priv') + '">' + uniTypeLabel(u) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="ba__item__tuition">' + uniTuitionLabel(u) + '</div>' +
                '<button class="mp__save__btn" data-id="' + u.id + '" style="color:' + (on ? 'rgb(228,155,20)' : 'rgba(0,0,0,.2)') + '">' +
                    '<i class="fa-' + (on ? 'solid' : 'regular') + ' fa-bookmark"></i>' +
                '</button>' +
            '</div>';
        }).join('') || '<div class="ba__empty"><i class="fa-solid fa-magnifying-glass"></i><p>No universities found</p></div>';

        attachSave(listEl);
        listEl.querySelectorAll('.ba__item').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.mp__save__btn')) return;
                var u = UNI.find(function(x) { return x.id === row.dataset.id; });
                if (u) { overlay.classList.remove('open'); showUniDetail(u); }
            });
        });

        if (!pagEl) return;
        if (total <= 1) { pagEl.innerHTML = ''; return; }
        var html = '<button class="ba__pg__btn" ' + (baPage === 1 ? 'disabled' : '') + ' id="baPrev"><i class="fa-solid fa-chevron-left"></i></button>';
        var sp = Math.max(1, baPage - 2), ep = Math.min(total, baPage + 2);
        if (sp > 1) html += '<span class="ba__pg__dots">…</span>';
        for (var p = sp; p <= ep; p++) {
            html += '<button class="ba__pg__num' + (p === baPage ? ' ba__pg__num--active' : '') + '" data-p="' + p + '">' + p + '</button>';
        }
        if (ep < total) html += '<span class="ba__pg__dots">…</span>';
        html += '<button class="ba__pg__btn" ' + (baPage === total ? 'disabled' : '') + ' id="baNext"><i class="fa-solid fa-chevron-right"></i></button>';
        pagEl.innerHTML = html;
        pagEl.querySelector('#baPrev').addEventListener('click', function() { if (baPage > 1) { baPage--; baRenderPage(); } });
        pagEl.querySelector('#baNext').addEventListener('click', function() { if (baPage < total) { baPage++; baRenderPage(); } });
        pagEl.querySelectorAll('.ba__pg__num').forEach(function(btn) {
            btn.addEventListener('click', function() { baPage = parseInt(btn.dataset.p); baRenderPage(); });
        });
    }

    function openBrowseAll() {
        if (countryLbl) {
            var names = { es:'Spain', gb:'United Kingdom', fr:'France', de:'Germany',
                          it:'Italy', pt:'Portugal', us:'United States', ch:'Switzerland', ua:'Ukraine' };
            countryLbl.textContent = names[currentCountryCode] || currentCountryCode.toUpperCase();
        }
        baPage = 1; baQuery = '';
        if (searchEl) { searchEl.value = ''; }
        if (clearEl)  { clearEl.style.display = 'none'; }
        baRenderPage();
        overlay.classList.add('open');
    }

    openBtn.addEventListener('click', openBrowseAll);
    closeBtn.addEventListener('click', function() { overlay.classList.remove('open'); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.classList.remove('open'); });

    if (searchEl) {
        searchEl.addEventListener('input', function() {
            baQuery = searchEl.value.trim();
            if (clearEl) clearEl.style.display = baQuery ? 'flex' : 'none';
            baPage = 1;
            baRenderPage();
        });
    }
    if (clearEl) {
        clearEl.addEventListener('click', function() {
            baQuery = ''; if (searchEl) searchEl.value = '';
            clearEl.style.display = 'none';
            baPage = 1; baRenderPage();
        });
    }
}());

var UI_STRINGS = {
    en: {
        nav_overview:'Overview', nav_explore:'Explore', nav_compare:'Apply',
        nav_cityguide:'Chances', nav_tracker:'Deadlines',
        saved_title:'Saved Universities', saved_sub:'Universities you bookmarked for later',
        budget_title:'Universities Matching Your Budget',
        rnk_sub:'Rankings updated regularly · Hover a card for details',
        monthly_budget:'Annual Tuition Budget', language:'Language',
        browse_all:'Browse all', compare_btn:'Compare',
        filter_off:'Filter off — budget is for reference only',
        filter_on:'Filter on — only showing universities within budget',
    },
    es: {
        nav_overview:'Resumen', nav_explore:'Explorar', nav_compare:'Comparar',
        nav_cityguide:'Perspectivas', nav_tracker:'Fechas límite',
        saved_title:'Universidades guardadas', saved_sub:'Universidades que has marcado',
        budget_title:'Universidades según tu presupuesto',
        rnk_sub:'Clasificaciones actualizadas · Pasa el cursor para más info',
        monthly_budget:'Presupuesto mensual', language:'Idioma',
        browse_all:'Ver todas', compare_btn:'Comparar',
        filter_off:'Filtro desactivado — presupuesto de referencia',
        filter_on:'Filtro activado — solo universidades dentro del presupuesto',
    },
    fr: {
        nav_overview:'Aperçu', nav_explore:'Explorer', nav_compare:'Comparer',
        nav_cityguide:'Perspectives', nav_tracker:'Échéances',
        saved_title:'Universités sauvegardées', saved_sub:'Universités que vous avez marquées',
        budget_title:'Universités dans votre budget',
        rnk_sub:'Classements mis à jour · Survolez pour les détails',
        monthly_budget:'Budget mensuel', language:'Langue',
        browse_all:'Voir tout', compare_btn:'Comparer',
        filter_off:'Filtre désactivé — budget à titre indicatif',
        filter_on:'Filtre activé — universités dans le budget uniquement',
    },
    de: {
        nav_overview:'Übersicht', nav_explore:'Erkunden', nav_compare:'Vergleichen',
        nav_cityguide:'Einblicke', nav_tracker:'Fristen',
        saved_title:'Gespeicherte Universitäten', saved_sub:'Lesezeichen für später',
        budget_title:'Universitäten in deinem Budget',
        rnk_sub:'Rankings regelmäßig aktualisiert · Hover für Details',
        monthly_budget:'Monatsbudget', language:'Sprache',
        browse_all:'Alle anzeigen', compare_btn:'Vergleichen',
        filter_off:'Filter aus — Budget nur zur Referenz',
        filter_on:'Filter ein — nur Universitäten im Budget',
    },
    it: {
        nav_overview:'Panoramica', nav_explore:'Esplora', nav_compare:'Confronta',
        nav_cityguide:'Approfondimenti', nav_tracker:'Scadenze',
        saved_title:'Università salvate', saved_sub:'Università nei tuoi segnalibri',
        budget_title:'Università nel tuo budget',
        rnk_sub:'Classifiche aggiornate · Passa il mouse per i dettagli',
        monthly_budget:'Budget mensile', language:'Lingua',
        browse_all:'Vedi tutte', compare_btn:'Confronta',
        filter_off:'Filtro disattivato — budget di riferimento',
        filter_on:'Filtro attivato — solo università nel budget',
    },
    pt: {
        nav_overview:'Visão geral', nav_explore:'Explorar', nav_compare:'Comparar',
        nav_cityguide:'Perspetivas', nav_tracker:'Prazos',
        saved_title:'Universidades guardadas', saved_sub:'Universidades nos seus favoritos',
        budget_title:'Universidades no seu orçamento',
        rnk_sub:'Rankings atualizados · Passe o rato para detalhes',
        monthly_budget:'Orçamento mensal', language:'Idioma',
        browse_all:'Ver todas', compare_btn:'Comparar',
        filter_off:'Filtro desligado — orçamento de referência',
        filter_on:'Filtro ligado — só universidades no orçamento',
    },
    uk: {
        nav_overview:'Огляд', nav_explore:'Пошук', nav_compare:'Порівняння',
        nav_cityguide:'Аналітика', nav_tracker:'Дедлайни',
        saved_title:'Збережені університети', saved_sub:'Університети у закладках',
        budget_title:'Університети за бюджетом',
        rnk_sub:'Рейтинги оновлюються · Наведіть для деталей',
        monthly_budget:'Місячний бюджет', language:'Мова',
        browse_all:'Переглянути всі', compare_btn:'Порівняти',
        filter_off:'Фільтр вимкнено — бюджет орієнтовний',
        filter_on:'Фільтр увімкнено — лише університети в бюджеті',
    },
    pl: {
        nav_overview:'Przegląd', nav_explore:'Eksploruj', nav_compare:'Porównaj',
        nav_cityguide:'Spostrzeżenia', nav_tracker:'Terminy',
        saved_title:'Zapisane uczelnie', saved_sub:'Uczelnie dodane do zakładek',
        budget_title:'Uczelnie w Twoim budżecie',
        rnk_sub:'Rankingi aktualizowane · Najedź po szczegóły',
        monthly_budget:'Miesięczny budżet', language:'Język',
        browse_all:'Przeglądaj wszystkie', compare_btn:'Porównaj',
        filter_off:'Filtr wyłączony — budżet orientacyjny',
        filter_on:'Filtr włączony — tylko uczelnie w budżecie',
    }
};

function applyLanguage(lang) {
    var t = UI_STRINGS[lang] || UI_STRINGS.en;

    document.querySelectorAll('.mp__nav__btn[data-tab]').forEach(function(btn) {
        var key = 'nav_' + btn.dataset.tab;
        if (!t[key]) return;
        var icon = btn.querySelector('i');
        btn.textContent = ' ' + t[key];
        if (icon) btn.insertBefore(icon, btn.firstChild);
    });

    var savedGrid = document.getElementById('savedGrid');
    if (savedGrid) {
        var savedSect = savedGrid.closest('.mp__section');
        if (savedSect) {
            var savedTitle = savedSect.querySelector('.mp__section__title');
            if (savedTitle) savedTitle.innerHTML = '<i class="fa-solid fa-bookmark"></i> ' + t.saved_title;
        }
    }

    var budgetTitle = document.querySelector('#budgetSection .mp__section__title');
    if (budgetTitle) budgetTitle.innerHTML = '<i class="fa-solid fa-piggy-bank"></i> ' + t.budget_title;

    var rnkSub = document.querySelector('.rnk__section__sub');
    if (rnkSub) rnkSub.textContent = t.rnk_sub;

    var browseBtn = document.getElementById('browseAllBtn');
    if (browseBtn) browseBtn.innerHTML = '<i class="fa-solid fa-list-ol"></i> ' + t.browse_all;

    var mpdBudgetLbl = document.querySelector('.mpd__section__label .fa-piggy-bank');
    if (mpdBudgetLbl) mpdBudgetLbl.parentElement.innerHTML = '<i class="fa-solid fa-piggy-bank"></i> ' + t.monthly_budget;

    var mpdLangLbl = document.querySelector('.mpd__section__label .fa-language');
    if (mpdLangLbl) mpdLangLbl.parentElement.innerHTML = '<i class="fa-solid fa-language"></i> ' + t.language;

    var modeLabel = document.getElementById('mpdBudgetModeLabel');
    if (modeLabel) {
        var isOn = document.getElementById('mpdBudgetMode') && document.getElementById('mpdBudgetMode').checked;
        modeLabel.textContent = isOn ? t.filter_on : t.filter_off;
    }

    document.documentElement.lang = lang === 'uk' ? 'uk' : lang;
}

(function() {
    function makeUniAutocomplete(inputId, hiddenId, suggId) {
        var input  = document.getElementById(inputId);
        var hidden = document.getElementById(hiddenId);
        var sugg   = document.getElementById(suggId);
        if (!input || !hidden || !sugg) return;

        var SUGG_STYLE = 'padding:10px 13px;cursor:pointer;font-size:.78rem;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:9px;color:#eef1f6;background:transparent;transition:background .14s';

        function showSugg(list) {
            if (!list.length) { sugg.style.display = 'none'; return; }
            sugg.innerHTML = list.slice(0, 10).map(function(u) {
                return '<div class="ins__sugg__item" data-id="' + u.id + '" style="' + SUGG_STYLE + '">' +
                    '<span style="font-weight:800;color:#f0a84a;flex-shrink:0;font-size:.72rem;min-width:34px">' + (u.abbr || '') + '</span>' +
                    '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + u.name + '</span>' +
                '</div>';
            }).join('');
            sugg.querySelectorAll('.ins__sugg__item').forEach(function(item) {
                item.addEventListener('mouseenter', function() { item.style.background = 'rgba(240,168,74,.16)'; });
                item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
                item.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    var u = (typeof UNI !== 'undefined' ? UNI : []).find(function(x){ return x.id === item.dataset.id; });
                    if (u) {
                        input.value  = u.name;
                        hidden.value = u.id;
                        sugg.style.display = 'none';
                    }
                });
            });
            sugg.style.display = 'block';
        }

        input.addEventListener('input', function() {
            var q = input.value.trim().toLowerCase();
            hidden.value = '';
            if (!q) { sugg.style.display = 'none'; return; }
            var matches = (typeof UNI !== 'undefined' ? UNI : []).filter(function(u) {
                return (u.name || '').toLowerCase().indexOf(q) !== -1 ||
                       (u.abbr || '').toLowerCase().indexOf(q) !== -1 ||
                       (u.city || '').toLowerCase().indexOf(q) !== -1;
            });
            showSugg(matches);
        });

        input.addEventListener('blur', function() {
            setTimeout(function() { sugg.style.display = 'none'; }, 150);
        });
        input.addEventListener('focus', function() {
            if (input.value.trim() && !hidden.value) input.dispatchEvent(new Event('input'));
        });
    }

    makeUniAutocomplete('salUniInput', 'salUni', 'salUniSugg');
    makeUniAutocomplete('admUniInput', 'admUni', 'admUniSugg');
    makeUniAutocomplete('roiUniInput', 'roiUni', 'roiUniSugg');
}());

(function() {
    var input  = document.getElementById('evUniInput');
    var hidden = document.getElementById('evUniSel');
    var sugg   = document.getElementById('evUniSugg');
    if (!input || !hidden || !sugg) return;

    var SUGG_STYLE = 'padding:9px 13px;cursor:pointer;font-size:.78rem;border-bottom:1px solid rgba(0,0,0,.07);display:flex;align-items:center;gap:8px;color:#1a1a2e;background:#fff';

    function getSavedUnis() {
        var saved = getSaved();
        var all = typeof UNI !== 'undefined' ? UNI : [];
        var db  = typeof UNI_DB !== 'undefined' ? UNI_DB : [];
        var result = [];
        saved.forEach(function(id) {
            var u = all.find(function(x){ return x.id === id; });
            if (!u) u = db.find(function(x){ return x.id === id; });
            if (u) result.push(u);
        });
        return result;
    }

    function showSugg(list) {
        if (!list.length) { sugg.style.display = 'none'; return; }
        sugg.innerHTML = list.slice(0, 10).map(function(u) {
            return '<div class="ins__sugg__item" data-id="' + u.id + '" style="' + SUGG_STYLE + '">' +
                '<span style="font-weight:700;color:#9b59b6;flex-shrink:0">' + (u.abbr || '') + '</span>' +
                '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + u.name + '</span>' +
            '</div>';
        }).join('');
        sugg.querySelectorAll('.ins__sugg__item').forEach(function(item) {
            item.addEventListener('mouseenter', function() { item.style.background = 'rgba(155,89,182,.10)'; });
            item.addEventListener('mouseleave', function() { item.style.background = ''; });
            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                var unis = getSavedUnis();
                var u = unis.find(function(x){ return x.id === item.dataset.id; });
                if (u) { input.value = u.name; hidden.value = u.id; sugg.style.display = 'none'; }
            });
        });
        sugg.style.display = 'block';
    }

    input.addEventListener('input', function() {
        var q = input.value.trim().toLowerCase();
        hidden.value = '';
        if (!q) { sugg.style.display = 'none'; return; }
        var matches = getSavedUnis().filter(function(u) {
            return (u.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (u.abbr || '').toLowerCase().indexOf(q) !== -1;
        });
        showSugg(matches);
    });

    input.addEventListener('focus', function() {
        var unis = getSavedUnis();
        if (!input.value.trim()) {
            showSugg(unis);
        } else if (!hidden.value) {
            input.dispatchEvent(new Event('input'));
        }
    });

    input.addEventListener('blur', function() {
        setTimeout(function() { sugg.style.display = 'none'; }, 150);
    });
}());

(function() {
    var avatarBtn  = document.getElementById('mpAvatarBtn');
    var drop       = document.getElementById('profileDropdown');
    if (!avatarBtn || !drop) return;

    avatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = drop.style.display !== 'none';
        drop.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
            drop.style.animation = 'mpd-fadein .2s ease both';
            if (typeof updateTitleDisplay === 'function') updateTitleDisplay();
        }
    });
    document.addEventListener('click', function(e) {
        if (!drop.contains(e.target) && e.target !== avatarBtn) {
            drop.style.display = 'none';
        }
    });

    var prof = getProfile();

    var mpdAv    = document.getElementById('mpdAvatar');
    var mpdInput = document.getElementById('mpdAvatarInput');
    if (prof.avatar && mpdAv) {
        mpdAv.innerHTML = '<img src="' + prof.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';

        avatarBtn.innerHTML = '<img src="' + prof.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else if (mpdAv) {
        mpdAv.textContent = (user.username || 'U').charAt(0).toUpperCase();
    }
    if (mpdInput) {
        mpdInput.addEventListener('change', function() {
            var file = mpdInput.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                var img = new Image();
                img.onload = function() {
                    // Downscale avatars to keep localStorage small (avoids quota freezes)
                    var size = 256, c = document.createElement('canvas');
                    c.width = size; c.height = size;
                    var ctx = c.getContext('2d');
                    var s = Math.min(img.width, img.height);
                    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
                    var dataUrl;
                    try { dataUrl = c.toDataURL('image/jpeg', 0.85); } catch (e) { dataUrl = ev.target.result; }
                    if (mpdAv) mpdAv.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
                    try { var p = getProfile(); p.avatar = dataUrl; setProfile(p); }
                    catch (e) { alert('Could not save the photo — your browser storage may be full.'); return; }
                    var hdrBtn = document.getElementById('mpAvatarBtn');
                    if (hdrBtn) hdrBtn.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
                };
                img.onerror = function() { alert('That image could not be loaded.'); };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    var mpdUser    = document.getElementById('mpdUsername');
    var mpdHStatus = document.getElementById('mpdHStatus');
    var mpdHLang   = document.getElementById('mpdHLang');
    if (mpdUser)    mpdUser.textContent    = user.username || '';

    var STATUS_LABELS = {
        highschool: '🏫 High School Student', gap: '🌏 Gap Year', undergrad: '📖 Undergraduate',
        transfer: '🔄 Transfer Student',      masters: '🎓 Master\'s Applicant',
        phd: '🔬 PhD / Researcher',           professional: '💼 Working Professional', parent: '👨‍👧 Parent'
    };
    var LANG_LABELS = {
        en: '🇬🇧 English', es: '🇪🇸 Español', fr: '🇫🇷 Français',
        de: '🇩🇪 Deutsch', it: '🇮🇹 Italiano', pt: '🇵🇹 Português',
        uk: '🇺🇦 Українська', pl: '🇵🇱 Polski'
    };

    function updateStatusLabel() {
        var p = getProfile();
        if (mpdHStatus) mpdHStatus.textContent = STATUS_LABELS[p.status] || STATUS_LABELS.highschool;
        if (mpdHLang)   mpdHLang.textContent   = LANG_LABELS[p.lang]    || LANG_LABELS.en;
    }
    updateStatusLabel();

    var statusSel = document.getElementById('mpdStatusSelect');
    if (statusSel) {
        if (prof.status) statusSel.value = prof.status;
        statusSel.addEventListener('change', function() {
            var p = getProfile(); p.status = statusSel.value; setProfile(p);
            updateStatusLabel();
        });
    }

    var langSel = document.getElementById('mpdLangSelect');
    if (langSel) {
        if (prof.lang) { langSel.value = prof.lang; applyLanguage(prof.lang); }
        langSel.addEventListener('change', function() {
            var p = getProfile(); p.lang = langSel.value; setProfile(p);
            updateStatusLabel();
            applyLanguage(langSel.value);
        });
    }

    var mpdSlider    = document.getElementById('mpdBudgetSlider');
    var mpdAmt       = document.getElementById('mpdBudgetAmt');
    var mpdTier      = document.getElementById('mpdBudgetTier');
    var mpdModeChk   = document.getElementById('mpdBudgetMode');
    var mpdModeLabel = document.getElementById('mpdBudgetModeLabel');

    var BUDGET_TIERS = [
        { max: 1500,     label: 'Very tight', color: '#e74c3c' },
        { max: 4000,     label: 'Budget',     color: '#e67e22' },
        { max: 9000,     label: 'Comfortable',color: '#27ae60' },
        { max: 18000,    label: 'Generous',   color: '#2980b9' },
        { max: Infinity, label: 'Premium',    color: '#8e44ad' }
    ];

    function updateBudgetDisplay(budget) {
        if (mpdAmt) {
            mpdAmt.innerHTML = '€' + budget.toLocaleString() + '<span>/yr</span>';
        }
        if (mpdTier) {
            var tier = BUDGET_TIERS.find(function(t) { return budget <= t.max; })
                    || BUDGET_TIERS[BUDGET_TIERS.length - 1];
            mpdTier.textContent = tier.label;
            mpdTier.style.color = tier.color;
        }
    }

    if (mpdSlider) {
        var initBudget = prof.budget || 5000;
        mpdSlider.value = initBudget;
        updateBudgetDisplay(initBudget);

        mpdSlider.addEventListener('input', function() {
            var val = +mpdSlider.value;
            updateBudgetDisplay(val);
            var p = getProfile();
            p.budget = val;
            p.budgetSet = true;     // user has now chosen a budget (drives the header badge)
            setProfile(p);
            renderBudgetMatches();
        });
    }

    if (mpdModeChk) {
        if (prof.budgetMode) { mpdModeChk.checked = true; setBudgetMode(true); }
        if (mpdModeLabel) {
            mpdModeLabel.textContent = mpdModeChk.checked
                ? 'Filter on — only showing universities within budget'
                : 'Filter off — budget shown for reference';
        }
        mpdModeChk.addEventListener('change', function() {
            var on = mpdModeChk.checked;
            var p  = getProfile(); p.budgetMode = on; setProfile(p);
            setBudgetMode(on);
            if (mpdModeLabel) {
                mpdModeLabel.textContent = on
                    ? 'Filter on — only showing universities within budget'
                    : 'Filter off — budget shown for reference';
            }
        });
    }
}());

/* ── Overview scroll: lightweight fade-in + header shadow ── */
(function() {
    if (typeof IntersectionObserver === 'undefined') return;

    var hdr = document.querySelector('.mp__header');
    var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
            if (e.isIntersecting) {
                e.target.classList.remove('ovw__hidden');
                e.target.classList.add('ovw__reveal');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });

    /* Only hide + watch sections that start below the fold */
    setTimeout(function() {
        var vh = window.innerHeight;
        document.querySelectorAll('#tabOverview .mp__section').forEach(function(el) {
            if (el.getBoundingClientRect().top > vh) {
                el.classList.add('ovw__hidden');
                io.observe(el);
            }
        });
    }, 200);

    /* Header shadow — lightweight toggle */
    window.addEventListener('scroll', function() {
        if (hdr) hdr.classList.toggle('mp__header--deep', window.scrollY > 40);
    }, { passive: true });
}());

/* ── Elite subscription (Stripe-backed) ──
 *
 * The payment backend (../server) is the source of truth. The browser only:
 *   • starts a Stripe Checkout Session and redirects to it,
 *   • opens the Stripe Customer Portal,
 *   • reads the server's verified subscription status to paint the UI.
 * No payment state is trusted from the client.
 */
// Resolve where the payment backend lives.
//  • opened via file://                         → localhost:4242
//  • opened on localhost with a different port   → localhost:4242  (e.g. VS Code Live Server :5500)
//  • served by the backend itself / production   → same origin
var PAY_API_BASE = (function () {
    if (location.protocol === 'file:') return 'http://localhost:4242';
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (isLocal && location.port !== '4242') return 'http://localhost:4242';
    return location.origin;
}());

// Fetch + safely parse JSON. Never throws on empty/non-JSON bodies (which is what
// produced the "Unexpected end of JSON input" error when /api wasn't reachable).
function payFetch(path, opts) {
    return fetch(PAY_API_BASE + path, opts).then(function (r) {
        return r.text().then(function (t) {
            var data = {};
            if (t) { try { data = JSON.parse(t); } catch (e) { data = { _parseError: true, _raw: t.slice(0, 200) }; } }
            return { ok: r.ok, status: r.status, data: data };
        });
    });
}

// ── Daily news digest: keep the server in sync with the user's saved universities ──
// (Saved unis live in localStorage, so the server can't see them unless we push.)
var DIGEST_ON_KEY = 'us_digest_on_' + user.id;
function digestEnabled() { return localStorage.getItem(DIGEST_ON_KEY) !== '0'; }   // default ON
function setDigestEnabled(on) { localStorage.setItem(DIGEST_ON_KEY, on ? '1' : '0'); }

function syncDigestSubscription() {
    try {
        if (!user || !user.email) return;
        if (!digestEnabled()) {
            payFetch('/api/digest/unsubscribe', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            }).catch(function () {});
            return;
        }
        var saved = getSaved();
        var allUnis = (typeof UNI !== 'undefined') ? UNI : [];
        var names = saved.map(function (id) {
            var u = allUnis.find(function (x) { return x.id === id; });
            return u ? (u.name || u.title) : null;
        }).filter(Boolean);
        payFetch('/api/digest/subscribe', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: user.email, userId: user.id, universities: names })
        }).catch(function () {});
    } catch (e) {}
}
try { syncDigestSubscription(); } catch (e) {}

// Profile-menu toggle for the daily news email.
(function () {
    var t = document.getElementById('mpdDigestToggle');
    var lbl = document.getElementById('mpdDigestLabel');
    if (!t) return;
    function paint() {
        var on = digestEnabled();
        t.checked = on;
        if (lbl) lbl.textContent = on
            ? 'On — a daily round-up of news about your saved universities.'
            : 'Off — you won\'t get the daily news email.';
    }
    if (!user || !user.email) { t.disabled = true; if (lbl) lbl.textContent = 'Sign in with an email to receive the daily news email.'; return; }
    paint();
    t.addEventListener('change', function () {
        setDigestEnabled(t.checked);
        paint();
        syncDigestSubscription();
    });
}());

var eliteState = { elite: false, status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false, cardBrand: null, cardLast4: null };

function isElite() { return !!eliteState.elite; }

function applyEliteUI() {
    var elite  = eliteState.elite;
    var avatar = document.getElementById('mpAvatarBtn');
    var wrap   = document.getElementById('mpAvatarWrap');
    if (avatar) avatar.classList.toggle('mp__avatar--elite', elite);
    if (wrap)   wrap.classList.toggle('is-elite', elite);

    var cta = document.querySelector('#openProModal .mp__cs__pro__cta__text');
    if (cta) cta.textContent = elite ? 'Elite member' : 'Unlock Elite';

    // Elite unlocks the "search any country" box in the destination picker
    if (typeof updateCountryPickerMode === 'function') updateCountryPickerMode();
    // Elite also unlocks the "Crowned Sovereign" title
    if (typeof updateTitleDisplay === 'function') updateTitleDisplay();
    // Elite-only "For You" matcher button (floating or header, per user preference)
    if (typeof window.updateFyButtons === 'function') window.updateFyButtons();
    // Elite: embed the matcher inline in Explore (replaces search + filter sections)
    if (typeof applyExploreMatcherLayout === 'function') applyExploreMatcherLayout();

    var btn = document.getElementById('getEliteBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.innerHTML = elite ? '<i class="fa-solid fa-gear"></i> Manage subscription' : 'Get Elite — €15/yr';
    }

    // Cache for instant paint on next load (purely cosmetic; server is authoritative)
    try { var p = getProfile(); p.elite = elite; setProfile(p); } catch (e) {}
}

// Fetch the verified status from the backend and repaint.
function refreshEliteStatus(cb) {
    payFetch('/api/subscription/status?userId=' + encodeURIComponent(user.id) +
        '&email=' + encodeURIComponent(user.email || '') +
        '&username=' + encodeURIComponent(user.username || ''))
        .then(function (res) {
            if (!res.ok || res.data._parseError) { if (cb) cb(null); return; }
            var d = res.data;
            eliteState = {
                elite: !!d.elite, status: d.status, currentPeriodEnd: d.currentPeriodEnd,
                cancelAtPeriodEnd: !!d.cancelAtPeriodEnd, cardBrand: d.cardBrand, cardLast4: d.cardLast4
            };
            applyEliteUI();
            if (cb) cb(eliteState);
        })
        .catch(function () { /* backend offline — keep the cached cosmetic state */ if (cb) cb(null); });
}

var PAY_SERVER_HINT = 'The payment server is not reachable at ' + PAY_API_BASE + '.\n\n' +
    '1) Start it:  cd server && npm start   (needs server/.env with your Stripe keys)\n' +
    '2) Open the site through it:  ' + PAY_API_BASE + '/mainPage.html';

function startEliteCheckout() {
    var btn = document.getElementById('getEliteBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting to checkout…'; }
    payFetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, username: user.username })
    })
        .then(function (res) {
            if (res.ok && res.data.url) { window.location.href = res.data.url; return; }
            if (res.status === 409) { openElitePortal(); return; }   // already subscribed → manage instead
            if (res.data._parseError || res.status === 404) { alert(PAY_SERVER_HINT); }
            else { alert('Could not start checkout: ' + (res.data.message || res.data.error || ('HTTP ' + res.status))); }
            applyEliteUI();
        })
        .catch(function () {
            alert(PAY_SERVER_HINT);
            applyEliteUI();
        });
}

function openElitePortal() {
    payFetch('/api/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
    })
        .then(function (res) {
            if (res.ok && res.data.url) { window.location.href = res.data.url; return; }
            if (res.data._parseError || res.status === 404) { alert('No billing profile found yet. Subscribe first to manage your plan.'); }
            else { alert('Could not open the billing portal: ' + (res.data.message || res.data.error || ('HTTP ' + res.status))); }
        })
        .catch(function () { alert(PAY_SERVER_HINT); });
}

// Lightweight checkout result banner (top-center toast).
function showCheckoutBanner(kind) {
    var ok = kind === 'success';
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:6000;' +
        'display:flex;align-items:center;gap:10px;padding:13px 20px;border-radius:13px;font-family:Montserrat,sans-serif;' +
        'font-size:13px;font-weight:700;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
        'background:' + (ok ? 'linear-gradient(135deg,#27ae60,#1e8e4f)' : 'linear-gradient(135deg,#e67e22,#d35400)') + ';' +
        'animation:arIn .3s ease both';
    bar.innerHTML = (ok
        ? '<i class="fa-solid fa-crown"></i> Payment successful — activating your Elite membership…'
        : '<i class="fa-solid fa-circle-info"></i> Checkout canceled — you have not been charged.');
    document.body.appendChild(bar);
    setTimeout(function () { bar.style.transition = 'opacity .4s'; bar.style.opacity = '0'; setTimeout(function () { bar.remove(); }, 400); }, ok ? 6000 : 4500);
}

// Paint instantly from cache, then verify against the server.
(function () {
    try { eliteState.elite = !!getProfile().elite; } catch (e) {}
    applyEliteUI();
    refreshEliteStatus();
}());

// Handle the redirect back from Stripe Checkout.
(function () {
    var params = new URLSearchParams(location.search);
    var c = params.get('checkout');
    if (!c) return;
    history.replaceState({}, '', location.pathname);   // clean the URL
    if (c === 'success') {
        showCheckoutBanner('success');
        var sid = params.get('session_id');
        // Confirm the paid session server-side (writes Elite to the DB immediately),
        // then refresh. A short poll covers the webhook path as a fallback.
        if (sid) {
            payFetch('/api/checkout/confirm?session_id=' + encodeURIComponent(sid))
                .then(function () { refreshEliteStatus(); })
                .catch(function () { refreshEliteStatus(); });
        }
        var tries = 0;
        (function poll() {
            refreshEliteStatus(function (st) {
                if (st && st.elite) return;
                if (++tries < 6) setTimeout(poll, 2000);
            });
        }());
    } else if (c === 'cancel') {
        showCheckoutBanner('cancel');
    }
}());

(function() {
    var overlay  = document.getElementById('pricingOverlay');
    var openBtn  = document.getElementById('openProModal');
    var closeBtn = document.getElementById('pricingClose');
    if (!overlay) return;

    function openPricing() {
        refreshEliteStatus();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closePricing() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
    window.openPricingModal = openPricing;   // let other features trigger the upsell

    if (openBtn)  openBtn.addEventListener('click', openPricing);
    if (closeBtn) closeBtn.addEventListener('click', closePricing);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closePricing();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePricing();
    });

    // Get Elite → Stripe Checkout; if already Elite → Customer Portal.
    var eliteBtn = document.getElementById('getEliteBtn');
    if (eliteBtn) eliteBtn.addEventListener('click', function() {
        if (isElite()) { openElitePortal(); }
        else { startEliteCheckout(); }
    });
}());

/* ══════════════ Titles (Shonen power tiers) ══════════════ */
(function() {
    // ── lightweight counters used by some titles ──
    var CMP_KEY     = 'us_titles_cmp_'      + user.id;
    var VISITED_KEY = 'us_titles_visited_'  + user.id;
    var AI_KEY      = 'us_ai_prompts_'      + user.id;

    window.bumpCmpCount = function() {
        var n = parseInt(localStorage.getItem(CMP_KEY) || '0', 10) || 0;
        localStorage.setItem(CMP_KEY, String(n + 1));
        updateTitleDisplay();
    };
    window.addVisitedCountry = function(code) {
        var set;
        try { set = JSON.parse(localStorage.getItem(VISITED_KEY) || '[]'); } catch (e) { set = []; }
        if (set.indexOf(code) === -1) { set.push(code); localStorage.setItem(VISITED_KEY, JSON.stringify(set)); }
        updateTitleDisplay();
    };

    function titleStats() {
        var visited = [];
        try { visited = JSON.parse(localStorage.getItem(VISITED_KEY) || '[]'); } catch (e) {}
        return {
            saved:       (typeof getSaved === 'function' ? getSaved() : []).length,
            comparisons: parseInt(localStorage.getItem(CMP_KEY) || '0', 10) || 0,
            aiQ:         parseInt(localStorage.getItem(AI_KEY) || '0', 10) || 0,
            dlDone:      (typeof getDlDone === 'function' ? getDlDone() : []).length,
            visited:     visited.length,
            friends:     (typeof getFriends === 'function' ? getFriends() : []).length,
            apps:        (typeof getFormApps === 'function' ? getFormApps() : []).length,
            elite:       (typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite)
        };
    }

    // tiers 1→10, escalating shonen intensity. `goal` returns "current/target".
    var TITLES = [
        { id:'novice',     tier:1,  name:'Novice',           icon:'fa-seedling',            how:'Available to every member — the perfect starting title',
          check:function(s){ return true; },                goal:function(){ return 'Available'; } },
        { id:'seeker',     tier:2,  name:'Risen Seeker',     icon:'fa-compass',             how:'Save 10 universities',
          check:function(s){ return s.saved >= 10; },       goal:function(s){ return Math.min(s.saved,10)+'/10'; } },
        { id:'instinct',   tier:3,  name:'Sharpened Instinct',icon:'fa-eye',                how:'Run 3 head-to-head comparisons',
          check:function(s){ return s.comparisons >= 3; },  goal:function(s){ return Math.min(s.comparisons,3)+'/3'; } },
        { id:'oracle',     tier:4,  name:"Oracle's Vessel",  icon:'fa-wand-magic-sparkles', how:'Ask 5 questions in Ask AI',
          check:function(s){ return s.aiQ >= 5; },          goal:function(s){ return Math.min(s.aiQ,5)+'/5'; } },
        { id:'timesever',  tier:5,  name:'Time Severer',     icon:'fa-hourglass-half',      how:'Complete 3 application deadlines',
          check:function(s){ return s.dlDone >= 3; },       goal:function(s){ return Math.min(s.dlDone,3)+'/3'; } },
        { id:'worldender', tier:6,  name:'World Ender',      icon:'fa-earth-americas',      how:'Explore 6 different countries',
          check:function(s){ return s.visited >= 6; },      goal:function(s){ return Math.min(s.visited,6)+'/6'; } },
        { id:'soulbond',   tier:7,  name:'Soul-Bonded',      icon:'fa-user-group',          how:'Add 3 friends',
          check:function(s){ return s.friends >= 3; },      goal:function(s){ return Math.min(s.friends,3)+'/3'; } },
        { id:'strategist', tier:8,  name:'Grand Strategist', icon:'fa-chess-knight',        how:'Submit an application via the AI Assistant',
          check:function(s){ return s.apps >= 1; },         goal:function(s){ return Math.min(s.apps,1)+'/1'; } },
        { id:'elite',      tier:9,  name:'Elite',            icon:'fa-crown',               how:'Unlocked with an Elite subscription',
          check:function(s){ return s.elite; },             goal:function(s){ return (s.elite?1:0)+'/1'; } },
        { id:'transcend',  tier:10, name:'Transcendent',     icon:'fa-dragon',              how:'Earn every other title',
          check:function(){ return false; },                goal:function(){ return ''; } } // computed below
    ];

    var TCOLORS = {
        novice:'#27ae60', seeker:'#2ecc71', instinct:'#3498db', oracle:'#9b59b6',
        timesever:'#1abc9c', worldender:'#e67e22', soulbond:'#e84393', strategist:'#e74c3c',
        elite:'#f1c40f', transcend:'#d63af0'
    };
    function titleColor(id) { return TCOLORS[id] || '#d97c14'; }
    function hexA(hex, a) {
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function evaluate() {
        var s = titleStats();
        var res = TITLES.map(function(t) { return { t:t, earned: t.check(s) }; });
        // capstone ("transcend") = every other title earned
        var capIdx = res.findIndex(function(r){ return r.t.id === 'transcend'; });
        if (capIdx !== -1) {
            res[capIdx].earned = res.every(function(r, i){ return i === capIdx || r.earned; });
        }
        return { stats:s, res:res, earnedCount: res.filter(function(r){ return r.earned; }).length };
    }

    function getEquipped() { try { return getProfile().title || null; } catch (e) { return null; } }
    function setEquipped(id) { try { var p = getProfile(); p.title = id; setProfile(p); } catch (e) {} }

    // No title until the user explicitly equips one (empty slot, like the budget prompt).
    function activeTitle() {
        var eqId = getEquipped();
        if (!eqId) return null;
        var found = evaluate().res.find(function(r){ return r.t.id === eqId && r.earned; });
        return found ? found.t : null;
    }

    window.updateTitleDisplay = function() {
        var t = activeTitle();
        var col = t ? titleColor(t.id) : null;
        var chip = document.getElementById('mpTitleChip');
        var drop = document.getElementById('mpdTitle');
        var hero = document.getElementById('mpHeroTitle');

        // Cool pill look: subtle gradient + matching border + soft colour glow + crisp text.
        function pill(el, withSpan) {
            el.style.color = col;
            el.style.background = 'linear-gradient(135deg, ' + hexA(col, .24) + ', ' + hexA(col, .07) + ')';
            el.style.borderColor = hexA(col, .42);
            el.style.boxShadow = '0 2px 10px ' + hexA(col, .28) + ', inset 0 1px 0 rgba(255,255,255,.25)';
            el.style.textShadow = '0 1px 1px rgba(0,0,0,.12)';
            el.innerHTML = '<i class="fa-solid ' + t.icon + '"></i> ' + (withSpan ? '<span>' + t.name + '</span>' : t.name);
        }
        if (chip) {
            if (t) { chip.style.display = 'inline-flex'; pill(chip, false); }
            else { chip.style.display = 'none'; }
        }
        if (drop) {
            if (t) { pill(drop, true); }
            else {
                drop.style.color = ''; drop.style.background = ''; drop.style.borderColor = '';
                drop.innerHTML = '<i class="fa-solid fa-lock"></i> <span>No title yet</span>';
            }
        }
        if (hero) {
            if (t) { hero.style.display = 'inline-flex'; pill(hero, false); }
            else { hero.style.display = 'none'; }
        }
    };

    // ── Modal ──
    var overlay = document.getElementById('titlesOverlay');
    function openTitles() { renderTitles(); if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; } }
    function closeTitles() { if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; } }

    function renderTitles() {
        var ev = evaluate();
        var grid = document.getElementById('ttlGrid');
        var countEl = document.getElementById('ttlEarnedCount');
        if (countEl) countEl.textContent = ev.earnedCount;
        if (!grid) return;
        var eqId = getEquipped();
        var activeId = activeTitle() ? activeTitle().id : null;
        grid.innerHTML = ev.res.map(function(r) {
            var t = r.t;
            var earned = r.earned;
            var isOn = (t.id === (eqId || activeId)) && earned;
            var action = earned
                ? '<button class="ttl__equip__btn' + (isOn ? ' ttl__equip__btn--on' : '') + '" data-title="' + t.id + '"' + (isOn ? ' disabled' : '') + '>' + (isOn ? '<i class="fa-solid fa-check"></i> Equipped' : 'Equip') + '</button>'
                : '<i class="fa-solid fa-lock ttl__card__lockicon"></i>';
            var how = earned
                ? '<div class="ttl__card__how ttl__card__how--done"><i class="fa-solid fa-circle-check"></i> Awakened</div>'
                : '<div class="ttl__card__how"><i class="fa-solid fa-arrow-right"></i> ' + t.how + (t.goal({}) !== '' ? ' &middot; ' + t.goal(ev.stats) : '') + '</div>';
            var iconStyle = earned ? ' style="background:' + titleColor(t.id) + '"' : '';
            return '<div class="ttl__card ttl__card--' + (earned ? 'earned' : 'locked') + '">' +
                '<div class="ttl__card__icon"' + iconStyle + '><i class="fa-solid ' + t.icon + '"></i></div>' +
                '<div class="ttl__card__body">' +
                    '<div class="ttl__card__name">' + t.name + ' <span class="ttl__card__tier">Tier ' + t.tier + '</span></div>' +
                    '<div class="ttl__card__desc">' + t.how + '</div>' +
                    how +
                '</div>' +
                '<div class="ttl__card__action">' + action + '</div>' +
            '</div>';
        }).join('');
        grid.querySelectorAll('.ttl__equip__btn[data-title]').forEach(function(btn) {
            if (btn.disabled) return;
            btn.addEventListener('click', function() {
                setEquipped(btn.dataset.title);
                renderTitles();
                updateTitleDisplay();
            });
        });
    }

    var mpdTitle = document.getElementById('mpdTitle');
    if (mpdTitle) mpdTitle.addEventListener('click', openTitles);
    var chip = document.getElementById('mpTitleChip');
    if (chip) chip.addEventListener('click', openTitles);
    var heroTitleBtn = document.getElementById('mpHeroTitle');
    if (heroTitleBtn) heroTitleBtn.addEventListener('click', openTitles);
    var closeBtn = document.getElementById('titlesClose');
    if (closeBtn) closeBtn.addEventListener('click', closeTitles);
    if (overlay) overlay.addEventListener('click', function(e) { if (e.target === overlay) closeTitles(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) closeTitles(); });

    // First login: equip Novice automatically (only if the user has never set a title).
    try { var _p = getProfile(); if (_p.title === undefined) { _p.title = 'novice'; setProfile(_p); } } catch (e) {}

    updateTitleDisplay();
}());

/* ══════════════ Customisable top-container photos ══════════════ */
(function() {
    var HERO_DEFS = [
        { key:'explore',   sel:'.exp__hero__img',   type:'img', def:'Toji.jpg'   },
        { key:'apply',     sel:'.apf__hero__img',   type:'img', def:'Gogo.avif'  },
        { key:'chances',   sel:'.ins__hero__photo', type:'img', def:'Suguro.jpg' },
        { key:'deadlines', sel:'.dl__hero__img',     type:'img', def:'DemonSlayer.jpeg' },
        { key:'matcher',   sel:'.fy__hero__img',     type:'img', def:'Paris.avif' }
    ];
    var DL_OVERLAY = 'linear-gradient(120deg, rgba(0,0,0,.66) 0%, rgba(0,0,0,.4) 55%, rgba(0,0,0,.25) 100%)';
    function keyOf(k) { return 'us_hero_' + k + '_' + user.id; }
    function defOf(k) { for (var i=0;i<HERO_DEFS.length;i++){ if(HERO_DEFS[i].key===k) return HERO_DEFS[i]; } return null; }

    function applyHeroPic(def) {
        var el = document.querySelector(def.sel);
        if (!el) return;
        var data = localStorage.getItem(keyOf(def.key));
        if (def.type === 'img') {
            if (data) el.src = data;
        } else { // background container
            if (data) {
                el.style.backgroundImage = DL_OVERLAY + ", url('" + data + "')";
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.backgroundRepeat = 'no-repeat';
            }
        }
    }
    function resetHeroPic(def) {
        localStorage.removeItem(keyOf(def.key));
        var el = document.querySelector(def.sel);
        if (!el) return;
        if (def.type === 'img') { if (def.def) el.src = def.def; }
        else { el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = ''; el.style.backgroundRepeat = ''; }
    }
    function applyAll() { HERO_DEFS.forEach(applyHeroPic); }

    // Downscale large uploads so they fit comfortably in localStorage.
    function readImage(file, cb) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var max = 1400, w = img.width, h = img.height;
                if (w > max) { h = Math.round(h * max / w); w = max; }
                var c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                try { cb(c.toDataURL('image/jpeg', 0.85)); } catch (err) { cb(e.target.result); }
            };
            img.onerror = function() { cb(e.target.result); };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    var fileInput = document.getElementById('heroPicInput');
    var pendingKey = null;

    document.querySelectorAll('.hero__editpic').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            pendingKey = btn.dataset.hero;
            if (fileInput) { fileInput.value = ''; fileInput.click(); }
        });
        // Right-click to reset to the default photo
        btn.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            var def = defOf(btn.dataset.hero);
            if (def && confirm('Reset this photo to the default?')) resetHeroPic(def);
        });
    });

    if (fileInput) fileInput.addEventListener('change', function() {
        var file = fileInput.files && fileInput.files[0];
        if (!file || !pendingKey) return;
        var def = defOf(pendingKey);
        readImage(file, function(dataUrl) {
            try { localStorage.setItem(keyOf(def.key), dataUrl); }
            catch (err) { alert('That image is too large to save. Please try a smaller one.'); return; }
            applyHeroPic(def);
        });
    });

    // Exposed so the Settings panel can drive the same logic
    window.changeHeroPic = function(key) { pendingKey = key; if (fileInput) { fileInput.value = ''; fileInput.click(); } };
    window.resetHeroPic  = function(key) { var d = defOf(key); if (d) resetHeroPic(d); };

    applyAll();
}());

/* ── Settings: change top-container photos + safety net for stuck overlays ── */
(function() {
    // Wire the "Change / Reset" photo buttons in the profile dropdown
    document.querySelectorAll('.mpd__pic__btn[data-pic]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof window.changeHeroPic === 'function') window.changeHeroPic(btn.dataset.pic);
        });
    });
    document.querySelectorAll('.mpd__pic__reset[data-picreset]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof window.resetHeroPic === 'function') window.resetHeroPic(btn.dataset.picreset);
        });
    });

    // Safety net: never let a modal leave the page greyed-out / frozen.
    function dismissOverlays() {
        document.querySelectorAll(
            '.pricing__overlay.open, .pay__overlay.open, .ttl__overlay.open, .cmp__modal__overlay.open'
        ).forEach(function(o) { o.classList.remove('open'); });
        document.body.style.overflow = '';
    }
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') dismissOverlays(); });
}());

/* ── Quick account switching (Settings) ── */
(function() {
    var ACCT_PAGE_SIZE = 4;
    var acctPage = 0;
    var ADMIN_ACCOUNTS = ['vanyochek'];   // accounts shown with Admin status

    function acctColor(name) {
        if (typeof frdAvaColor === 'function') return frdAvaColor(name || 'U');
        return '#d97c14';
    }
    function allUsers() { try { return JSON.parse(localStorage.getItem('uniscout_users') || '[]'); } catch (e) { return []; } }

    function isAdminAcct(a) {
        return (a.username && ADMIN_ACCOUNTS.indexOf(a.username.toLowerCase()) !== -1) ||
               (a.email && ADMIN_ACCOUNTS.indexOf(a.email.toLowerCase()) !== -1);
    }
    function eliteOfAcct(a) {
        if (a.id === user.id) return (typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite);
        try { return !!(JSON.parse(localStorage.getItem('us_profile_' + a.id) || '{}').elite); } catch (e) { return false; }
    }
    // Admin overrides everything (for me, only Admin — no elite styling)
    function statusOf(a) {
        if (isAdminAcct(a)) return { label: 'Admin', cls: 'admin', glow: false };
        if (eliteOfAcct(a)) return { label: 'Elite user', cls: 'elite', glow: true };
        return { label: 'User', cls: 'user', glow: false };
    }

    function switchAccount(id) {
        var a = allUsers().find(function(x) { return x.id === id; });
        if (!a) return;
        localStorage.setItem('uniscout_session', JSON.stringify({ id: a.id, username: a.username, email: a.email }));
        sessionStorage.removeItem('uniscout_session');
        window.location.href = 'mainPage.html';
    }

    function renderAccounts() {
        var box = document.getElementById('mpdAccounts');
        if (!box) return;
        var all = allUsers();
        if (!all.length) { box.innerHTML = '<div style="font-size:11px;color:var(--text3)">No other accounts on this device.</div>'; return; }

        var totalPages = Math.ceil(all.length / ACCT_PAGE_SIZE);
        if (acctPage > totalPages - 1) acctPage = totalPages - 1;
        if (acctPage < 0) acctPage = 0;
        var pageItems = all.slice(acctPage * ACCT_PAGE_SIZE, acctPage * ACCT_PAGE_SIZE + ACCT_PAGE_SIZE);

        var html = pageItems.map(function(a) {
            var current = a.id === user.id;
            var prof = {}; try { prof = JSON.parse(localStorage.getItem('us_profile_' + a.id) || '{}'); } catch (e) {}
            var av = prof.avatar ? '<img src="' + prof.avatar + '" alt="">' : (a.username || 'U').charAt(0).toUpperCase();
            var st = statusOf(a);
            return '<button class="mpd__acct' + (current ? ' mpd__acct--current' : '') + '" data-acct="' + a.id + '"' + (current ? ' disabled' : '') + '>' +
                '<span class="mpd__acct__av" style="background:' + acctColor(a.username || a.id) + '">' + av + '</span>' +
                '<span class="mpd__acct__info">' +
                    '<span class="mpd__acct__name' + (st.glow ? ' mpd__acct__name--glow' : '') + '">' + (a.username || 'User') + '</span>' +
                '</span>' +
                '<span class="mpd__acct__status mpd__acct__status--' + st.cls + '">' + st.label + '</span>' +
            '</button>';
        }).join('');

        if (totalPages > 1) {
            html += '<div class="mpd__acct__pager">' +
                '<button class="mpd__acct__pg" id="acctPrev"' + (acctPage === 0 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>' +
                '<span>' + (acctPage + 1) + ' / ' + totalPages + '</span>' +
                '<button class="mpd__acct__pg" id="acctNext"' + (acctPage >= totalPages - 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>' +
            '</div>';
        }
        box.innerHTML = html;

        box.querySelectorAll('.mpd__acct[data-acct]').forEach(function(btn) {
            if (btn.disabled) return;
            btn.addEventListener('click', function() { switchAccount(btn.dataset.acct); });
        });
        var prev = document.getElementById('acctPrev');
        var next = document.getElementById('acctNext');
        if (prev) prev.addEventListener('click', function(e) { e.stopPropagation(); acctPage--; renderAccounts(); });
        if (next) next.addEventListener('click', function(e) { e.stopPropagation(); acctPage++; renderAccounts(); });
    }

    renderAccounts();
    // Refresh the list whenever the profile dropdown is opened
    var avatarBtn = document.getElementById('mpAvatarBtn');
    if (avatarBtn) avatarBtn.addEventListener('click', renderAccounts);
}());

/* ── Apply page is Elite-only ── */
(function() {
    function eliteNow() { return typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite; }

    function upsellToast(msg) {
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:6000;' +
            'display:flex;align-items:center;gap:9px;padding:13px 20px;border-radius:13px;font-family:Montserrat,sans-serif;' +
            'font-size:13px;font-weight:700;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
            'background:linear-gradient(135deg,var(--orange),var(--orange2));animation:arIn .3s ease both';
        bar.innerHTML = '<i class="fa-solid fa-crown"></i> ' + msg;
        document.body.appendChild(bar);
        setTimeout(function(){ bar.style.transition='opacity .4s'; bar.style.opacity='0'; setTimeout(function(){ bar.remove(); }, 400); }, 3500);
    }

    // Intercept the Apply buttons — Elite goes through, others get the upgrade offer.
    document.querySelectorAll('.apf__hero__btn, .apf__banner__btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            if (eliteNow()) return;        // Elite → allow navigation to applicationForm.html
            e.preventDefault();
            upsellToast('Applying is an Elite feature — upgrade to unlock it.');
            if (typeof window.openPricingModal === 'function') window.openPricingModal();
        });
    });

    // If redirected back from applicationForm.html (non-Elite), show the upsell.
    if (/[?&]upgrade=apply\b/.test(location.search)) {
        history.replaceState({}, '', location.pathname);
        setTimeout(function() {
            upsellToast('Applying is an Elite feature — upgrade to unlock it.');
            if (typeof window.openPricingModal === 'function') window.openPricingModal();
        }, 400);
    }
}());

/* ══════════════ Elite "For You" matcher ══════════════ */
(function() {
    var SUBJECTS = ['Business','Computer Science','Engineering','Medicine','Law','Humanities','Science',
        'Arts','Economics','Psychology','Architecture','Mathematics','Social Sciences','Education','Design'];
    var HOBBIES = ['Music','Art','Technology','Gaming','Volunteering','Travel','Reading','Entrepreneurship','Nature','Nightlife','Fitness','Esports'];
    var PRIORITIES = ['Research','Employability','Social life','Affordability','Prestige'];
    var SPORTS = ['Football','Basketball','Tennis','Athletics','Swimming','Rugby','Rowing','Volleyball','Cycling',
        'Skiing','Golf','Martial arts','Gymnastics','Hockey','Cricket','Other'];

    var fab = document.getElementById('fyFab');
    var overlay = document.getElementById('fyOverlay');
    var modal = document.getElementById('fyModal');
    var hdrBtn = document.getElementById('fyHdrBtn');
    if (!fab || !overlay) return;

    var sel = { subjects: [], hobbies: [], priorities: [] };

    function buildChips(containerId, list, bucket) {
        var box = document.getElementById(containerId);
        if (!box) return;
        box.innerHTML = list.map(function(x) { return '<span class="fy__chip" data-v="' + x + '">' + x + '</span>'; }).join('');
        box.querySelectorAll('.fy__chip').forEach(function(chip) {
            chip.addEventListener('click', function() {
                var v = chip.dataset.v, i = sel[bucket].indexOf(v);
                if (i === -1) { sel[bucket].push(v); chip.classList.add('is-on'); }
                else { sel[bucket].splice(i, 1); chip.classList.remove('is-on'); }
            });
        });
    }
    function fillSports() {
        var s = document.getElementById('fySport');
        if (s) s.innerHTML = '<option value="">None</option>' + SPORTS.map(function(x){ return '<option>' + x + '</option>'; }).join('');
    }

    var budgetSlider = document.getElementById('fyBudget');
    var budgetVal = document.getElementById('fyBudgetVal');
    function syncBudget() {
        var v = +budgetSlider.value;
        budgetVal.textContent = '€' + v.toLocaleString() + '/yr';
        var pct = (v - budgetSlider.min) / (budgetSlider.max - budgetSlider.min) * 100;
        budgetSlider.style.setProperty('--pct', pct + '%');
    }

    // Destination countries the matcher will pull universities from (saved favourites).
    function destCountries() {
        var favs = (typeof getFavCountries === 'function') ? getFavCountries() : [];
        var backed = (typeof DATA_COUNTRIES !== 'undefined') ? DATA_COUNTRIES.map(function(c){ return c.code; }) : [];
        var list = favs.filter(function(c){ return backed.indexOf(c) !== -1; });
        if (!list.length && typeof currentCountryCode !== 'undefined') list = [currentCountryCode];
        return list;
    }
    function countryName(code) {
        if (typeof countryNameByCode === 'function') return countryNameByCode(code);
        var c = (typeof DATA_COUNTRIES !== 'undefined') ? DATA_COUNTRIES.find(function(x){ return x.code === code; }) : null;
        return c ? c.name : code.toUpperCase();
    }
    function renderDest() {
        var box = document.getElementById('fyDest');
        if (!box) return;
        var list = destCountries();
        box.innerHTML = '<i class="fa-solid fa-earth-europe" style="color:var(--orange)"></i> Matching across your destinations: ' +
            list.map(function(c){ return '<span class="fi fi-' + c + '"></span>'; }).join('');
    }

    function loadPrefs() {
        var p = {}; try { p = getProfile().matchPrefs || {}; } catch (e) {}
        sel.subjects = p.subjects || []; sel.hobbies = p.hobbies || []; sel.priorities = p.priorities || [];
        ['fySubjects:subjects','fyHobbies:hobbies','fyPriorities:priorities'].forEach(function(pair) {
            var parts = pair.split(':'), box = document.getElementById(parts[0]);
            if (box) box.querySelectorAll('.fy__chip').forEach(function(c) { if (sel[parts[1]].indexOf(c.dataset.v) !== -1) c.classList.add('is-on'); });
        });
        if (p.avg != null) document.getElementById('fyAvg').value = p.avg;
        if (p.exp != null) document.getElementById('fyExp').value = p.exp;
        if (p.lang) document.getElementById('fyLang').value = p.lang;
        if (p.level) document.getElementById('fyLevel').value = p.level;
        if (p.vibe) document.getElementById('fyVibe').value = p.vibe;
        if (p.sport) document.getElementById('fySport').value = p.sport;
        if (p.athlete != null) document.getElementById('fyAthlete').value = p.athlete;
        if (p.budget) budgetSlider.value = p.budget;
        syncBudget();
    }
    function savePrefs(prefs) { try { var pr = getProfile(); pr.matchPrefs = prefs; setProfile(pr); } catch (e) {} }

    function readPrefs() {
        return {
            subjects: sel.subjects.slice(), hobbies: sel.hobbies.slice(), priorities: sel.priorities.slice(),
            avg: +document.getElementById('fyAvg').value || null,
            exp: +document.getElementById('fyExp').value || null,
            lang: document.getElementById('fyLang').value,
            level: document.getElementById('fyLevel').value,
            vibe: document.getElementById('fyVibe').value,
            sport: document.getElementById('fySport').value,
            athlete: +document.getElementById('fyAthlete').value || 0,
            budget: +budgetSlider.value
        };
    }

    function parseStudents(u) { var m = String(u.students || '').replace(/[, ]/g, '').match(/(\d+)/); return m ? +m[1] : 0; }
    function reqGrade(diff) { return ({ 5: 90, 4: 80, 3: 70, 2: 60, 1: 50 })[diff] || 65; }
    function uniCost(u) { return (typeof tuitionMinCost === 'function' ? tuitionMinCost(u) : (TS_COST[u.ts] || 0)); }
    function tuitionText(u) { return (typeof u.tuition === 'string' && u.tuition.length > 1) ? u.tuition : ('~€' + (TS_COST[u.ts] || 0).toLocaleString() + '/yr'); }

    // How strongly a university supports/rewards athletes (sports scholarships & facilities).
    // Heuristic: USA (NCAA) highest, UK strong, then big/elite universities.
    function athleteSupport(u, code) {
        var s = 0.35;
        if (code === 'us') s = 1.0;
        else if (code === 'gb' || code === 'ie') s = 0.8;
        var students = parseStudents(u);
        if (students >= 30000) s += 0.3; else if (students >= 18000) s += 0.18;
        if ((u.diff || 0) >= 4) s += 0.12;          // resourced, prestigious programmes
        return Math.min(1, s);
    }

    var ATH_LABEL = ['', 'Recreational', 'Club', 'Regional', 'National', 'Pro / Elite'];

    function scoreUni(u, p, code) {
        var reasons = [], factors = [];
        function add(icon, you, effect, pts) { factors.push({ icon: icon, you: you, effect: effect, pts: Math.round(pts) }); }

        // Subjects (33)
        var subj = 0.6, matched = [];
        if (p.subjects.length) {
            var fields = (u.fields || []).map(function(f){ return f.toLowerCase(); });
            matched = p.subjects.filter(function(s) { return fields.some(function(f){ return f.indexOf(s.toLowerCase()) !== -1 || s.toLowerCase().indexOf(f) !== -1; }); });
            subj = matched.length / p.subjects.length;
            matched.slice(0, 2).forEach(function(h) { reasons.push('Matches ' + h); });
        }
        add('fa-book',
            p.subjects.length ? ('You like ' + p.subjects.slice(0, 3).join(', ')) : 'No subject preference',
            p.subjects.length ? (matched.length ? ('Offered here — ' + matched.length + '/' + p.subjects.length + ' of your subjects') : 'Little overlap with its programmes') : 'Counted neutrally',
            33 * subj);

        // Grades + athlete reduction (18)
        var req = reqGrade(u.diff || 3);
        var sup = athleteSupport(u, code);
        var athleteDrop = (p.athlete >= 2 && p.sport && sup >= 0.6) ? Math.min(15, p.athlete * 3) : 0;
        var effReq = Math.max(40, req - athleteDrop);
        var myGrade = p.exp || p.avg || 70;
        var grade = myGrade >= effReq ? 1 : Math.max(0, 1 - (effReq - myGrade) / 30);
        if (myGrade >= effReq) reasons.push('Right for your grades');
        add('fa-star-half-stroke',
            'Your expected grade ' + myGrade + '%' + (athleteDrop > 0 ? (' as a ' + (ATH_LABEL[p.athlete] || '') + ' ' + p.sport + ' athlete') : ''),
            athleteDrop > 0
                ? ('Entry bar ~' + req + '% → lowered to ~' + effReq + '% for athletes → you ' + (myGrade >= effReq ? 'qualify' : 'are close'))
                : ('Entry bar ~' + req + '% → you ' + (myGrade >= req ? 'qualify' : 'are below it')),
            18 * grade);

        // Budget (18)
        var cost = uniCost(u), bud = 1;
        if (cost > 0) { bud = cost <= p.budget ? 1 : Math.max(0, 1 - (cost - p.budget) / p.budget); }
        if (cost > 0 && cost <= p.budget) reasons.push('Within budget');
        add('fa-piggy-bank',
            'Your budget €' + (p.budget || 0).toLocaleString() + '/yr',
            cost > 0 ? ('Tuition ' + tuitionText(u) + ' → ' + (cost <= p.budget ? 'within budget' : 'above budget')) : 'Tuition not listed',
            18 * bud);

        // Language (9)
        var lang = 0.7, hasLang = false;
        if (p.lang) {
            hasLang = (u.langs || []).some(function(l){ return l.toLowerCase() === p.lang.toLowerCase(); });
            lang = hasLang ? 1 : 0.2;
            if (hasLang) reasons.push(p.lang + '-taught');
            add('fa-language', 'You prefer ' + p.lang,
                hasLang ? ('Programmes taught in ' + p.lang) : ('Mainly ' + ((u.langs || ['local'])[0]) + '-taught'), 9 * lang);
        }

        // Athlete scholarships (separate boost, up to ~9)
        var athBoost = 0;
        if (p.athlete >= 2 && p.sport) {
            athBoost = (p.athlete / 5) * sup * 9;
            if (sup >= 0.75 && p.athlete >= 3) reasons.push(p.sport + ' scholarships');
            else if (sup >= 0.6) reasons.push('Athlete-friendly');
            add('fa-medal', 'You are a ' + (ATH_LABEL[p.athlete] || '') + ' ' + p.sport + ' athlete',
                sup >= 0.75 ? 'Strong athletic scholarships & facilities here' : sup >= 0.6 ? 'Supports student athletes' : 'Limited athletic support', athBoost);
        }

        // Priorities / vibe (5)
        var students = parseStudents(u), extras = 0.5, exNote = [];
        if (p.priorities.indexOf('Research') !== -1 && (u.diff || 0) >= 4) { extras += 0.3; reasons.push('Research-focused'); exNote.push('research-intensive'); }
        if (p.priorities.indexOf('Prestige') !== -1 && (u.diff || 0) >= 4) { extras += 0.2; exNote.push('prestigious'); }
        if (p.priorities.indexOf('Affordability') !== -1 && cost > 0 && cost <= p.budget) { extras += 0.2; exNote.push('affordable'); }
        if ((p.priorities.indexOf('Social life') !== -1 || p.hobbies.indexOf('Nightlife') !== -1) && students >= 20000) { extras += 0.2; exNote.push('big social scene'); }
        if (p.vibe === 'big' && students >= 20000) { extras += 0.2; exNote.push('big-city campus'); }
        if (p.vibe === 'small' && students > 0 && students < 12000) { extras += 0.2; exNote.push('smaller campus'); }
        extras = Math.min(1, extras);
        if (p.priorities.length || (p.vibe && p.vibe !== 'any') || p.hobbies.length) {
            add('fa-bullseye', 'What you value' + (p.priorities.length ? (': ' + p.priorities.slice(0, 2).join(', ')) : ''),
                exNote.length ? ('Matches: ' + exNote.slice(0, 2).join(', ')) : 'Partly aligned', 5 * extras);
        }

        // Country (10, always — it's a saved destination)
        add('fa-earth-europe', 'A saved destination', 'Located in ' + countryName(code), 10);

        var pct = 33 * subj + 18 * grade + 18 * bud + 9 * lang + 10 + 5 * extras + athBoost;
        pct = Math.max(35, Math.min(99, Math.round(pct)));
        return { pct: pct, reasons: reasons.slice(0, 4), factors: factors, code: code };
    }

    function ringColor(p) { return p >= 80 ? '#27ae60' : p >= 60 ? 'var(--orange)' : '#8a909c'; }

    // little toast
    function fyToast(msg) {
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:6500;display:flex;align-items:center;gap:9px;' +
            'padding:12px 18px;border-radius:12px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;color:#fff;' +
            'box-shadow:0 10px 28px rgba(0,0,0,.25);background:linear-gradient(135deg,#3a3f4a,#23262e);animation:arIn .3s ease both';
        bar.textContent = msg;
        document.body.appendChild(bar);
        setTimeout(function(){ bar.style.transition='opacity .4s'; bar.style.opacity='0'; setTimeout(function(){ bar.remove(); }, 400); }, 2600);
    }
    function saveUni(u) {
        if (typeof getSaved !== 'function' || typeof setSaved !== 'function') return;
        var s = getSaved();
        if (s.indexOf(u.id) === -1) { s.push(u.id); setSaved(s); }
        if (typeof renderSaved === 'function') renderSaved();
        if (typeof updateStats === 'function') updateStats();
        fyToast('★ Saved ' + (u.name || 'university'));
    }
    function sendToCompare(u) {
        var slot = (typeof cmpVsSelected !== 'undefined' && cmpVsSelected.A) ? (cmpVsSelected.B ? 'A' : 'B') : 'A';
        var ob = document.getElementById('openCompareModal');
        if (ob) ob.click();
        if (typeof selectVsUni === 'function') selectVsUni(slot, u);
        closeFy();
        fyToast('⚖ Added ' + (u.name || 'university') + ' to Compare');
    }

    // ── Results (5 per page, paginated; hover → Save / Compare) ──
    var lastScored = [];
    var resPage = 0;
    var RES_PER = 5;

    function cardHtml(r, idx, isTop) {
        var u = r.u;
        var reasons = (r.reasons && r.reasons.length) ? r.reasons : ['General fit'];
        return '<div class="fy__card' + (isTop ? ' fy__card--top' : '') + '" data-i="' + idx + '" title="See why it fits you">' +
            '<div class="fy__card__actions">' +
                '<button class="fy__cbtn" data-act="save" data-i="' + idx + '" title="Save"><i class="fa-regular fa-bookmark"></i></button>' +
                '<button class="fy__cbtn" data-act="compare" data-i="' + idx + '" title="Add to Compare"><i class="fa-solid fa-scale-balanced"></i></button>' +
            '</div>' +
            '<div class="fy__ring" style="--p:' + r.pct + ';--ringc:' + ringColor(r.pct) + '"><span class="fy__ring__num">' + r.pct + '<span>%</span></span></div>' +
            '<div class="fy__card__body">' +
                '<div class="fy__card__name"><span class="fy__card__abbr" style="background:' + (u.color || '#555') + '">' + (u.abbr || (u.name||'U').slice(0,3)) + '</span>' + (u.name || 'University') + '</div>' +
                '<div class="fy__card__meta"><span class="fy__card__country"><span class="fi fi-' + r.code + '"></span>' + countryName(r.code) + '</span> · ' + (u.city || '') + ' · ' + tuitionText(u) + '</div>' +
                '<div class="fy__card__reasons">' + reasons.map(function(x){ return '<span class="fy__reason">' + x + '</span>'; }).join('') + '</div>' +
                '<div class="fy__card__why"><i class="fa-solid fa-circle-info"></i> See why it fits you</div>' +
            '</div>' +
        '</div>';
    }

    function render(scored) {
        if (scored) { lastScored = scored; resPage = 0; }
        var box = document.getElementById('fyResults');
        if (!lastScored.length) { box.innerHTML = '<div class="fy__empty">No universities to match in your saved destinations yet.</div>'; return; }
        var pages = Math.ceil(lastScored.length / RES_PER);
        if (resPage > pages - 1) resPage = pages - 1;
        if (resPage < 0) resPage = 0;
        var start = resPage * RES_PER;
        var pageItems = lastScored.slice(start, start + RES_PER);

        var html = '<div class="fy__results__hd"><i class="fa-solid fa-ranking-star" style="color:var(--orange)"></i> Your top matches <span class="fy__note">· across your destinations</span></div>';
        html += pageItems.map(function(r, j) { return cardHtml(r, start + j, start + j === 0); }).join('');
        if (pages > 1) {
            html += '<div class="fy__pager">' +
                '<button class="fy__pg" data-pg="prev"' + (resPage === 0 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>' +
                '<span>' + (resPage + 1) + ' / ' + pages + '</span>' +
                '<button class="fy__pg" data-pg="next"' + (resPage >= pages - 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>' +
            '</div>';
        }
        box.innerHTML = html;
        box.querySelectorAll('.fy__cbtn').forEach(function(b) {
            b.addEventListener('click', function(e) {
                e.stopPropagation();
                var r = lastScored[+b.dataset.i]; if (!r) return;
                if (b.dataset.act === 'save') saveUni(r.u); else sendToCompare(r.u);
            });
        });
        box.querySelectorAll('.fy__card[data-i]').forEach(function(card) {
            card.addEventListener('click', function() { var r = lastScored[+card.dataset.i]; if (r) openDetail(r); });
        });
        box.querySelectorAll('.fy__pg').forEach(function(b) {
            if (b.disabled) return;
            b.addEventListener('click', function() { resPage += (b.dataset.pg === 'next' ? 1 : -1); render(); });
        });
    }

    function showResultsPanel() { if (modal) modal.classList.add('fy__modal--wide'); }

    // Load + score all universities across saved destinations (shared by matcher & "Show all").
    function scoreAll(cb) {
        var p = readPrefs();
        var codes = destCountries();
        var loaders = codes.map(function(code) {
            if (typeof cmpLoadCountryUnis === 'function') {
                return cmpLoadCountryUnis(code).then(function(list) { return { code: code, list: list || [] }; }).catch(function(){ return { code: code, list: [] }; });
            }
            return Promise.resolve({ code: code, list: (typeof UNI !== 'undefined' ? UNI : []) });
        });
        Promise.all(loaders).then(function(groups) {
            var scored = [];
            groups.forEach(function(g) {
                g.list.forEach(function(u) { var s = scoreUni(u, p, g.code); scored.push({ u: u, pct: s.pct, reasons: s.reasons, factors: s.factors, code: g.code }); });
            });
            scored.sort(function(a, b) { return b.pct - a.pct; });
            cb(scored);
        });
    }

    function revealShowAll() { var sa = document.getElementById('fyShowAll'); if (sa) sa.style.display = 'inline-flex'; }

    // Top 10 universities of the CURRENT study-destination country, ranked by fit.
    function runMatch() {
        savePrefs(readPrefs());
        showResultsPanel();
        document.getElementById('fyResults').innerHTML = '<div class="fy__empty"><i class="fa-solid fa-spinner fa-spin"></i> Scoring universities…</div>';
        var p = readPrefs();
        var code = (typeof currentCountryCode !== 'undefined' && currentCountryCode) ? currentCountryCode : destCountries()[0];
        var done = function(list) {
            var scored = (list || []).map(function(u) { var s = scoreUni(u, p, code); return { u: u, pct: s.pct, reasons: s.reasons, factors: s.factors, code: code }; });
            scored.sort(function(a, b) { return b.pct - a.pct; });
            render(scored.slice(0, 10));
            revealShowAll();
        };
        if (typeof cmpLoadCountryUnis === 'function') cmpLoadCountryUnis(code).then(done).catch(function(){ done(typeof UNI !== 'undefined' ? UNI : []); });
        else done(typeof UNI !== 'undefined' ? UNI : []);
    }

    // Match ONLY the current study-destination country.
    function runMatchCountry() {
        savePrefs(readPrefs());
        showResultsPanel();
        document.getElementById('fyResults').innerHTML = '<div class="fy__empty"><i class="fa-solid fa-spinner fa-spin"></i> Scoring universities…</div>';
        var p = readPrefs();
        var code = (typeof currentCountryCode !== 'undefined' && currentCountryCode) ? currentCountryCode : destCountries()[0];
        var done = function(list) {
            var scored = (list || []).map(function(u) { var s = scoreUni(u, p, code); return { u: u, pct: s.pct, reasons: s.reasons, factors: s.factors, code: code }; });
            scored.sort(function(a, b) { return b.pct - a.pct; });
            render(scored.slice(0, 30));
            revealShowAll();
        };
        if (typeof cmpLoadCountryUnis === 'function') cmpLoadCountryUnis(code).then(done).catch(function(){ done(typeof UNI !== 'undefined' ? UNI : []); });
        else done(typeof UNI !== 'undefined' ? UNI : []);
    }
    function updateThisCountryLabel() {
        var lbl = document.getElementById('fyThisCountryLbl');
        if (lbl) lbl.textContent = (typeof currentCountryCode !== 'undefined' && typeof countryNameByCode === 'function') ? countryNameByCode(currentCountryCode) : 'This country';
    }

    // Clear every input back to its default (used when re-entering the Explore tab).
    function resetForm() {
        sel.subjects = []; sel.hobbies = []; sel.priorities = [];
        document.querySelectorAll('#fyForm .fy__chip.is-on').forEach(function(c) { c.classList.remove('is-on'); });
        ['fyAvg', 'fyExp'].forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ''; });
        ['fyLang', 'fyLevel', 'fyVibe', 'fySport'].forEach(function(id) { var e = document.getElementById(id); if (e) e.selectedIndex = 0; });
        var ath = document.getElementById('fyAthlete'); if (ath) ath.value = '0';
        if (budgetSlider) { budgetSlider.value = 15000; syncBudget(); }
        if (modal) modal.classList.remove('fy__modal--wide');          // collapse any results
        var sa = document.getElementById('fyShowAll'); if (sa) sa.style.display = 'none';
    }

    // Exposed so the rest of the app can refresh the country label/destinations and
    // reset the form (e.g. when the user switches the destination country or tabs).
    window.fyRefresh = function() { renderDest(); updateThisCountryLabel(); };
    window.fyReset = resetForm;

    // ── "Show all" window: top 10 + look up any university's fit ──
    var allOverlay = document.getElementById('fyAllOverlay');
    var allScored = [];
    function ringSm(r) {
        return '<div class="fy__ring fy__ring--sm" style="--p:' + r.pct + ';--ringc:' + ringColor(r.pct) + '"><span class="fy__ring__num">' + r.pct + '</span></div>';
    }
    function rowHtml(r) {
        var u = r.u;
        return '<div class="fy__row2" data-id="' + (u.id || '') + '">' + ringSm(r) +
            '<div class="fy__row2__info"><div class="fy__card__name" style="font-size:13px;"><span class="fy__card__abbr" style="background:' + (u.color || '#555') + '">' + (u.abbr || 'U') + '</span>' + (u.name || '') + '</div>' +
            '<div class="fy__card__meta"><span class="fi fi-' + r.code + '"></span> ' + (u.city || '') + ' · ' + countryName(r.code) + '</div></div>' +
            '<div class="fy__row2__actions">' +
                '<button class="fy__cbtn" data-act="save" data-id="' + (u.id || '') + '" title="Save"><i class="fa-regular fa-bookmark"></i></button>' +
                '<button class="fy__cbtn" data-act="compare" data-id="' + (u.id || '') + '" title="Add to Compare"><i class="fa-solid fa-scale-balanced"></i></button>' +
            '</div></div>';
    }
    function findScored(id) { return allScored.find(function(r) { return r.u.id === id; }); }
    function wireRows(container) {
        container.querySelectorAll('.fy__cbtn').forEach(function(b) {
            b.addEventListener('click', function(e) {
                e.stopPropagation();
                var r = findScored(b.dataset.id); if (!r) return;
                if (b.dataset.act === 'save') saveUni(r.u); else sendToCompare(r.u);
            });
        });
        container.querySelectorAll('.fy__row2').forEach(function(row) {
            row.addEventListener('click', function() { var r = findScored(row.dataset.id); if (r) openDetail(r); });
        });
    }
    function renderAllList() {
        var box = document.getElementById('fyAllList');
        box.innerHTML = '<div class="fy__results__hd">Top 10 matches</div>' + allScored.slice(0, 10).map(rowHtml).join('');
        wireRows(box);
    }

    // ── Fit-detail modal (click a university in "Show all") ──
    var detailOverlay = document.getElementById('fyDetailOverlay');
    function fact(icon, label, val, wide) {
        if (!val) return '';
        return '<div class="fy__detail__fact' + (wide ? ' fy__detail__fact--wide' : '') + '">' +
            '<i class="fa-solid ' + icon + '"></i>' +
            '<div class="fy__detail__fact__txt"><span>' + label + '</span>' + val + '</div></div>';
    }
    function openDetail(r) {
        if (!detailOverlay) return;
        var u = r.u;
        document.getElementById('fyDetailName').textContent = u.name || 'University';
        document.getElementById('fyDetailMeta').innerHTML = '<span class="fi fi-' + r.code + '"></span> ' + (u.city || '') + ' · ' + countryName(r.code);
        var web = u.website ? '<a href="' + u.website + '" target="_blank" rel="noopener">' + u.website.replace(/^https?:\/\//, '') + '</a>' : '';

        // Evidence: each factor = "you said X → effect → +Y%"
        var factors = (r.factors || []).filter(function(f){ return f.pts > 0; }).sort(function(a, b){ return b.pts - a.pts; });
        var evidence = factors.map(function(f) {
            return '<div class="fy__ev">' +
                '<div class="fy__ev__head">' +
                    '<div class="fy__ev__you"><i class="fa-solid ' + f.icon + '"></i><span>' + f.you + '</span></div>' +
                    '<div class="fy__ev__pts">+' + f.pts + '%</div>' +
                '</div>' +
                '<div class="fy__ev__effect"><i class="fa-solid fa-arrow-right-long"></i><span>' + f.effect + '</span></div>' +
            '</div>';
        }).join('');

        document.getElementById('fyDetailBody').innerHTML =
            '<div class="fy__detail__score">' +
                '<div class="fy__ring" style="--p:' + r.pct + ';--ringc:' + ringColor(r.pct) + '"><span class="fy__ring__num">' + r.pct + '<span>%</span></span></div>' +
                '<div class="fy__detail__score__txt"><b>' + r.pct + '% overall fit</b> — here\'s how it adds up for you</div>' +
            '</div>' +
            '<div class="fy__detail__sec__h">Why it fits you</div>' +
            '<div class="fy__ev__list">' + (evidence || '<div class="fy__empty">Set your preferences in the matcher for a detailed breakdown.</div>') + '</div>' +
            '<div class="fy__detail__sec__h">Key facts</div>' +
            '<div class="fy__detail__facts">' +
                fact('fa-building', 'Type', u.type) + fact('fa-piggy-bank', 'Annual tuition', tuitionText(u)) +
                fact('fa-calendar', 'Founded', u.founded) + fact('fa-users', 'Students', u.students) +
                fact('fa-fire', 'Entry difficulty', u.dl) + fact('fa-language', 'Languages', (u.langs || []).join(', ')) +
                fact('fa-book-open', 'Fields', (u.fields || []).slice(0, 4).join(', '), true) + fact('fa-link', 'Official site', web, true) +
            '</div>' +
            '<div class="fy__detail__actions">' +
                '<button class="fy__detail__btn fy__detail__btn--save" data-act="save"><i class="fa-regular fa-bookmark"></i> Save</button>' +
                '<button class="fy__detail__btn fy__detail__btn--compare" data-act="compare"><i class="fa-solid fa-scale-balanced"></i> Compare</button>' +
            '</div>';
        document.getElementById('fyDetailBody').querySelectorAll('[data-act]').forEach(function(b) {
            b.addEventListener('click', function() {
                if (b.dataset.act === 'save') saveUni(u); else sendToCompare(u);
                closeDetail();
            });
        });
        detailOverlay.classList.add('open'); document.body.style.overflow = 'hidden';
    }
    function closeDetail() { if (detailOverlay) { detailOverlay.classList.remove('open'); document.body.style.overflow = ''; } }
    if (document.getElementById('fyDetailClose')) document.getElementById('fyDetailClose').addEventListener('click', closeDetail);
    if (detailOverlay) detailOverlay.addEventListener('click', function(e){ if (e.target === detailOverlay) closeDetail(); });
    function openShowAll() {
        if (!allOverlay) return;
        allOverlay.classList.add('open'); document.body.style.overflow = 'hidden';
        document.getElementById('fyAllSearch').value = '';
        document.getElementById('fyAllSearchResult').innerHTML = '';
        document.getElementById('fyAllList').innerHTML = '<div class="fy__empty"><i class="fa-solid fa-spinner fa-spin"></i> Scoring universities…</div>';
        scoreAll(function(scored) { allScored = scored; renderAllList(); });
    }
    function closeShowAll() { if (allOverlay) { allOverlay.classList.remove('open'); document.body.style.overflow = ''; } }
    if (document.getElementById('fyAllClose')) document.getElementById('fyAllClose').addEventListener('click', closeShowAll);
    if (allOverlay) allOverlay.addEventListener('click', function(e){ if (e.target === allOverlay) closeShowAll(); });
    if (document.getElementById('fyAllSearch')) document.getElementById('fyAllSearch').addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        var box = document.getElementById('fyAllSearchResult');
        if (!q) { box.innerHTML = ''; return; }
        var hits = allScored.filter(function(r) {
            return (r.u.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (r.u.website || '').toLowerCase().indexOf(q) !== -1 ||
                   (r.u.abbr || '').toLowerCase().indexOf(q) !== -1;
        }).slice(0, 5);
        box.innerHTML = hits.length
            ? '<div class="fy__results__hd">Fit for "' + q + '"</div>' + hits.map(rowHtml).join('')
            : '<div class="fy__empty">No saved-destination university matches "' + q + '".</div>';
        if (hits.length) wireRows(box);
    });

    // ── Floating / header buttons (Elite + preference) ──
    function isHidden() { try { return !!getProfile().fyHidden; } catch (e) { return false; } }
    function setHidden(v) { try { var p = getProfile(); p.fyHidden = v; setProfile(p); } catch (e) {} window.updateFyButtons(); }
    window.updateFyButtons = function() {
        var elite = (typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite);
        var hidden = isHidden();
        var inline = !!window.__fyInline;   // matcher is embedded in Explore → no floating button
        fab.style.display = (elite && !hidden && !inline) ? 'flex' : 'none';
        if (hdrBtn) hdrBtn.style.display = (elite && hidden && !inline) ? 'inline-flex' : 'none';
        var dock = document.getElementById('fyDock');
        if (dock) dock.title = hidden ? 'Show floating button' : 'Move button to header';
    };

    function openFy() {
        renderDest();
        updateThisCountryLabel();
        var sa = document.getElementById('fyShowAll');   // only appears after "Find my matches"
        if (sa) sa.style.display = modal && modal.classList.contains('fy__modal--wide') ? 'inline-flex' : 'none';
        overlay.classList.add('open'); document.body.style.overflow = 'hidden';
    }
    function closeFy() { overlay.classList.remove('open'); document.body.style.overflow = ''; }

    // Init
    buildChips('fySubjects', SUBJECTS, 'subjects');
    buildChips('fyHobbies', HOBBIES, 'hobbies');
    buildChips('fyPriorities', PRIORITIES, 'priorities');
    fillSports();
    budgetSlider.addEventListener('input', syncBudget);
    loadPrefs();
    renderDest();

    document.getElementById('fyFabMain').addEventListener('click', openFy);
    document.getElementById('fyFabHide').addEventListener('click', function() { setHidden(true); });
    if (hdrBtn) hdrBtn.addEventListener('click', openFy);
    var showAllBtn = document.getElementById('fyShowAll');
    if (showAllBtn) showAllBtn.addEventListener('click', openShowAll);
    document.getElementById('fyDock').addEventListener('click', function() { setHidden(!isHidden()); });
    document.getElementById('fyClose').addEventListener('click', closeFy);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeFy(); });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        if (detailOverlay && detailOverlay.classList.contains('open')) { closeDetail(); return; }
        if (allOverlay && allOverlay.classList.contains('open')) { closeShowAll(); return; }
        if (overlay.classList.contains('open')) closeFy();
    });
    document.getElementById('fyGo').addEventListener('click', runMatch);
    var thisCountryBtn = document.getElementById('fyThisCountry');
    if (thisCountryBtn) thisCountryBtn.addEventListener('click', runMatchCountry);
    updateThisCountryLabel();

    window.updateFyButtons();
}());

/* ── Elite: show the AI matcher inline in Explore, replacing the search + filter
   sections. Free users keep the normal Explore layout. City Guide is untouched. ── */
function applyExploreMatcherLayout() {
    var modal   = document.getElementById('fyModal');
    var overlay = document.getElementById('fyOverlay');
    var mount   = document.getElementById('expMatcherMount');
    if (!modal || !mount) return;

    var elite = (typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite);
    var sections = [
        document.querySelector('#tabExplore .exp__hero'),
        document.querySelector('#tabExplore .exp__break:not(.exp__break--city)'),
        document.querySelector('#tabExplore .exp__filter__card')
    ];

    if (elite) {
        if (modal.parentNode !== mount) { mount.appendChild(modal); }
        modal.classList.add('fy__modal--inline');
        mount.style.display = 'block';
        sections.forEach(function (el) { if (el) el.style.display = 'none'; });
        // Fresh start every time Explore is opened: reset filters + sync the country label.
        if (typeof window.fyReset === 'function') window.fyReset();
        if (typeof window.fyRefresh === 'function') window.fyRefresh();
    } else {
        if (overlay && modal.parentNode !== overlay) { overlay.appendChild(modal); }
        modal.classList.remove('fy__modal--inline');
        mount.style.display = 'none';
        sections.forEach(function (el) { if (el) el.style.display = ''; });
    }
    window.__fyInline = elite;
    if (typeof window.updateFyButtons === 'function') window.updateFyButtons();
}

/* ════════════════════════════════════════════════════════════════════════════
   GRADEBOOK & ACADEMIC PROGRESS  (Phase 1)
   ──────────────────────────────────────────────────────────────────────────
   Storage: us_gradebook_<id> (versioned). Every grade is stored historically
   — never only the average — so future AI/predictions and school-system
   imports (e.g. Toddle) can use the full timeline. See docs at end of file.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    var KEY = 'us_gradebook_' + user.id;
    var ASSESS_TYPES = ['Test', 'Quiz', 'Exam', 'Midterm', 'Final', 'Coursework', 'Project', 'Homework'];
    var PALETTE = ['#d97c14', '#3498db', '#27ae60', '#9b59b6', '#e74c3c', '#1abc9c', '#e67e22', '#2c3e50'];

    function fresh() { return { v: 1, scale: 'pct', subjects: [], unis: { dream: [], target: [], safety: [] }, goals: [] }; }
    function load() { try { var d = JSON.parse(localStorage.getItem(KEY)); return d && d.subjects ? d : fresh(); } catch (e) { return fresh(); } }
    function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
    var GB = load();
    var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

    /* ── Grade scale: averages stay in the student's own system; percentages
          are used ONLY for university chances/readiness/gaps. ── */
    var SCALES = {
        pct: { max: 100, label: 'Percentage (0–100)', hint: '/ 100' },
        p10: { max: 10,  label: 'Points (1–10)',       hint: '/ 10' },
        p9:  { max: 9,   label: 'GCSE (1–9)',          hint: '/ 9' },
        p8:  { max: 8,   label: 'Out of 8 (1–8)',      hint: '/ 8' },
        p5:  { max: 5,   label: 'Scale (1–5)',         hint: '/ 5' },
        gpa: { max: 4,   label: 'GPA (0–4)',           hint: '/ 4' }
    };
    function scaleDef() { return SCALES[GB.scale] || SCALES.pct; }
    function scaleMax() { return scaleDef().max; }
    function toPct(g) { return g == null ? null : Math.max(0, Math.min(100, g / scaleMax() * 100)); }
    function gradeColor(g) { return ringColor(toPct(g)); }

    /* ── Maths ─────────────────────────────────────────────── */
    function subjAvg(s) {
        var mx = scaleMax();
        // Final grade per subject (what the student/PDF provides). Falls back to the
        // legacy per-assessment average for any older data.
        if (s.grade != null && s.grade !== '') return Math.max(0, Math.min(mx, +s.grade));
        if (!s.assessments || !s.assessments.length) return null;
        var w = 0, t = 0;
        s.assessments.forEach(function (a) { var wt = a.weight || 1, g = Math.max(0, Math.min(mx, a.grade)); w += wt; t += g * wt; });
        return w ? t / w : null;
    }
    function overallAvg(state) {
        state = state || GB;
        var vals = state.subjects.map(subjAvg).filter(function (v) { return v != null; });
        if (!vals.length) return null;
        return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }
    // Overall-average timeline: recompute the overall average after each grade (by date) was added.
    function overallSeries() {
        var all = [];
        GB.subjects.forEach(function (s) { s.assessments.forEach(function (a) { all.push({ sid: s.id, a: a }); }); });
        all.sort(function (x, y) { return (x.a.date || '').localeCompare(y.a.date || '') || x.a.ts - y.a.ts; });
        var bySub = {}, series = [];
        all.forEach(function (item) {
            (bySub[item.sid] = bySub[item.sid] || []).push(item.a);
            var subAvgs = Object.keys(bySub).map(function (k) {
                var w = 0, t = 0, mx = scaleMax(); bySub[k].forEach(function (a) { var wt = a.weight || 1, g = Math.max(0, Math.min(mx, a.grade)); w += wt; t += g * wt; });
                return w ? t / w : 0;
            });
            series.push(subAvgs.reduce(function (a, b) { return a + b; }, 0) / subAvgs.length);
        });
        return series;
    }
    // Typical entry mark (as a %) implied by a university's selectivity (diff 1..5).
    function recPct(u) { return ({ 5: 97, 4: 91, 3: 83, 2: 75, 1: 67 })[u.diff || 3] || 80; }
    function recGrade(u) { return recPct(u); }                       // back-compat alias (percentage)
    function reqMark(u) { return Math.round(recPct(u) / 100 * scaleMax() * 10) / 10; }   // required mark in the student's own scale
    // Realistic readiness: meeting the bar ≈ ready; every point below it costs a lot.
    function readinessForPct(cur, u) {
        var gap = recPct(u) - cur;
        var r = gap <= 0 ? (94 + Math.min(6, Math.round(-gap / 3))) : Math.round(95 * Math.pow(0.9, gap));
        return Math.max(2, Math.min(99, r));
    }
    function readinessPct(u) { var o = overallAvg(); return o == null ? null : readinessForPct(toPct(o), u); }
    // The university the student is aiming for (top dream, else top target).
    function aimUni() { var id = GB.unis.dream[0] || GB.unis.target[0]; return id ? findUni(id) : null; }
    function findUni(id) { return (typeof UNI !== 'undefined') ? UNI.find(function (u) { return u.id === id; }) : null; }
    function allTargetIds() { return GB.unis.dream.concat(GB.unis.target, GB.unis.safety); }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
    function fmtMonth(d) { try { return new Date(d + 'T00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); } catch (e) { return d; } }

    /* ── Sparkline ─────────────────────────────────────────── */
    function sparkline(svg, series) {
        if (!svg) return;
        if (series.length < 2) { svg.innerHTML = ''; return; }
        var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
        var span = (max - min) || 1, W = 120, H = 40, pad = 4;
        var pts = series.map(function (v, i) {
            var x = pad + i / (series.length - 1) * (W - pad * 2);
            var y = H - pad - (v - min) / span * (H - pad * 2);
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var last = pts[pts.length - 1].split(',');
        svg.innerHTML =
            '<polyline fill="none" stroke="#d97c14" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(' ') + '"/>' +
            '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="#d97c14"/>';
    }

    /* ── Renderers ─────────────────────────────────────────── */
    function ringColor(p) { return p >= 85 ? '#27ae60' : p >= 70 ? '#f39c12' : p >= 50 ? '#e67e22' : '#e74c3c'; }

    // How close the student is to where they want to be (0–100). Uses the aim
    // university's readiness if one is chosen, otherwise the average as a %.
    function closeness() {
        var o = overallAvg(); if (o == null) return null;
        var aim = aimUni();
        return aim ? readinessPct(aim) : Math.round(toPct(o));
    }
    // Animated line that trends UP (green) when on track (≥70% close) or DOWN (red) otherwise.
    function trendGraph(svg, up) {
        if (!svg) return;
        var col = up ? '#27ae60' : '#e74c3c';
        var pts = up ? '4,44 26,38 50,40 74,24 98,16 116,7' : '4,12 26,18 50,17 74,32 98,40 116,50';
        var head = up ? '<path d="M116,7 l-10,0.5 l5,7.5 z" fill="' + col + '"/>'
                      : '<path d="M116,50 l-10,-0.5 l5,-7.5 z" fill="' + col + '"/>';
        svg.innerHTML = '<polyline class="gb__tg__line" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/>' + head;
        var ln = svg.querySelector('.gb__tg__line');
        if (ln) {
            var len = ln.getTotalLength ? ln.getTotalLength() : 220;
            ln.style.strokeDasharray = len; ln.style.strokeDashoffset = len;
            void ln.getBoundingClientRect();
            ln.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.8,.3,1)';
            ln.style.strokeDashoffset = '0';
        }
        svg.classList.toggle('gb__tg--up', !!up);
        svg.classList.toggle('gb__tg--down', !up);
    }

    function renderOverall() {
        var o = overallAvg();
        var ringNum = document.getElementById('gbRingNum');
        if (ringNum) { ringNum.textContent = o == null ? '—' : Math.round(o * 10) / 10; ringNum.style.color = o == null ? '' : gradeColor(o); }
        var scEl = document.getElementById('gbAvgScale'); if (scEl) scEl.textContent = o == null ? '' : scaleDef().hint;
        sparkline(document.getElementById('gbSpark'), overallSeries());
        // Animated up/down trajectory graphic
        var c = closeness(), up = c != null && c >= 70;
        var g = document.getElementById('gbTrendGraph');
        if (g) { if (c == null) g.innerHTML = ''; else trendGraph(g, up); }
        var glbl = document.getElementById('gbTrendGraphLbl'), aim = aimUni();
        if (glbl) {
            if (c == null) glbl.textContent = 'Add grades to see your trajectory';
            else glbl.innerHTML = '<span style="color:' + (up ? '#27ae60' : '#e74c3c') + ';font-weight:800">' + (up ? '▲ On track' : '▼ Off track') + '</span> · ' + c + '% toward ' + (aim ? esc(aim.name) : 'your goal');
        }
    }

    function renderSubjects() {
        var box = document.getElementById('gbSubjects');
        if (!box) return;
        if (!GB.subjects.length) { box.innerHTML = '<div class="gb__empty"><i class="fa-solid fa-book-open"></i><p>No subjects yet. Add your first subject above to start tracking grades.</p></div>'; return; }
        var hint = scaleDef().hint, mx = scaleMax();
        box.innerHTML = GB.subjects.map(function (s) {
            var avg = subjAvg(s);
            // One final grade per subject — editable inline. No per-test inputs.
            return '<div class="gb__subject gb__subject--final" style="--sc:' + (s.color || '#d97c14') + '" data-sid="' + s.id + '">' +
                '<div class="gb__subject__name"><span class="gb__subject__dot"></span>' + esc(s.name) + '</div>' +
                '<div class="gb__subject__final">' +
                    '<input type="number" class="gb__sgrade" min="0" max="' + mx + '" step="0.1" placeholder="—" value="' + (avg == null ? '' : (Math.round(avg * 10) / 10)) + '"' + (avg == null ? '' : ' style="color:' + gradeColor(avg) + '"') + '>' +
                    '<span class="gb__sgrade__max">' + hint + '</span>' +
                '</div>' +
                '<button class="gb__subject__del" title="Remove subject"><i class="fa-solid fa-trash-can"></i></button>' +
            '</div>';
        }).join('');
    }

    function renderReadiness() {
        var box = document.getElementById('gbReadiness');
        if (!box) return;
        var ids = allTargetIds();
        if (!ids.length) { box.innerHTML = '<p class="gb__hint">Pick the universities you\'re aiming for below to see how ready you really are.</p>'; return; }
        var o = overallAvg();
        if (o == null) { box.innerHTML = '<p class="gb__hint">Add your grades to calculate readiness.</p>'; return; }
        var cur = Math.round(o * 10) / 10, hint = scaleDef().hint;
        box.innerHTML = ids.map(function (id) {
            var u = findUni(id); if (!u) return '';
            var p = readinessPct(u), req = reqMark(u);
            var lab = p >= 80 ? 'Strong match' : p >= 45 ? 'Within reach' : 'Long shot';
            return '<div class="gb__read__row">' +
                '<div class="gb__read__top">' +
                    '<span class="gb__read__uni"><span class="gb__read__logo" style="background:' + (u.color || '#d97c14') + '">' + esc(u.abbr || u.name.slice(0, 2).toUpperCase()) + '</span>' + esc(u.name) + '</span>' +
                    '<b style="color:' + ringColor(p) + '">' + p + '%</b>' +
                '</div>' +
                '<div class="gb__read__bar"><i style="width:' + p + '%;background:' + ringColor(p) + '"></i></div>' +
                '<div class="gb__read__meta"><span style="color:' + ringColor(p) + ';font-weight:700">' + lab + '</span><span>needs ~' + req + ' ' + hint + ' · you have ' + cur + '</span></div>' +
            '</div>';
        }).join('') || '<p class="gb__hint">Pick the universities you\'re aiming for below.</p>';
    }

    // Subjects below the mark required by the university the student is aiming for,
    // with the gap expressed in the student's own scale (e.g. +2 on /8).
    function attentionSubjects() {
        var aim = aimUni();
        if (!aim) return [];
        var bar = reqMark(aim);
        return GB.subjects.map(function (s) { return { name: s.name, avg: subjAvg(s) }; })
            .filter(function (x) { return x.avg != null && x.avg < bar; })
            .map(function (x) { return { name: x.name, avg: Math.round(x.avg * 10) / 10, need: Math.round((bar - x.avg) * 10) / 10 }; })
            .sort(function (a, b) { return b.need - a.need; });
    }
    function renderAttention() {
        var box = document.getElementById('gbAttention');
        if (!box) return;
        var aim = aimUni();
        if (!aim) {
            box.innerHTML = '<p class="gb__hint">' + (overallAvg() == null ? 'Add your grades to spot weak spots.' : 'Pick the university you\'re aiming for (Dream or Target) and we\'ll show exactly what to lift.') + '</p>';
            return;
        }
        var hint = scaleDef().hint, req = reqMark(aim), list = attentionSubjects();
        if (!list.length) { box.innerHTML = '<p class="gb__hint">Every subject already meets ' + esc(aim.name) + '\'s bar (~' + req + ' ' + hint + '). 🎉</p>'; return; }
        box.innerHTML = '<div class="gb__attn__aim">Aiming for <b>' + esc(aim.name) + '</b> — target ~<b>' + req + ' ' + hint + '</b> per subject:</div>' +
            list.map(function (x) {
                return '<div class="gb__attn__row"><span><i class="fa-solid fa-arrow-trend-up"></i> ' + esc(x.name) + ' <small>(' + x.avg + ')</small></span><b>+' + x.need + ' pts</b></div>';
            }).join('');
    }

    function renderTargets() {
        var box = document.getElementById('gbTargets');
        if (!box) return;
        var tiers = [
            { k: 'dream', label: 'Dream', icon: 'fa-star', hint: 'Reach for the stars' },
            { k: 'target', label: 'Target', icon: 'fa-bullseye', hint: 'Realistic best-fits' },
            { k: 'safety', label: 'Safety', icon: 'fa-shield-halved', hint: 'Comfortably within reach' }
        ];
        var opts = (typeof UNI !== 'undefined' ? UNI : []).map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('');
        box.innerHTML = tiers.map(function (t) {
            var chips = (GB.unis[t.k] || []).map(function (id) {
                var u = findUni(id); if (!u) return '';
                return '<span class="gb__chip2" style="--cc:' + (u.color || '#d97c14') + '"><b>' + esc(u.abbr || '') + '</b>' + esc(u.name) + '<button class="gb__chip2__del" data-tier="' + t.k + '" data-id="' + id + '"><i class="fa-solid fa-xmark"></i></button></span>';
            }).join('') || '<span class="gb__hint">None yet</span>';
            return '<div class="gb__tier gb__tier--' + t.k + '">' +
                '<div class="gb__tier__hd"><i class="fa-solid ' + t.icon + '"></i> ' + t.label + '<small>' + t.hint + '</small></div>' +
                '<div class="gb__tier__chips">' + chips + '</div>' +
                '<div class="gb__tier__add"><select class="gb__input gb__tier__sel" data-tier="' + t.k + '"><option value="">Add a university…</option>' + opts + '</select></div>' +
            '</div>';
        }).join('');
    }

    function renderGaps() {
        var box = document.getElementById('gbGaps');
        if (!box) return;
        var ids = GB.unis.dream.concat(GB.unis.target);
        if (!ids.length || overallAvg() == null) { document.getElementById('gbGapsBlock').style.display = (ids.length || GB.subjects.length) ? '' : 'none'; box.innerHTML = '<p class="gb__hint">Add grades and pick Dream/Target universities to see your gaps.</p>'; return; }
        document.getElementById('gbGapsBlock').style.display = '';
        box.innerHTML = ids.map(function (id) {
            var u = findUni(id); if (!u) return '';
            var rec = recGrade(u), p = readinessPct(u);
            var fields = (u.fields || []).map(function (f) { return f.toLowerCase(); });
            var rel = GB.subjects.filter(function (s) { return fields.some(function (f) { return f.indexOf(s.name.toLowerCase()) !== -1 || s.name.toLowerCase().indexOf(f) !== -1; }); });
            if (!rel.length) rel = GB.subjects;
            var rows = rel.filter(function (s) { return subjAvg(s) != null; }).map(function (s) {
                var a = Math.round(toPct(subjAvg(s))), gap = rec - a;
                return '<div class="gb__gap__row"><span class="gb__gap__sub">' + esc(s.name) + '</span>' +
                    '<span class="gb__gap__cur">' + a + '</span><span class="gb__gap__arrow">→</span><span class="gb__gap__rec">' + rec + '</span>' +
                    '<span class="gb__gap__delta ' + (gap > 0 ? 'is-gap' : 'is-met') + '">' + (gap > 0 ? '+' + gap : '✓ met') + '</span></div>';
            }).join('') || '<p class="gb__hint">Add grades to compare.</p>';
            return '<div class="gb__gapcard" style="--cc:' + (u.color || '#d97c14') + '">' +
                '<div class="gb__gapcard__hd"><div><b>' + esc(u.name) + '</b><small>' + esc((u.fields || [])[0] || u.dl || '') + '</small></div><span class="gb__gapcard__pct" style="color:' + ringColor(p) + '">' + p + '%</span></div>' +
                '<div class="gb__gap__rows">' + rows + '</div></div>';
        }).join('');
    }

    function renderGoals() {
        var sel = document.getElementById('gbGoalSubject');
        if (sel) sel.innerHTML = '<option value="">Subject…</option>' + GB.subjects.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
        var box = document.getElementById('gbGoals');
        if (!box) return;
        if (!GB.goals.length) { box.innerHTML = '<p class="gb__hint">No goals yet. Set a target average and we\'ll add it to your Deadlines.</p>'; return; }
        box.innerHTML = GB.goals.map(function (g) {
            var s = GB.subjects.find(function (x) { return x.id === g.subjectId; });
            var cur = s ? subjAvg(s) : null; cur = cur == null ? g.from : Math.round(cur);
            var span = (g.to - g.from) || 1, prog = Math.max(0, Math.min(100, Math.round((cur - g.from) / span * 100)));
            var done = cur >= g.to;
            return '<div class="gb__goal ' + (done ? 'is-done' : '') + '" data-gid="' + g.id + '">' +
                '<div class="gb__goal__hd"><span><i class="fa-solid ' + (done ? 'fa-circle-check' : 'fa-flag') + '"></i> ' + esc(g.subjectName) + ' → ' + g.to + '%</span>' +
                '<button class="gb__goal__del" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="gb__goal__meta">From ' + g.from + '% · now <b>' + cur + '%</b> · by ' + fmtMonth(g.date) + (done ? ' · <b style="color:#27ae60">achieved!</b>' : ' · <b>+' + Math.max(0, g.to - cur) + '</b> to go') + '</div>' +
                '<div class="gb__goal__bar"><i style="width:' + prog + '%"></i></div></div>';
        }).join('');
    }

    var recOverride = null;   // "what-if" average set via the slider (in the student's scale)
    function renderRecs() {
        var box = document.getElementById('gbRecs');
        if (!box) return;
        var real = overallAvg();
        var slider = document.getElementById('gbRecSlider'), valEl = document.getElementById('gbRecVal');
        if (slider) { slider.max = scaleMax(); slider.step = scaleMax() <= 10 ? 0.5 : 1; }
        var o = recOverride != null ? recOverride : real;
        if (slider && o != null) slider.value = o;
        if (valEl) valEl.textContent = o == null ? '—' : ((Math.round(o * 10) / 10) + ' ' + scaleDef().hint + (recOverride != null ? ' · what-if' : ''));
        if (o == null) { box.innerHTML = '<p class="gb__hint">Add grades — or drag the slider — to see which universities fit.</p>'; return; }
        if (typeof UNI === 'undefined' || !UNI.length) { box.innerHTML = '<p class="gb__hint">No universities loaded for your destination yet.</p>'; return; }
        var curPct = toPct(o);
        var scored = UNI.map(function (u) { return { u: u, ratio: curPct / recPct(u), pct: readinessForPct(curPct, u) }; });
        var buckets = [
            { key: 'strong', label: 'Strong matches', icon: 'fa-circle-check', col: '#27ae60', f: function (x) { return x.ratio >= 1; } },
            { key: 'target', label: 'Target matches', icon: 'fa-bullseye', col: '#f39c12', f: function (x) { return x.ratio >= 0.85 && x.ratio < 1; } },
            { key: 'reach', label: 'Reach universities', icon: 'fa-fire', col: '#e74c3c', f: function (x) { return x.ratio < 0.85; } }
        ];
        box.innerHTML = buckets.map(function (b) {
            var list = scored.filter(b.f).sort(function (a, c) { return c.ratio - a.ratio; }).slice(0, 5);
            var items = list.map(function (x) {
                return '<div class="gb__rec__item"><span class="gb__rec__abbr" style="background:' + (x.u.color || '#d97c14') + '">' + esc(x.u.abbr || '?') + '</span>' +
                    '<span class="gb__rec__nm">' + esc(x.u.name) + '</span><b style="color:' + ringColor(x.pct) + '">' + x.pct + '%</b></div>';
            }).join('') || '<p class="gb__hint">None right now.</p>';
            return '<div class="gb__rec__col"><div class="gb__rec__hd" style="color:' + b.col + '"><i class="fa-solid ' + b.icon + '"></i> ' + b.label + '</div>' + items + '</div>';
        }).join('');
    }

    /* ── Dashboard widget (Overview) ───────────────────────── */
    function renderWidget() {
        var w = document.getElementById('dshAcademic');
        if (!w) return;
        var brk = document.getElementById('acadBreak');
        if (!GB.subjects.length) { w.style.display = 'none'; if (brk) brk.style.display = 'none'; return; }
        w.style.display = ''; if (brk) brk.style.display = '';
        var o = overallAvg();
        document.getElementById('dshAcadAvg').textContent = o == null ? '—' : Math.round(toPct(o));   // always out of 100
        // Animated up/down trajectory graphic (up & green if ≥70% close, else down & red)
        var c = closeness(), up = c != null && c >= 70;
        var g = document.getElementById('dshAcadGraph');
        if (g) { if (c == null) g.innerHTML = ''; else trendGraph(g, up); }
        var tEl = document.getElementById('dshAcadTrend');
        if (tEl) {
            if (c == null) tEl.textContent = '';
            else tEl.innerHTML = '<span style="color:' + (up ? '#27ae60' : '#e74c3c') + ';font-weight:800">' + (up ? '▲ On track' : '▼ Needs a push') + '</span> · ' + c + '% there';
        }
        var ids = allTargetIds().slice(0, 3), rEl = document.getElementById('dshAcadReadiness');
        if (rEl) {
            rEl.innerHTML = ids.length && o != null ? ('<div class="dshacad__sub">University readiness</div>' + ids.map(function (id) {
                var u = findUni(id); if (!u) return ''; var p = readinessPct(u);
                return '<div class="dshacad__read__row"><span>' + esc(u.abbr || u.name) + '</span><b style="color:' + ringColor(p) + '">' + p + '%</b></div>';
            }).join('')) : '<div class="dshacad__sub">Pick target universities in the Gradebook</div>';
        }
        var attn = attentionSubjects(), aEl = document.getElementById('dshAcadAttention');
        if (aEl) {
            aEl.innerHTML = '<div class="dshacad__sub">Needs attention</div>' + (attn.length ? attn.map(function (x) { return '<span class="dshacad__tag">' + esc(x.name) + ' <b>+' + x.need + '</b></span>'; }).join('') : '<span class="gb__hint">All good 🎉</span>');
        }
        // Improvement-to-target line + any linked deadline
        var pEl = document.getElementById('dshAcadGoal'), plan = improvementPlan();
        if (pEl) {
            if (plan && plan.gap > 0) {
                var dl = null; try { dl = getDlCustom().filter(function (d) { return /^gbgoal_|^gbplan_/.test(d.id); }).sort(function (a, b) { return a.date.localeCompare(b.date); })[0]; } catch (e) {}
                pEl.style.display = '';
                pEl.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i> Improve your average <b>+' + plan.gap + '</b> to reach <b>' + esc(plan.uni.name) + '</b>' +
                    (dl ? ' · <span class="dshacad__due">by ' + fmtMonth(dl.date) + '</span>' : '');
            } else if (plan && plan.gap <= 0) {
                pEl.style.display = ''; pEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#27ae60"></i> You\'re on track for <b>' + esc(plan.uni.name) + '</b> 🎉';
            } else { pEl.style.display = 'none'; }
        }
    }

    /* ── Master render + persistence ───────────────────────── */
    function renderAll() {
        renderOverall(); renderSubjects(); renderReadiness(); renderAttention();
        renderTargets(); renderGaps(); renderPlan(); renderGoals(); renderRecs(); renderWidget();
    }
    function commit(msg) { save(GB); renderAll(); if (msg) toast(msg); }
    window.renderGradebook = renderAll;
    window.renderAcademicWidget = renderWidget;

    function toast(msg) {
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:6000;display:flex;align-items:center;gap:9px;' +
            'padding:12px 20px;border-radius:12px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;color:#fff;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.25);background:linear-gradient(135deg,#d97c14,#f59220);animation:arIn .3s ease both';
        bar.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i> ' + msg;
        document.body.appendChild(bar);
        setTimeout(function () { bar.style.transition = 'opacity .4s'; bar.style.opacity = '0'; setTimeout(function () { bar.remove(); }, 400); }, 2600);
    }

    /* ── Events (delegated) ────────────────────────────────── */
    var root = document.getElementById('tabGradebook');
    function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

    function addSubject() {
        var inp = document.getElementById('gbNewSubject'), gi = document.getElementById('gbNewGrade');
        var name = (inp.value || '').trim();
        if (!name) return;
        var g = parseFloat(gi.value);
        if (!isNaN(g)) { if (g > scaleMax()) { toast('Mark can\'t exceed ' + scaleMax() + ' on this scale'); return; } g = Math.max(0, Math.min(scaleMax(), g)); } else { g = null; }
        var ex = GB.subjects.find(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
        if (ex) { ex.grade = g; } else { GB.subjects.push({ id: uid(), name: name, color: PALETTE[GB.subjects.length % PALETTE.length], grade: g, assessments: [] }); }
        inp.value = ''; gi.value = '';
        commit('Subject added');
    }
    document.getElementById('gbAddSubjectBtn').addEventListener('click', addSubject);
    document.getElementById('gbNewSubject').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSubject(); });
    document.getElementById('gbNewGrade').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSubject(); });
    var recSlider = document.getElementById('gbRecSlider');
    if (recSlider) recSlider.addEventListener('input', function () { recOverride = parseFloat(this.value); renderRecs(); });
    var recReset = document.getElementById('gbRecReset');
    if (recReset) recReset.addEventListener('click', function () { recOverride = null; renderRecs(); });

    document.getElementById('gbAddGoalBtn').addEventListener('click', function () {
        var sid = document.getElementById('gbGoalSubject').value;
        var to = parseInt(document.getElementById('gbGoalTarget').value, 10);
        var m = document.getElementById('gbGoalDate').value;
        var s = GB.subjects.find(function (x) { return x.id === sid; });
        if (!s || !to || !m) { toast('Pick a subject, target and date'); return; }
        var cur = subjAvg(s); var from = cur == null ? 0 : Math.round(cur);
        var date = m + '-15';
        var g = { id: uid(), subjectId: sid, subjectName: s.name, from: from, to: to, date: date, dlId: 'gbgoal_' + uid() };
        GB.goals.push(g);
        // Mirror into the existing deadline system so it shows on the Deadlines page.
        try {
            var cust = getDlCustom();
            cust.push({ id: g.dlId, uniName: null, type: 'other', title: s.name + ' target: reach ' + to + '% average', date: date, notes: 'Academic goal — from ' + from + '% to ' + to + '%' });
            setDlCustom(cust);
            if (typeof renderDeadlines === 'function') renderDeadlines();
        } catch (e) {}
        document.getElementById('gbGoalTarget').value = ''; document.getElementById('gbGoalDate').value = '';
        commit('Goal added to your Deadlines');
    });

    if (root) root.addEventListener('click', function (e) {
        var t = e.target;
        // create deadline from the AI improvement plan
        if (t.closest('#gbPlanDeadline')) {
            var plan = improvementPlan(); if (!plan) return;
            var d = new Date(); d.setMonth(d.getMonth() + 6);
            var date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-15';
            var dlId = 'gbplan_' + plan.uni.id;
            try {
                var cust = getDlCustom().filter(function (x) { return x.id !== dlId; });
                cust.push({ id: dlId, uniName: plan.uni.name, type: 'other', title: 'Reach ' + plan.rec + '% average for ' + plan.uni.name, date: date, notes: 'AI improvement plan — lift your average from ' + plan.overall + '% (+' + plan.gap + ')' });
                setDlCustom(cust);
                if (typeof renderDeadlines === 'function') renderDeadlines();
            } catch (err) {}
            commit('Deadline added — see your Deadlines page'); return;
        }
        // remove subject
        var delSub = t.closest('.gb__subject__del');
        if (delSub) { var sid = delSub.closest('.gb__subject').dataset.sid; GB.subjects = GB.subjects.filter(function (s) { return s.id !== sid; }); GB.goals = GB.goals.filter(function (g) { return g.subjectId !== sid; }); commit('Subject removed'); return; }
        // remove assessment
        var delA = t.closest('.gb__assess__del');
        if (delA) { var row = delA.closest('.gb__assess'); var s = GB.subjects.find(function (x) { return x.id === row.dataset.sid; }); if (s) { s.assessments = s.assessments.filter(function (a) { return a.id !== row.dataset.aid; }); commit('Grade removed'); } return; }
        // add assessment
        var addA = t.closest('.gb__a-add');
        if (addA) {
            var card = addA.closest('.gb__subject'); var s2 = GB.subjects.find(function (x) { return x.id === card.dataset.sid; }); if (!s2) return;
            var nm = card.querySelector('.gb__a-name').value.trim();
            var ty = card.querySelector('.gb__a-type').value;
            var gr = parseFloat(card.querySelector('.gb__a-grade').value);
            var wt = parseFloat(card.querySelector('.gb__a-weight').value) || 1;
            var dt = card.querySelector('.gb__a-date').value || thisMonth();
            if (isNaN(gr)) { toast('Enter a grade'); return; }
            if (gr > scaleMax()) { toast('Mark can\'t exceed ' + scaleMax() + ' on this scale'); return; }
            gr = Math.max(0, Math.min(scaleMax(), gr));
            s2.assessments.push({ id: uid(), name: nm || ty, type: ty, grade: gr, weight: wt, date: dt + (dt.length === 7 ? '-01' : ''), ts: Date.now() });
            commit('Grade added — everything updated');
            return;
        }
        // remove target chip
        var chipDel = t.closest('.gb__chip2__del');
        if (chipDel) { var tier = chipDel.dataset.tier, id = chipDel.dataset.id; GB.unis[tier] = GB.unis[tier].filter(function (x) { return x !== id; }); commit(); return; }
        // remove goal
        var goalDel = t.closest('.gb__goal__del');
        if (goalDel) {
            var gid = goalDel.closest('.gb__goal').dataset.gid; var goal = GB.goals.find(function (g) { return g.id === gid; });
            GB.goals = GB.goals.filter(function (g) { return g.id !== gid; });
            if (goal) { try { setDlCustom(getDlCustom().filter(function (d) { return d.id !== goal.dlId; })); if (typeof renderDeadlines === 'function') renderDeadlines(); } catch (e) {} }
            commit('Goal removed'); return;
        }
    });

    if (root) root.addEventListener('change', function (e) {
        var sel = e.target.closest('.gb__tier__sel');
        if (sel && sel.value) {
            var tier = sel.dataset.tier, id = sel.value;
            ['dream', 'target', 'safety'].forEach(function (k) { GB.unis[k] = GB.unis[k].filter(function (x) { return x !== id; }); });
            GB.unis[tier].push(id);
            commit('Universities updated');
            return;
        }
        // inline edit of a subject's final grade
        var gi = e.target.closest('.gb__sgrade');
        if (gi) {
            var card = gi.closest('.gb__subject'); var s = GB.subjects.find(function (x) { return x.id === card.dataset.sid; }); if (!s) return;
            var v = parseFloat(gi.value);
            if (isNaN(v)) { s.grade = null; }
            else { if (v > scaleMax()) { toast('Max is ' + scaleMax() + ' on this scale'); v = scaleMax(); } s.grade = Math.max(0, Math.min(scaleMax(), v)); }
            commit();
        }
    });

    /* ── Dream-university improvement plan (Elite) ───────────── */
    function improvementPlan() {
        var u = aimUni(), o = overallAvg();
        if (!u || o == null) return null;
        var rec = reqMark(u), gap = Math.round((rec - o) * 10) / 10;   // all in the student's scale
        var weak = GB.subjects.map(function (s) { return { name: s.name, avg: subjAvg(s) }; })
            .filter(function (x) { return x.avg != null && x.avg < rec; })
            .map(function (x) { return { name: x.name, avg: Math.round(x.avg * 10) / 10, need: Math.round((rec - x.avg) * 10) / 10 }; })
            .sort(function (a, b) { return b.need - a.need; });
        return { uni: u, rec: rec, overall: Math.round(o * 10) / 10, gap: gap, weak: weak };
    }
    function isElite() { return typeof eliteState !== 'undefined' && eliteState && !!eliteState.elite; }
    function renderPlan() {
        var block = document.getElementById('gbPlanBlock'), box = document.getElementById('gbPlan');
        if (!block || !box) return;
        block.style.display = '';
        var plan = improvementPlan();
        if (!plan) {
            box.innerHTML = '<div class="gb__plan__empty"><i class="fa-solid fa-circle-info"></i> ' +
                (overallAvg() == null
                    ? 'Add your grades, then pick the university you\'re aiming for (Dream or Target) and we\'ll build your plan.'
                    : 'Pick the university you\'re aiming for under <b>Dream</b> or <b>Target</b> below, and your step-by-step plan appears here.') +
                '</div>';
            return;
        }
        var hint = scaleDef().hint;
        if (plan.gap <= 0) {
            box.innerHTML = '<div class="gb__plan__ok"><i class="fa-solid fa-circle-check"></i> Your average (' + plan.overall + ' ' + hint + ') already meets ' + esc(plan.uni.name) + "'s typical bar of " + plan.rec + ' ' + hint + '. Keep it up!</div>';
            return;
        }
        var steps = plan.weak.slice(0, 4).map(function (w) {
            return '<li><span class="gb__plan__sub">' + esc(w.name) + '</span><span class="gb__plan__from">' + w.avg + '</span><i class="fa-solid fa-arrow-right"></i><span class="gb__plan__to">' + plan.rec + '</span><b class="gb__plan__need">+' + w.need + '</b></li>';
        }).join('') || '<li>Keep lifting your subjects to raise your overall average.</li>';
        box.innerHTML =
            '<div class="gb__plan__hd"><span class="gb__plan__badge"><i class="fa-solid fa-wand-magic-sparkles"></i> AI plan</span> ' +
            'To get into <b>' + esc(plan.uni.name) + '</b> you typically need about <b>' + plan.rec + ' ' + hint + '</b>. You\'re at <b>' + plan.overall + '</b> — close a <b>+' + plan.gap + '</b> gap by focusing on:</div>' +
            '<ul class="gb__plan__steps">' + steps + '</ul>' +
            '<button class="gb__btn gb__btn--primary" id="gbPlanDeadline"><i class="fa-solid fa-calendar-plus"></i> Create deadline to reach ' + plan.rec + ' ' + hint + ' average</button>';
    }

    /* ── PDF grades report → table ───────────────────────────────
       Only real school subjects are accepted (a whitelist), and the grade
       must fall within the chosen grade scale — so comments, dates, page
       numbers and other noise are ignored. ── */
    var SUBJECT_DICT = [
        { n: 'Mathematics', a: ['mathematics', 'maths', 'math', 'algebra', 'calculus', 'geometry', 'further maths', 'further mathematics', 'statistics', 'stats'] },
        { n: 'Physics', a: ['physics'] },
        { n: 'Chemistry', a: ['chemistry'] },
        { n: 'Biology', a: ['biology'] },
        { n: 'Science', a: ['combined science', 'natural science', 'science'] },
        { n: 'Computer Science', a: ['computer science', 'computing', 'informatics', 'ict', 'programming', 'computer studies'] },
        { n: 'English', a: ['english language', 'english literature', 'english', 'literature'] },
        { n: 'History', a: ['history'] },
        { n: 'Geography', a: ['geography'] },
        { n: 'Economics', a: ['economics'] },
        { n: 'Business', a: ['business studies', 'business'] },
        { n: 'Art', a: ['fine art', 'visual art', 'art'] },
        { n: 'Design', a: ['design technology', 'graphic design', 'design', 'technology'] },
        { n: 'Music', a: ['music'] },
        { n: 'Drama', a: ['drama', 'theatre', 'theater'] },
        { n: 'Physical Education', a: ['physical education', 'sport'] },
        { n: 'French', a: ['french'] },
        { n: 'Spanish', a: ['spanish'] },
        { n: 'German', a: ['german'] },
        { n: 'Italian', a: ['italian'] },
        { n: 'Chinese', a: ['chinese', 'mandarin'] },
        { n: 'Psychology', a: ['psychology'] },
        { n: 'Sociology', a: ['sociology'] },
        { n: 'Philosophy', a: ['philosophy'] },
        { n: 'Politics', a: ['politics', 'government'] },
        { n: 'Religious Studies', a: ['religious studies', 'religion'] },
        { n: 'Accounting', a: ['accounting', 'accountancy'] },
        { n: 'Law', a: ['law'] },
        { n: 'Environmental Science', a: ['environmental science', 'environmental'] },
        { n: 'Digitalization', a: ['digitalization', 'digitalización', 'digitalizacion', 'digital technology'] },
        { n: 'Civics', a: ['civics', 'educación cívica', 'educacion civica', 'cívica y valores'] },
        { n: 'Valencian', a: ['valencià', 'valencian'] }
    ];
    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function parseGrades(text) {
        var flat = (' ' + text + ' ').replace(/ /g, ' ');
        var max = scaleMax(), found = [], seen = {};

        // PRIMARY — IB MYP report: each subject row ends with "<final grade> <CODE>:<n>"
        // (CODE = IN/SU/BI/NT/SB). The final grade is the digit right before that code.
        SUBJECT_DICT.forEach(function (sub) {
            for (var i = 0; i < sub.a.length; i++) {
                var re = new RegExp('\\b' + escRe(sub.a[i]) + '\\b[^\\n]{0,90}?(\\d{1,2})\\s*(?:IN|SU|BI|NT|SB)\\s*:\\s*\\d', 'i');
                var m = re.exec(flat);
                if (!m) continue;
                var g = parseFloat(m[1]);
                if (isNaN(g) || g < 0 || g > max) continue;
                if (!seen[sub.n]) { seen[sub.n] = 1; found.push({ name: sub.n, grade: g }); }
                break;
            }
        });
        if (found.length) return found;

        // FALLBACK — generic report: subject immediately followed by a number on scale
        // (tight window so comments/dates aren't mistaken for grades).
        SUBJECT_DICT.forEach(function (sub) {
            for (var i = 0; i < sub.a.length; i++) {
                var re = new RegExp('\\b' + escRe(sub.a[i]) + '\\b\\s*[:\\-–]?\\s*(\\d{1,3}(?:\\.\\d)?)', 'i');
                var m = re.exec(flat);
                if (!m) continue;
                var g = parseFloat(m[1]);
                if (isNaN(g) || g < 0 || g > max) continue;
                if (!seen[sub.n]) { seen[sub.n] = 1; found.push({ name: sub.n, grade: g }); }
                break;
            }
        });
        return found;
    }
    function importPdf(file) {
        if (!window.pdfjsLib) { toast('PDF reader still loading — try again'); return; }
        try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {}
        var reader = new FileReader();
        reader.onload = function () {
            pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise.then(function (pdf) {
                var tasks = [];
                for (var i = 1; i <= pdf.numPages; i++) {
                    tasks.push(pdf.getPage(i).then(function (p) { return p.getTextContent().then(function (tc) { return tc.items.map(function (it) { return it.str; }).join(' '); }); }));
                }
                return Promise.all(tasks);
            }).then(function (texts) {
                openReview(parseGrades(texts.join('\n')));
            }).catch(function () { toast('Could not read that PDF — add grades manually'); });
        };
        reader.readAsArrayBuffer(file);
    }
    function openReview(rows) {
        var ov = document.createElement('div');
        ov.className = 'gb__review__ov';
        if (!rows.length) {
            // No recognisable subjects/grades → tell the user plainly.
            ov.innerHTML = '<div class="gb__review">' +
                '<div class="gb__review__hd"><h3>Couldn\'t read that file</h3><button class="gb__review__x"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<div class="gb__review__empty"><i class="fa-solid fa-file-circle-xmark"></i><b>Upload real GradeBook please</b>' +
                '<p>We couldn\'t find any school subjects (Maths, Physics, Biology…) with grades on your chosen scale in this document. Make sure it\'s an actual grades report — or add your subjects manually.</p></div>' +
                '<div class="gb__review__ft"><button class="gb__btn gb__btn--primary gb__review__cancel">Got it</button></div></div>';
            document.body.appendChild(ov);
            ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.gb__review__x') || e.target.closest('.gb__review__cancel')) ov.remove(); });
            return;
        }
        var scaleOpts = Object.keys(SCALES).map(function (k) { return '<option value="' + k + '"' + (k === (GB.scale || 'pct') ? ' selected' : '') + '>' + SCALES[k].label + '</option>'; }).join('');
        var body = rows.map(function (r, i) {
            return '<label class="gb__review__row"><input type="checkbox" checked data-i="' + i + '">' +
                '<input type="text" class="gb__input gb__rv__name" value="' + esc(r.name) + '">' +
                '<input type="number" class="gb__input gb__input--sm gb__rv__grade" value="' + r.grade + '" min="0" max="' + scaleMax() + '" step="0.1"></label>';
        }).join('');
        ov.innerHTML = '<div class="gb__review">' +
            '<div class="gb__review__hd"><h3>Review imported grades</h3><button class="gb__review__x"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="gb__review__scale"><span>Grading system</span><select class="gb__scale__sel gb__rv__scale">' + scaleOpts + '</select></div>' +
            '<p class="gb__hint">We found these subjects in your report — confirm the grading system, edit or untick anything, then import.</p>' +
            '<div class="gb__review__list">' + body + '</div>' +
            '<label class="gb__review__replace"><input type="checkbox" class="gb__rv__replace" checked> Replace my current subjects with these</label>' +
            '<div class="gb__review__ft"><button class="gb__btn gb__review__cancel">Cancel</button>' +
            '<button class="gb__btn gb__btn--primary gb__review__import"><i class="fa-solid fa-check"></i> Import ' + rows.length + ' grades</button></div></div>';
        document.body.appendChild(ov);
        function close() { ov.remove(); }
        ov.addEventListener('click', function (e) {
            if (e.target === ov || e.target.closest('.gb__review__x') || e.target.closest('.gb__review__cancel')) { close(); return; }
            if (e.target.closest('.gb__review__import')) {
                var scSel = ov.querySelector('.gb__rv__scale');
                if (scSel && SCALES[scSel.value]) { GB.scale = scSel.value; var ss = document.getElementById('gbScaleSel'); if (ss) ss.value = scSel.value; }
                var rep = ov.querySelector('.gb__rv__replace');
                if (rep && rep.checked) { GB.subjects = []; }   // wipe old/junk subjects, import a clean table
                var added = 0, dt = thisMonth() + '-01', mx = scaleMax();
                ov.querySelectorAll('.gb__review__row').forEach(function (row) {
                    if (!row.querySelector('input[type=checkbox]').checked) return;
                    var nm = row.querySelector('.gb__rv__name').value.trim();
                    var gr = Math.max(0, Math.min(mx, parseFloat(row.querySelector('.gb__rv__grade').value)));
                    if (!nm || isNaN(gr)) return;
                    var s = GB.subjects.find(function (x) { return x.name.toLowerCase() === nm.toLowerCase(); });
                    if (!s) { s = { id: uid(), name: nm, color: PALETTE[GB.subjects.length % PALETTE.length], assessments: [] }; GB.subjects.push(s); }
                    s.grade = gr;                 // final grade per subject (no per-test rows)
                    s.source = 'pdf';
                    added++;
                });
                close();
                commit(added ? (added + ' grades imported — your matches updated') : 'Nothing imported');
            }
        });
    }

    document.getElementById('gbUploadBtn').addEventListener('click', function () { document.getElementById('gbPdfInput').click(); });
    document.getElementById('gbPdfInput').addEventListener('change', function () { if (this.files && this.files[0]) importPdf(this.files[0]); this.value = ''; });
    var scaleSel = document.getElementById('gbScaleSel');
    if (scaleSel) {
        scaleSel.value = GB.scale || 'pct';
        scaleSel.addEventListener('change', function () { GB.scale = this.value; commit('Grading system set to ' + scaleDef().label); });
    }
    var clearBtn = document.getElementById('gbClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
        if (!GB.subjects.length) { toast('Gradebook is already empty'); return; }
        if (!confirm('Clear all subjects and grades from your Gradebook? This cannot be undone.')) return;
        var keepScale = GB.scale;
        GB = fresh(); GB.scale = keepScale;
        commit('Gradebook cleared');
    });
    var yr = document.getElementById('gbYear'); if (yr) yr.textContent = new Date().getFullYear();

    renderWidget();
    var gbNav = document.querySelector('.mp__nav__btn[data-tab="gradebook"]');
    if (gbNav) gbNav.addEventListener('click', renderAll);
}());

/* ════════════════════════════════════════════════════════════════════════════
   FUTURE SCHOOL-SYSTEM INTEGRATION (e.g. Toddle) — architecture notes
   ──────────────────────────────────────────────────────────────────────────
   The Phase-1 storage shape is deliberately integration-ready:

   us_gradebook_<id> = {
     v, subjects:[{ id, name, color, assessments:[
        { id, name, type, grade, weight, date(YYYY-MM-DD), ts }   ← full history, never just averages
     ]}], unis:{dream[],target[],safety[]}, goals:[{id,subjectId,from,to,date,dlId}]
   }

   1. DATABASE CHANGES (when a real backend is added):
      tables: subjects(id,user_id,name,external_id,source), 
              assessments(id,subject_id,name,type,grade,max_grade,weight,date,source,external_id,imported_at),
              university_targets(id,user_id,uni_id,tier),
              academic_goals(id,user_id,subject_id,from,to,due_date,deadline_id).
      The current JSON maps 1:1 onto these rows — no remodeling needed.

   2. APIs:  GET/POST /api/gradebook/subjects, /assessments, /targets, /goals;
             POST /api/integrations/{provider}/connect (OAuth), 
             POST /api/integrations/{provider}/sync  → normalises into assessments[].

   3. GRADE STORAGE FORMAT: store the RAW grade + scale (add max_grade & scale='percent|gpa|uk-ucas'
      later) so any school system maps cleanly; keep `date` + `ts` for the timeline.

   4. SUBJECT MAPPING: add a subject_map table (provider_subject_name → canonical subject)
      so "Maths"/"Mathematics HL"/"Math" collapse to one canonical subject.

   5. MULTIPLE SYSTEMS: tag every imported row with `source` + `external_id`; an adapter per
      provider (Toddle, Google Classroom, MMS…) normalises to the assessments[] shape.

   6. METADATA TO STORE NOW (already reserved): id, date, ts, type, weight, source(implicit
      'manual'), so adding imports later needs only `external_id`, `max_grade`, `scale` —
      additive columns, zero migration of existing data.
   ════════════════════════════════════════════════════════════════════════════ */

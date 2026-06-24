'use strict';
/* Shared interactions for the UniScout marketing pages
   (index.html, subscription.html, feature.html) */
(function () {
    // current year (if present)
    var yr = document.getElementById('year');
    if (yr) yr.textContent = new Date().getFullYear();

    // nav scrolled state + scroll-to-top button
    var nav = document.getElementById('nav'), top = document.getElementById('scrollTop');
    function onScroll() {
        var y = window.scrollY;
        if (nav && !nav.classList.contains('nav--solid')) nav.classList.toggle('scrolled', y > 24);
        if (top) top.classList.toggle('show', y > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    if (top) top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    // mobile menu
    var burger = document.getElementById('burger'), links = document.getElementById('navLinks');
    if (burger && links) {
        burger.addEventListener('click', function () { links.classList.toggle('open'); });
        links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); }); });
    }

    // hero headline entrance (only on pages that have it)
    document.querySelectorAll('.hero h1 .ln span').forEach(function (s, i) {
        s.style.transform = 'translateY(110%)';
        requestAnimationFrame(function () {
            s.style.transition = 'transform .9s cubic-bezier(.16,1,.3,1) ' + (i * 0.09 + 0.1) + 's';
            s.style.transform = 'translateY(0)';
        });
    });

    // scroll reveal
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.14 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

    // animated counters
    function animateCount(el) {
        var target = +el.dataset.count, suffix = el.dataset.suffix || '', dur = 1500, t0 = null;
        function tick(ts) {
            if (!t0) t0 = ts; var p = Math.min((ts - t0) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased) + (p === 1 ? suffix : (suffix && p > 0.6 ? suffix : ''));
            if (p < 1) requestAnimationFrame(tick); else el.textContent = target + suffix;
        }
        requestAnimationFrame(tick);
    }
    var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(function (el) { cio.observe(el); });
})();

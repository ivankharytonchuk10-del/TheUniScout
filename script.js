document.querySelector(".arrow2").addEventListener("click", function () {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("active");
});

document.querySelector(".sidebar .fa-xmark").addEventListener("click", function () {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.remove("active");
});

(function setupAppearenceObserver(){
  const targets = document.querySelectorAll('.appearence');
  if (!targets || targets.length === 0) return;

  const appearObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
        entry.target.classList.add('in-view');
      } else {
        entry.target.classList.remove('in-view');
      }
    });
  }, { threshold: [0.3] });

  targets.forEach(t => appearObs.observe(t));
})();

document.querySelector(".News").addEventListener("click", function () {
  const sidebar2 = document.querySelector(".sidebar2");
  const textside = document.querySelector(".text-side");
  const RealSidebar2 = document.querySelector(".real-sidebar2");
  sidebar2.style.display = "flex";
  textside.style.display = "flex";
  RealSidebar2.style.display = "none";
});

document.querySelector(".hide").addEventListener("click", function () {
  const sidebar2 = document.querySelector(".sidebar2");
  const textside = document.querySelector(".text-side");
  const RealSidebar2 = document.querySelector(".real-sidebar2");
  RealSidebar2.style.display = "flex";
  sidebar2.style.display = "none";
  textside.style.display = "none";

});

function showTime(){
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const ampm = hours >= 12 ? "PM" : "AM";
  let displayHour = hours % 24;

  const hourEl = document.getElementById("hour");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");
  const ampmEl = document.getElementById("ampm");

  if (displayHour === 24) displayHour = "00";
  if (hourEl) hourEl.innerText = displayHour.toString().padStart(2, "0");
  if (minutesEl) minutesEl.innerText = minutes.toString().padStart(2, "0");
  if (secondsEl) secondsEl.innerText = seconds.toString().padStart(2, "0");
  if (ampmEl) {
    if (hours >= 6 && hours < 19) {
  ampmEl.innerHTML = '<i class="fa-solid fa-sun"></i>';
} else {

    ampmEl.innerHTML = '<i class="fa-solid fa-moon moon__color"></i>';
}
  }
}

setInterval(showTime, 1000);
showTime();

(function weatherZone() {
  var API_KEY = 'a972a60b0971a99fcba59731943dcda6';
  var input      = document.getElementById('wzInput');
  var btn        = document.getElementById('wz__searchBtn');
  var notFound   = document.querySelector('.wz__not__found');
  var wzMain     = document.getElementById('wzMain');
  var wzForecast = document.getElementById('wzForecast');
  var wzSuggEl   = document.getElementById('wzSuggestions');
  var CITY_LIST = [
    'Madrid','Barcelona','Valencia','Seville','Bilbao','Granada',
    'Salamanca','Santiago de Compostela','Málaga','Zaragoza',
    'San Sebastián','Alicante','Murcia','Palma','Las Palmas',
    'Córdoba','Valladolid','Vigo','Gijón','Tarragona','Burgos',
    'Toledo','Segovia','Cádiz','Almería','Huelva','Mérida','Logroño'
  ];

  function normW(s) { return String(s || '').trim().toLowerCase(); }

  function hideWzSugg() {
    if (wzSuggEl) {
      wzSuggEl.innerHTML = '';
      wzSuggEl.classList.remove('wz__sugg--active');
    }
  }

  function renderWzSugg(query) {
    if (!wzSuggEl) return;
    var q = normW(query);
    if (q.length < 2) { hideWzSugg(); return; }
    var matches = CITY_LIST.filter(function(c) { return normW(c).includes(q); }).slice(0, 6);
    if (!matches.length) { hideWzSugg(); return; }
    wzSuggEl.innerHTML = matches.map(function(c) {
      return '<div class="wz__suggestion__item" data-city="' + c + '">'
        + c + '<span class="wz__sugg__country">Spain</span></div>';
    }).join('');
    wzSuggEl.classList.add('wz__sugg--active');
    wzSuggEl.querySelectorAll('.wz__suggestion__item').forEach(function(item) {
      item.addEventListener('click', function() {
        if (input) input.value = item.getAttribute('data-city');
        hideWzSugg();
        doSearch();
      });
    });
  }

  function resetWeather() {
    var wzSky = document.getElementById('wzSky');
    var wzPlaceholder = document.getElementById('wzPlaceholder');
    if (wzSky) {
      wzSky.classList.remove('wz__sky--loaded');
      wzSky.style.backgroundImage = '';
      wzSky.style.backgroundSize = '';
      wzSky.style.backgroundPosition = '';
    }
    if (wzPlaceholder) wzPlaceholder.style.display = '';
    if (wzMain) wzMain.style.display = 'none';
    if (notFound) notFound.style.display = 'none';
    wzForecast.innerHTML = '';
  }

  if (input) {
    input.addEventListener('input', function() {
      renderWzSugg(this.value);
      if (!this.value.trim()) resetWeather();
    });
    input.addEventListener('blur', function() { setTimeout(hideWzSugg, 160); });
  }

  var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var ICONS = {
    Clear: '☀️', Clouds: '⛅', Rain: '🌧️',
    Drizzle: '🌦️', Snow: '❄️', Thunderstorm: '⛈️',
    Mist: '🌫️', Haze: '🌫️', Fog: '🌫️'
  };
  function icon(main) { return ICONS[main] || '🌤️'; }

  var BG_MAP = {
    Clear: 'sunny.jpeg', Clouds: 'cloudy.jpeg',
    Rain: 'Rainy.jpeg', Drizzle: 'Rainy.jpeg',
    Thunderstorm: 'Rainy.jpeg', Snow: 'snow.jpeg',
    Mist: 'cloudy.jpeg', Haze: 'cloudy.jpeg', Fog: 'cloudy.jpeg'
  };
  function setBg(main) {
    var wzSky = document.getElementById('wzSky');
    if (!wzSky) return;
    wzSky.style.backgroundImage = 'url(' + (BG_MAP[main] || 'Paris.avif') + ')';
    wzSky.style.backgroundSize = 'cover';
    wzSky.style.backgroundPosition = 'center';
  }

  function renderCurrent(d) {
    document.getElementById('wzCityName').textContent  = d.city;
    document.getElementById('wzTemp').innerHTML        = Math.round(d.temp) + '<span>°C</span>';
    document.getElementById('wzDesc').textContent      = d.desc;
    document.getElementById('wzHumidity').textContent  = d.humidity + '%';
    document.getElementById('wzWind').textContent      = Math.round(d.wind) + ' km/h';
    document.getElementById('wzIcon').textContent      = icon(d.main);
  }

  function renderForecast(days, cityName) {
    wzForecast.innerHTML = days.map(function(d, i) {
      return '<div class="wz__day' + (i === 0 ? ' wz__day--active' : '') + '" data-idx="' + i + '">'
        + '<span class="wz__day__name">' + (i === 0 ? 'Today' : d.dayName) + '</span>'
        + '<span class="wz__day__icon">' + icon(d.main) + '</span>'
        + '<span class="wz__day__temp">' + Math.round(d.temp) + '°</span>'
        + '</div>';
    }).join('');

    wzForecast.querySelectorAll('.wz__day').forEach(function(el) {
      el.addEventListener('click', function() {
        wzForecast.querySelectorAll('.wz__day').forEach(function(x) { x.classList.remove('wz__day--active'); });
        el.classList.add('wz__day--active');
        var d = days[parseInt(el.dataset.idx)];
        d.city = cityName;
        renderCurrent(d);
        setBg(d.main);
      });
    });

    days[0].city = cityName;
    renderCurrent(days[0]);
    if (notFound) notFound.style.display = 'none';
    var wzPlaceholder = document.getElementById('wzPlaceholder');
    if (wzPlaceholder) wzPlaceholder.style.display = 'none';
    var wzSky = document.getElementById('wzSky');
    if (wzSky) wzSky.classList.add('wz__sky--loaded');
    setBg(days[0].main);
    if (wzMain) wzMain.style.display = 'flex';
  }

  function doSearch() {
    var city = input ? input.value.trim() : '';
    if (!city) return;
    hideWzSugg();
    if (notFound) notFound.style.display = 'none';
    if (wzMain)   wzMain.style.display   = 'none';

    fetch('https://api.openweathermap.org/data/2.5/forecast?q='
      + encodeURIComponent(city) + '&units=metric&appid=' + API_KEY)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (String(json.cod) !== '200') {
          if (notFound) notFound.style.display = 'flex';
          return;
        }
        var seen = {}, days = [];
        json.list.forEach(function(item) {
          var date = new Date(item.dt * 1000);
          var key  = date.toDateString();
          if (!seen[key] && days.length < 7) {
            seen[key] = true;
            days.push({
              dayName:  DAY_NAMES[date.getDay()],
              temp:     item.main.temp,
              desc:     item.weather[0].description,
              main:     item.weather[0].main,
              humidity: item.main.humidity,
              wind:     item.wind.speed
            });
          }
        });
        renderForecast(days, json.city.name);
      })
      .catch(function() { if (notFound) notFound.style.display = 'flex'; });
  }

  if (btn)   btn.addEventListener('click', doSearch);
  if (input) input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { hideWzSugg(); doSearch(); }
  });
})();

document.querySelectorAll('.Theory__left__boxes .box__top i').forEach(icon => {
  icon.addEventListener('click', function () {
    const card = icon.closest('.Theory__left__boxes');
    if (!card) return;
    card.classList.toggle('expanded');
  });
});

const toggleParagraph = document.getElementById('pressMe');
const paragraph = document.querySelector('.Theory__right__content');

toggleParagraph.addEventListener('click', function () {
  console.log('Clicked');
  paragraph.classList.toggle('hidden');
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry ) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('show');
    } else {
      entry.target.classList.remove('show');
    }
  });
}, { root: null, rootMargin: '-90px 0px -10% 0px', threshold: 0.12 });

const TheoryBoxes = document.querySelectorAll('.Theory__container');
if (TheoryBoxes && TheoryBoxes.length) {
  TheoryBoxes.forEach(el => observer.observe(el));
} else {
  console.warn('No .Theory__container elements found to observe');
}

const quotes = document.querySelectorAll('.quote');
if (quotes && quotes.length) {
  quotes.forEach(el => observer.observe(el));
} else {
  console.warn('No .quote elements found to observe');
}

const factObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('fact--visible');
    } else {
      entry.target.classList.remove('fact--visible');
    }
  });
}, { root: null, rootMargin: '-60px 0px -8% 0px', threshold: 0.18 });

document.querySelectorAll('.fact__strip--reveal').forEach(el => factObserver.observe(el));

const weatherPages = document.querySelectorAll('.weather__page');
if (weatherPages && weatherPages.length) {
  weatherPages.forEach(el => observer.observe(el));
} else {
  console.warn('No .weather__page elements found to observe');
}

const filterPages = document.querySelectorAll('.filter__page');
if (filterPages && filterPages.length) {
  filterPages.forEach(el => observer.observe(el));
} else {
  console.warn('No .filter__page elements found to observe');
}

;(function injectFilterScrollCSS(){
  if (document.getElementById('filter-scroll-style')) return;
  const css = `
    .filter__page {
      opacity: 0;
      transform: translateY(28px);
      transition: opacity 0.6s cubic-bezier(.22,.9,.34,1), transform 0.6s cubic-bezier(.22,.9,.34,1);
      will-change: transform, opacity;
    }
    .filter__page.show {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.id = 'filter-scroll-style';
  styleEl.appendChild(document.createTextNode(css));
  document.head.appendChild(styleEl);
})();

(function examplePageSearch() {
  const DESC_URL = './Universities.json';
  let universities = [];
  var pendingOpen = null;

  fetch(DESC_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      universities = data;
      if (pendingOpen) {
        var u = universities.find(function (x) { return norm(x.name) === norm(pendingOpen); });
        if (u) { if (epInput) epInput.value = u.name; showResult(u); }
        pendingOpen = null;
      }
    })
    .catch(function (err) { console.error('Failed to load universities_descriptions.json:', err); });

  var epInput        = document.getElementById('epInput');
  var epSuggestions  = document.getElementById('epSuggestions');
  var epSuggItems    = document.getElementById('epSuggestionItems');
  var epSearchBtn    = document.getElementById('epSearchBtn');
  var epRight2       = document.getElementById('epRight2');
  var epResult       = document.getElementById('epResult');
  var epBackBtn      = document.getElementById('epBackBtn');

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  function getSuggestions(query) {
    var q = norm(query);
    if (q.length < 2) return [];
    var starts = [], contains = [];
    for (var i = 0; i < universities.length; i++) {
      var name = norm(universities[i].name);
      if (name.startsWith(q)) starts.push(universities[i]);
      else if (name.includes(q)) contains.push(universities[i]);
    }
    return starts.concat(contains).slice(0, 7);
  }

  function hideSuggBox() {
    if (epSuggItems)   epSuggItems.innerHTML = '';
    if (epSuggestions) epSuggestions.classList.remove('ep__suggestions--active');
  }

  function renderSuggestions(query) {
    if (!epSuggItems) return;
    var items = getSuggestions(query);
    if (!items.length) { hideSuggBox(); return; }
    if (epSuggestions) epSuggestions.classList.add('ep__suggestions--active');
    epSuggItems.innerHTML = items.map(function (u) {
      return '<div class="ep__suggestion__item" data-id="' + u.id + '">'
        + u.name
        + '<span class="ep__sugg__city">' + u.city + '</span>'
        + '</div>';
    }).join('');
  }

  function showResult(u) {
    if (!u) return;
    hideSuggBox();

    var badgeEl = document.getElementById('epBadge');
    var abbrEl  = document.getElementById('epAbbr');
    if (badgeEl && u.color) {
      badgeEl.style.background   = 'linear-gradient(135deg, ' + u.color + 'cc, ' + u.color + '55)';
      badgeEl.style.borderColor  = u.color + '99';
      badgeEl.style.boxShadow    = '0 8px 28px ' + u.color + '55';
    }
    if (abbrEl) abbrEl.textContent = u.abbr || u.name.slice(0, 3).toUpperCase();

    document.getElementById('epName').textContent     = u.name;
    document.getElementById('epCityType').textContent = u.city + ' · ' + u.type;
    document.getElementById('epFounded').textContent  = u.founded;
    document.getElementById('epStudents').textContent = u.students;
    document.getElementById('epType').textContent     = u.type;
    document.getElementById('epDesc').textContent     = u.description;

    var tagsEl = document.getElementById('epTags');
    if (tagsEl) {
      tagsEl.innerHTML = (u.faculties || []).map(function (f) {
        return '<span class="ep__tag">' + f + '</span>';
      }).join('');
    }

    if (epRight2) epRight2.classList.add('ep--shown');
    if (epResult) epResult.style.display = 'flex';
  }

  if (epInput) {
    epInput.addEventListener('input', function () { renderSuggestions(this.value); });
    epInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var items = getSuggestions(this.value);
      if (items.length) { this.value = items[0].name; showResult(items[0]); return; }
      var exact = universities.find(function (u) { return norm(u.name) === norm(epInput.value); });
      if (exact) showResult(exact);
    });
  }

  if (epSuggestions) {
    epSuggestions.addEventListener('click', function (e) {
      var item = e.target.closest('.ep__suggestion__item');
      if (!item) return;
      var id = item.getAttribute('data-id');
      var u  = universities.find(function (x) { return x.id === id; });
      if (u) { if (epInput) epInput.value = u.name; showResult(u); }
    });
  }

  if (epSearchBtn) {
    epSearchBtn.addEventListener('click', function () {
      var items = getSuggestions(epInput ? epInput.value : '');
      if (items.length) { if (epInput) epInput.value = items[0].name; showResult(items[0]); }
    });
  }

  if (epBackBtn) {
    epBackBtn.addEventListener('click', function () {
      if (epResult) epResult.style.display = 'none';
      if (epRight2) epRight2.classList.remove('ep--shown');
      if (epInput) epInput.value = '';
      hideSuggBox();
    });
  }

  document.addEventListener('uniscout:open', function (e) {
    var name = e.detail && e.detail.name;
    if (!name) return;
    if (epInput) epInput.value = name;
    if (universities.length) {
      var u = universities.find(function (x) { return norm(x.name) === norm(name); });
      if (u) { showResult(u); return; }
    }
    pendingOpen = name;
  });
})();

(function cityPageSearch() {
  var CITIES_URL = './cities_spain.json';
  var cities = [];
  var currentCity = null;

  var CITY_EXTENDED = {
    'madrid':        { unis: '15+ universities incl. Complutense, Autónoma & IE Business',        lang: 'Spanish · Euro (€)', support: 'Erasmus+, MAEC-AECID, Comunidad de Madrid grants' },
    'barcelona':     { unis: '12+ universities incl. UB, UAB, UPC & ESADE',                       lang: 'Catalan & Spanish · Euro (€)', support: 'Erasmus+, Generalitat de Catalunya, MOBINT' },
    'valencia':      { unis: '5 universities incl. Universitat de València & UPV',                lang: 'Valencian & Spanish · Euro (€)', support: 'Erasmus+, GVA grants, UPV scholarships' },
    'seville':       { unis: 'University of Seville & Pablo de Olavide University',               lang: 'Spanish · Euro (€)', support: 'Erasmus+, Junta de Andalucía, MAEC grants' },
    'bilbao':        { unis: 'UPV/EHU (Basque) & University of Deusto',                           lang: 'Basque & Spanish · Euro (€)', support: 'Erasmus+, Basque Government grants' },
    'granada':       { unis: 'University of Granada — one of Spain\'s largest',                   lang: 'Spanish · Euro (€)', support: 'Erasmus+, Junta de Andalucía, UGR mobility' },
    'salamanca':     { unis: 'University of Salamanca (est. 1218) — oldest in Spain',             lang: 'Spanish · Euro (€)', support: 'Erasmus+, USAL grants, Castile & León fund' },
    'santiago':      { unis: 'University of Santiago de Compostela (USC)',                        lang: 'Galician & Spanish · Euro (€)', support: 'Erasmus+, Xunta de Galicia, USC mobility' },
    'malaga':        { unis: 'University of Málaga (UMA)',                                        lang: 'Spanish · Euro (€)', support: 'Erasmus+, Junta de Andalucía, UMA grants' },
    'zaragoza':      { unis: 'University of Zaragoza (UNIZAR)',                                   lang: 'Spanish · Euro (€)', support: 'Erasmus+, Aragón Government, UNIZAR mobility' },
    'san-sebastian': { unis: 'UPV/EHU, Basque Culinary Center & Mondragon University',           lang: 'Basque & Spanish · Euro (€)', support: 'Erasmus+, Basque Government grants' },
    'alicante':      { unis: 'University of Alicante (UA)',                                       lang: 'Valencian & Spanish · Euro (€)', support: 'Erasmus+, GVA grants, UA scholarships' }
  };

  function populateCcBody(c) {
    var ext = CITY_EXTENDED[c.id] || {
      unis: 'Several universities and research centres',
      lang: 'Spanish · Euro (€)',
      support: 'Erasmus+ and national/regional grants available'
    };
    var topPlaces = (c.highlights || []).join(' · ');
    var ccBody = document.querySelector('.cc__body');
    if (ccBody) {
      ccBody.innerHTML = [
        { icon: '🏠', title: 'Average Living Cost',   text: (c.monthly_cost || '—') + ' / month' },
        { icon: '🌡', title: 'Climate',               text: c.climate || '—' },
        { icon: '👥', title: 'Population',            text: c.population || '—' },
        { icon: '🏫', title: 'Universities',          text: ext.unis },
        { icon: '📍', title: 'Must-See Spots',        text: topPlaces || '—' },
        { icon: '🗣', title: 'Language & Currency',   text: ext.lang },
        { icon: '🎓', title: 'Scholarships & Support',text: ext.support }
      ].map(function(s) {
        return '<div class="cc__section"><span class="cc__section__icon">' + s.icon + '</span>'
          + '<div><h4>' + s.title + '</h4><p>' + s.text + '</p></div></div>';
      }).join('');
    }
    var ccCityName = document.querySelector('.cc__city__name');
    if (ccCityName) ccCityName.textContent = c.name + ', Spain';
  }

  fetch(CITIES_URL)
    .then(function(r) { return r.json(); })
    .then(function(data) { cities = data; })
    .catch(function(err) { console.error('Failed to load cities_spain.json:', err); });

  var wpInput      = document.getElementById('wpInput');
  var wpSearchBtn  = document.getElementById('wpSearchBtn');
  var wpSuggestions = document.getElementById('wpSuggestions');
  var wpSuggItems  = document.getElementById('wpSuggestionItems');
  var wpCityPanel  = document.getElementById('wpCityPanel');
  var wpBackBtn    = document.getElementById('wpBackBtn');
  var wpMoreBtn    = document.getElementById('wpMoreBtn');

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  function getSuggestions(query) {
    var q = norm(query);
    if (q.length < 2) return [];
    var starts = [], contains = [];
    cities.forEach(function(c) {
      var n = norm(c.name);
      if (n.startsWith(q)) starts.push(c);
      else if (n.includes(q)) contains.push(c);
    });
    return starts.concat(contains).slice(0, 6);
  }

  var wpIdleHint = document.getElementById('wpIdleHint');

  function hideSuggBox() {
    if (wpSuggItems) wpSuggItems.innerHTML = '';
    if (wpSuggestions) wpSuggestions.classList.remove('wp__suggestions--active');
    if (wpIdleHint) wpIdleHint.style.display = '';
  }

  function renderSuggestions(query) {
    if (!wpSuggItems) return;
    var items = getSuggestions(query);
    if (!items.length) { hideSuggBox(); return; }
    if (wpSuggestions) wpSuggestions.classList.add('wp__suggestions--active');
    if (wpIdleHint) wpIdleHint.style.display = 'none';
    wpSuggItems.innerHTML = items.map(function(c) {
      return '<div class="wp__suggestion__item" data-id="' + c.id + '">'
        + c.name
        + '<span class="wp__sugg__region">' + c.region + '</span>'
        + '</div>';
    }).join('');
  }

  function showCity(c) {
    if (!c) return;
    hideSuggBox();
    var badge = document.getElementById('wpCityBadge');
    if (badge && c.color) {
      badge.style.background = 'linear-gradient(135deg, ' + c.color + 'cc, ' + c.color + '55)';
      badge.style.borderColor = c.color + '99';
      badge.style.boxShadow = '0 6px 20px ' + c.color + '44';
    }
    document.getElementById('wpCityAbbr').textContent    = c.abbr;
    document.getElementById('wpCityName').textContent    = c.name;
    document.getElementById('wpCityRegion').textContent  = c.region;
    document.getElementById('wpCityPop').textContent     = c.population;
    document.getElementById('wpCityClimate').textContent = c.climate;
    document.getElementById('wpCityCost').textContent    = c.monthly_cost;
    document.getElementById('wpCityDesc').textContent    = c.description;
    var tagsEl = document.getElementById('wpCityTags');
    if (tagsEl) {
      tagsEl.innerHTML = (c.highlights || []).map(function(h) {
        return '<span class="wp__city__tag">' + h + '</span>';
      }).join('');
    }
    currentCity = c;
    if (wpCityPanel) wpCityPanel.classList.add('wp--shown');
  }

  if (wpInput) {
    wpInput.addEventListener('input', function() { renderSuggestions(this.value); });
    wpInput.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var items = getSuggestions(this.value);
      if (items.length) { this.value = items[0].name; showCity(items[0]); }
    });
  }

  if (wpSuggestions) {
    wpSuggestions.addEventListener('click', function(e) {
      var item = e.target.closest('.wp__suggestion__item');
      if (!item) return;
      var c = cities.find(function(x) { return x.id === item.getAttribute('data-id'); });
      if (c) { if (wpInput) wpInput.value = c.name; showCity(c); }
    });
  }

  if (wpSearchBtn) {
    wpSearchBtn.addEventListener('click', function() {
      var items = getSuggestions(wpInput ? wpInput.value : '');
      if (items.length) { if (wpInput) wpInput.value = items[0].name; showCity(items[0]); }
    });
  }

  if (wpBackBtn) {
    wpBackBtn.addEventListener('click', function() {
      if (wpCityPanel) wpCityPanel.classList.remove('wp--shown');
      if (wpInput) wpInput.value = '';
      hideSuggBox();
    });
  }

  if (wpMoreBtn) {
    wpMoreBtn.addEventListener('click', function() {
      if (currentCity) populateCcBody(currentCity);
      if (typeof showCountryPanel === 'function') showCountryPanel();
    });
  }

  document.querySelectorAll('.wp__feat__card').forEach(function(card) {
    card.addEventListener('click', function() {
      var name = card.getAttribute('data-city');
      var c = cities.find(function(x) { return x.name.toLowerCase() === name.toLowerCase(); });
      if (c) { if (wpInput) wpInput.value = c.name; showCity(c); }
    });
  });
})();

const spaceText = document.querySelector(".space__for__weather__container");
const CountryContainer = document.querySelector(".country__container");
const CloseCountry = document.querySelector(".close__country");
const ccBackdrop = document.getElementById('ccBackdrop');

const placesBtn = null;
const placesInput = null;

function showCountryPanel() {
  if (CountryContainer) CountryContainer.classList.add('show10');
  if (ccBackdrop) ccBackdrop.classList.add('show10');
}

function hideCountryPanel() {
  if (CountryContainer) CountryContainer.classList.remove('show10');
  if (ccBackdrop) ccBackdrop.classList.remove('show10');
}

if (CloseCountry) CloseCountry.addEventListener('click', hideCountryPanel);
if (ccBackdrop)   ccBackdrop.addEventListener('click', hideCountryPanel);

if (placesInput) {
  placesInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      showCountryPanel();
    }
  });
}

const containerExplanation = document.querySelector('.container__explanation');
const explanationCloseBtn = document.querySelector('.explanation__button');
const dickBlock = document.querySelector('.dick');

function showExplanation() {
  if (containerExplanation) {

    containerExplanation.style.display = 'flex';
    containerExplanation.style.transform = 'translate(-52px, 100px)';
    containerExplanation.style.zIndex = '60';
  }
  if (dickBlock) {
    dickBlock.style.display = 'none';
  }
}

function hideExplanation() {
  if (containerExplanation) {
    containerExplanation.style.display = '';
    containerExplanation.style.transform = '';
    containerExplanation.style.zIndex = '';
  }
  if (dickBlock) {
    dickBlock.style.display = 'block';
  }
}

const countryHeadings = document.querySelectorAll('.country__main__text h3');
if (countryHeadings && countryHeadings.length) {
  countryHeadings.forEach(h3 => {
    h3.style.cursor = 'pointer';
    h3.addEventListener('click', function (e) {

      showExplanation();
    });
  });
} else {

}

if (explanationCloseBtn) {
  explanationCloseBtn.addEventListener('click', function () {
    hideExplanation();
  });
}

(function filterPage() {
  const SPAIN_URL = './universities_spain.json';
  let universities = [];

  const selected = { city: '', faculty: '', degree: '', language: '', exam: '', type: '' };

  fetch(SPAIN_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      universities = data;

      var cities = [...new Set(data.map(function (u) { return u.city; }))].sort();
      var cityInput = document.getElementById('cityFilterInput');
      if (cityInput) cityInput._cities = cities;
    })
    .catch(function (err) { console.error('Failed to load universities_spain.json:', err); });

  var selectors = document.querySelectorAll('.filter__selector');
  var panels    = document.querySelectorAll('.filter__option__panel');

  selectors.forEach(function (sel) {
    sel.addEventListener('click', function () {
      var panelId  = this.getAttribute('data-panel');
      var isActive = this.classList.contains('fp-active');

      selectors.forEach(function (s) { s.classList.remove('fp-active'); });
      panels.forEach(function (p)    { p.classList.remove('fp-panel-active'); });

      if (!isActive) {
        this.classList.add('fp-active');
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('fp-panel-active');
      }
    });
  });

  document.querySelectorAll('.fp__chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var filter = this.getAttribute('data-filter');
      var value  = this.getAttribute('data-value');

      document.querySelectorAll('.fp__chip[data-filter="' + filter + '"]').forEach(function (c) {
        c.classList.remove('fp-selected');
      });

      this.classList.add('fp-selected');
      selected[filter] = value;

      var valueEl = document.getElementById('fv-' + filter);
      if (valueEl) {

        var display = value.length > 14 ? value.slice(0, 13) + '…' : value;
        valueEl.textContent = display;
        valueEl.classList.add('fp-has-value');
      }
      var selectorEl = document.getElementById('fs-' + filter);
      if (selectorEl) selectorEl.classList.add('fp-chosen');
    });
  });

  var cityInput        = document.getElementById('cityFilterInput');
  var citySuggestions  = document.getElementById('citySuggestions');
  var cityConfirmBtn   = document.getElementById('cityConfirmBtn');

  function setCity(city) {
    selected.city = city;
    if (cityInput) cityInput.value = city;
    if (citySuggestions) citySuggestions.innerHTML = '';
    var valueEl = document.getElementById('fv-city');
    if (valueEl) {
      valueEl.textContent = city;
      valueEl.classList.add('fp-has-value');
    }
    var selectorEl = document.getElementById('fs-city');
    if (selectorEl) selectorEl.classList.add('fp-chosen');
  }

  if (cityInput) {
    cityInput.addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      if (!q || !this._cities || !citySuggestions) return (citySuggestions.innerHTML = '');
      var matches = this._cities.filter(function (c) { return c.toLowerCase().includes(q); });
      if (!matches.length) return (citySuggestions.innerHTML = '');
      citySuggestions.innerHTML = matches
        .map(function (c) { return '<div class="fp__city__suggestion" data-city="' + c + '">' + c + '</div>'; })
        .join('');
    });
  }

  if (citySuggestions) {
    citySuggestions.addEventListener('click', function (e) {
      var sugg = e.target.closest('.fp__city__suggestion');
      if (!sugg) return;
      setCity(sugg.getAttribute('data-city'));
    });
  }

  if (cityConfirmBtn) {
    cityConfirmBtn.addEventListener('click', function () {
      var city = cityInput ? cityInput.value.trim() : '';
      if (city) setCity(city);
    });
  }

  if (cityInput) {
    cityInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var city = this.value.trim();
        if (city) setCity(city);
      }
    });
  }

  var resultNameEl  = document.getElementById('resultName');
  if (resultNameEl) {
    resultNameEl.addEventListener('click', function () {
      var name = this.textContent;
      if (!name) return;
      var exPage = document.querySelector('.example__page');
      if (exPage) exPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.dispatchEvent(new CustomEvent('uniscout:open', { detail: { name: name } }));
    });
  }

  var searchBtn     = document.getElementById('searchUniversityBtn');
  var resultMetaEl  = document.getElementById('resultMeta');
  var resultBadgeEl = document.getElementById('resultBadge');
  var resultAbbrEl  = document.getElementById('resultAbbr');
  var resultPromptEl= document.getElementById('resultPrompt');

  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      if (!universities.length) {
        alert('University data is still loading. Please try again in a moment.');
        return;
      }

      var scored = universities.map(function (u) {
        var score = 0;

        if (selected.city) {
          if (u.city.toLowerCase().includes(selected.city.toLowerCase())) score += 4;
          else score -= 3;
        }
        if (selected.faculty && u.faculties) {
          if (u.faculties.includes(selected.faculty)) score += 3;
        }
        if (selected.degree && u.degree_levels) {
          if (u.degree_levels.includes(selected.degree)) score += 2;
        }
        if (selected.language && u.languages) {
          if (u.languages.includes(selected.language)) score += 2;
        }
        if (selected.exam && u.required_exams) {
          if (u.required_exams.includes(selected.exam)) score += 1;
        }
        if (selected.type) {
          if (u.type === selected.type) score += 2;
        }

        return { u: u, score: score };
      });

      scored.sort(function (a, b) { return b.score - a.score; });

      var best = scored[0].u;

      if (resultBadgeEl) {
        resultBadgeEl.style.background = best.color
          ? 'linear-gradient(135deg, ' + best.color + 'cc, ' + best.color + '66)'
          : 'rgba(255,165,0,0.2)';
        resultBadgeEl.style.border = '2px solid ' + (best.color || 'orange') + '88';
        resultBadgeEl.style.boxShadow = '0 10px 32px ' + (best.color || '#ffa500') + '55';
      }
      if (resultAbbrEl)   resultAbbrEl.textContent  = best.abbr || best.name.slice(0, 3).toUpperCase();
      if (resultPromptEl) resultPromptEl.textContent = 'University you are looking for is';
      if (resultNameEl)   resultNameEl.textContent   = best.name;
      if (resultMetaEl)   resultMetaEl.textContent   = best.city + ' · ' + best.type + ' · ' + (best.languages || []).join(' / ');

      var resultEl = document.getElementById('filterResult');
      if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
})();


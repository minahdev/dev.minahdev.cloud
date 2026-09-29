---
---
// 셸의 세 가지 동작. 전문 검색 색인은 두지 않는다 —
// 글이 적은 동안은 좌측 색인을 제목으로 좁히는 것만으로 충분하다.
// 수십 편으로 늘면 그때 lunr 색인을 붙인다.
(function () {
  'use strict';

  // 1. 좌측 색인 좁히기
  var q = document.getElementById('q');
  var nav = document.querySelector('.side__nav');
  if (q && nav) {
    var items = Array.prototype.slice.call(nav.querySelectorAll('.side__item'));
    var groups = Array.prototype.slice.call(nav.querySelectorAll('.side__group'));
    var empty = nav.querySelector('.side__empty');

    var filter = function () {
      var v = q.value.trim().toLowerCase();
      var hit = 0;
      items.forEach(function (a) {
        var t = (a.dataset.t || '') + ' ' + (a.querySelector('.side__num') || {}).textContent;
        var ok = !v || t.toLowerCase().indexOf(v) !== -1;
        a.hidden = !ok;
        if (ok) hit++;
      });
      // 항목이 하나도 안 남은 그룹의 제목은 숨긴다
      groups.forEach(function (g) {
        var shown = false;
        var n = g.nextElementSibling;
        while (n && !n.classList.contains('side__group')) {
          if (n.classList.contains('side__item') && !n.hidden) { shown = true; break; }
          n = n.nextElementSibling;
        }
        g.hidden = !shown;
      });
      if (empty) empty.hidden = hit !== 0;
    };

    q.addEventListener('input', filter);
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { q.value = ''; filter(); q.blur(); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        q.focus();
        q.select();
      }
    });
  }

  // 2. 좁은 화면의 색인 서랍
  var btn = document.querySelector('.top__drawer');
  var side = document.getElementById('sidebar');
  if (btn && side) {
    var setOpen = function (on) {
      side.classList.toggle('is-open', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? '글 색인 닫기' : '글 색인 열기');
    };
    btn.addEventListener('click', function () {
      setOpen(!side.classList.contains('is-open'));
    });
    side.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && side.classList.contains('is-open')) { setOpen(false); btn.focus(); }
    });
  }

  // 3. 「이 페이지 안에서」 — 본문의 h2 를 읽어 만든다.
  //    페이지마다 절 제목 마크업이 조금씩 달라 텍스트만 뽑고, 번호 span 은 분리해 둔다.
  var main = document.getElementById('main');
  var box = document.querySelector('.onpage');
  var list = document.querySelector('.onpage__nav');
  if (!main || !box || !list) return;

  // 글 목록과 현관 카드 안의 h2 는 절 제목이 아니라 글·프로젝트 이름이다.
  // 여기 넣으면 화면에 있는 것을 오른쪽에 한 번 더 적는 꼴이 된다.
  var heads = Array.prototype.slice.call(main.querySelectorAll('h2')).filter(function (h) {
    return !h.closest('.feed') && !h.closest('.hubcard');
  });
  if (heads.length < 2) return;

  var links = [];
  heads.forEach(function (h, i) {
    if (!h.id) h.id = 'sec-' + (i + 1);
    var text = (h.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = text;
    list.appendChild(a);
    links.push({ a: a, h: h });
  });
  if (!links.length) return;
  box.classList.add('has-items');

  // 지금 읽는 절 표시
  var mark = function (h) {
    links.forEach(function (l) { l.a.classList.toggle('is-here', l.h === h); });
  };
  if ('IntersectionObserver' in window) {
    var seen = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = seen.indexOf(en.target);
        if (en.isIntersecting && i === -1) seen.push(en.target);
        if (!en.isIntersecting && i !== -1) seen.splice(i, 1);
      });
      if (!seen.length) return;
      seen.sort(function (a, b) { return a.offsetTop - b.offsetTop; });
      mark(seen[0]);
    }, { rootMargin: '-64px 0px -70% 0px' });
    links.forEach(function (l) { io.observe(l.h); });
  }
})();

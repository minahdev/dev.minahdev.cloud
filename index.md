---
layout: default
title: 개발 로그
---

<div class="lede">
  <h1>민아의 개발 로그</h1>
  <p>{{ site.description }}</p>
</div>

<section class="hub">
  <p class="hub__k">진행 중인 프로젝트</p>

  {% for p in site.projects %}
  {% assign posts = site.posts | where: "project", p.name %}
  <a class="hubcard" href="{{ p.log | relative_url }}">
    <div class="hubcard__top">
      <h2>{{ p.name }}</h2>
      <span class="hubcard__blurb">{{ p.blurb }}{% if p.period %} &middot; {{ p.period }}{% endif %}</span>
      <span class="hubcard__n">글 {{ posts.size }}편</span>
    </div>
    <p class="hubcard__desc">{{ p.desc }}</p>
    {% if posts.size > 0 %}
    <ul class="hubcard__recent">
      {% for post in posts limit: 3 %}
      <li><span>{{ post.date | date: "%m. %d." }}</span>{{ post.title }}</li>
      {% endfor %}
    </ul>
    {% endif %}
    <span class="hubcard__go">개발 로그 보기 &rarr;</span>
  </a>
  {% endfor %}
</section>

<section class="hub hub__links">
  <p class="hub__k">그 밖</p>
  <ul>
    {% for p in site.projects %}
    {% if p.url %}<li><a href="{{ p.url }}">{{ p.name }} 서비스</a> <span>{{ p.url | remove: "https://" }}</span></li>{% endif %}
    {% if p.report %}<li><a href="{{ p.report }}">{{ p.name }} 개발 보고서</a> <span>12장 · {{ p.report | remove: "https://" }}</span></li>{% endif %}
    {% endfor %}
    <li><a href="{{ '/tags/' | relative_url }}">태그로 보기</a> <span>프로젝트 구분 없이 갈래로</span></li>
    <li><a href="https://github.com/minahdev">GitHub</a> <span>github.com/minahdev</span></li>
  </ul>
</section>

---
layout: default
title: 태그
permalink: /tags/
---

<div class="lede">
  <h1>태그</h1>
  <p>프로젝트와 갈래로 글을 모았다.</p>
</div>

{% if site.projects.size > 0 %}
<section class="taggroup">
  <h2>프로젝트</h2>
  <div class="tagcloud">
  {% for p in site.projects %}
    {% assign n = site.posts | where: "project", p.name | size %}
    <a class="tag tag--big tag--proj" href="#{{ p.name }}">{{ p.name }} <span>{{ n }}</span></a>
  {% endfor %}
  </div>
</section>

{% for p in site.projects %}
{% assign posts = site.posts | where: "project", p.name %}
<section class="taggroup" id="{{ p.name }}">
  <h2>{{ p.name }} <span>{{ posts.size }}편 · {{ p.blurb }}</span></h2>
  <ol class="feed feed--tight">
  {% for post in posts %}
    <li class="feed__item">
      <time class="feed__date" datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y. %m. %d." }}</time>
      <div class="feed__body"><h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3></div>
    </li>
  {% endfor %}
  </ol>
</section>
{% endfor %}
{% endif %}

{% assign tags = site.tags | sort %}

<section class="taggroup">
  <h2>갈래</h2>
  <div class="tagcloud">
  {% for t in tags %}
    <a class="tag tag--big" href="#{{ t[0] }}">{{ t[0] }} <span>{{ t[1].size }}</span></a>
  {% endfor %}
  </div>
</section>

{% for t in tags %}
<section class="taggroup" id="{{ t[0] }}">
  <h2>{{ t[0] }} <span>{{ t[1].size }}편</span></h2>
  <ol class="feed feed--tight">
  {% for post in t[1] %}
    <li class="feed__item">
      <time class="feed__date" datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y. %m. %d." }}</time>
      <div class="feed__body">
        <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
        {% if post.project %}<p class="feed__proj feed__proj--sm">{{ post.project }}</p>{% endif %}
      </div>
    </li>
  {% endfor %}
  </ol>
</section>
{% endfor %}

{% if tags.size == 0 %}
<p class="empty">아직 태그가 없다. 글의 front matter 에 <code>tags: [프론트, 회고]</code> 처럼 적으면 여기 모인다.</p>
{% endif %}

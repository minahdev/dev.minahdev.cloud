---
layout: default
title: 글
---

<div class="lede">
  <h1>{{ site.title }}</h1>
  <p>{{ site.description }}</p>
</div>

{% if site.projects.size > 0 %}
<div class="projects">
  <p class="projects__k">지금 만드는 것</p>
  <div class="projects__row">
  {% for p in site.projects %}
    {% assign n = site.posts | where: "project", p.name | size %}
    <div class="proj">
      <p class="proj__name"><a href="{{ p.url }}">{{ p.name }}</a></p>
      <p class="proj__blurb">{{ p.blurb }}</p>
      <p class="proj__n"><a href="{{ '/tags/#' | append: p.name | relative_url }}">글 {{ n }}편</a></p>
    </div>
  {% endfor %}
  </div>
</div>
{% endif %}

<ol class="feed">
{% for post in site.posts %}
  <li class="feed__item">
    <time class="feed__date" datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y. %m. %d." }}</time>
    <div class="feed__body">
      {% if post.project %}<p class="feed__proj"><a href="{{ '/tags/#' | append: post.project | relative_url }}">{{ post.project }}</a></p>{% endif %}
      <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
      {% if post.summary %}<p>{{ post.summary }}</p>{% endif %}
      {% if post.tags.size > 0 %}
      <p class="feed__tags">{% for t in post.tags %}<a class="tag" href="{{ '/tags/#' | append: t | relative_url }}">{{ t }}</a>{% endfor %}</p>
      {% endif %}
    </div>
  </li>
{% endfor %}
</ol>

{% if site.posts.size == 0 %}
<p class="empty">아직 글이 없다. <code>_posts/</code> 에 <code>YYYY-MM-DD-제목.md</code> 를 하나 만들면 여기 나온다.</p>
{% endif %}

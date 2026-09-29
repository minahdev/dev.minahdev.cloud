source "https://rubygems.org"

# GitHub Pages 가 실제 빌드에 쓰는 gem 세트를 그대로 쓴다.
# 로컬 미리보기와 배포된 사이트가 어긋나지 않게 하기 위함.
gem "github-pages", group: :jekyll_plugins

gem "webrick", "~> 1.8"

platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

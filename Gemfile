source "https://rubygems.org"

gem "jekyll", "~> 4.3"
gem "jekyll-feed", "~> 0.12"
gem "jekyll-sitemap"
gem "jekyll-seo-tag"

# Windows and JRuby specific dependencies
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance-booster for watching directories on Windows
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]

# Lock `http_parser.rb` gem to `v0.6.x` on JRuby builds
platforms :jruby do
  gem "http_parser.rb", "~> 0.6.0"
end

# Webrick for Jekyll serve (not included in Ruby 3.0+)
gem "webrick", "~> 1.8"
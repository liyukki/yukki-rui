---
title: How This Site Was Built
description: Astro, two free hosts, and why this site needs neither a server nor a domain.
pubDate: 2026-10-15
lang: en
tags: [technology, guide]
translationKey: building-this-site
---

## Why no server

A personal blog is static content. Every article becomes an HTML file during the build; there is no database, no login, and nothing that has to be calculated in real time. Static hosting platforms provide this for free, and they are faster and more reliable than a server you have to maintain yourself.

## Why not buy a domain

The hosting platforms provide a free subdomain. The trade-off is a longer address that changes if you move hosts, but you save money and the attention that comes with renewing a domain every year.

If you do want your own domain later, a `.top` or `.xyz` domain costing a few dozen yuan a year is enough. The important point is that **you can add it at any time**, so it is not a prerequisite for starting now.

## One push, two deployments

```yaml
# Conceptual example, not a ready-to-use configuration
- name: Build
  run: npm run build
```

GitHub Actions handles the build and deployment, while Cloudflare Pages can connect directly to the same repository. If either platform has a problem, the other remains online.

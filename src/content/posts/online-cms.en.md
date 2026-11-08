---
title: The Online CMS Is Live
description: How dsh helped me automate the whole site build. Big Fat Fish is the best.
pubDate: 2026-10-16
updatedDate: 2026-10-16
lang: en
tags:
  - big-fat-fish
draft: false
translationKey: online-cms
---

Going live and deploying are not the same thing. GitHub Pages had been working for a while: push, build, publish, and the pipeline ran smoothly. But that only meant the site could be built; it was still one step away from being writable. I wanted to open a page on my phone and edit an article.

The problem was login. Signing in to the CMS with a GitHub account requires exchanging an authorization code for an access token, and that exchange has to happen on a server. Putting the client secret in a browser is the same as publishing it. GitHub Pages is purely static hosting and cannot run server-side code, so it cannot perform that step. I connected the same source repository to Cloudflare Pages as well: the static pages stayed as they were, while two functions handled the two OAuth hops. Both platforms connect to the same repository, so one content push makes each platform redeploy.

A bug that only appeared in a real browser. The callback page needed to send the token back to the CMS, and the message body should have been a JSON string. It had been written as an object literal instead. In JavaScript, concatenating an object to a string with `+` produces `[object Object]`; when the CMS passed that to `JSON.parse`, it threw immediately. Clicking the login button opened the popup and completed authorization normally, but then nothing happened.

That kind of bug is hard to find with a debugger because it looks completely normal in the code: the function returns 200, the page renders, and the logs contain no errors. It only appears when the real client, the real popup, and the real handshake run end to end.

Three assumptions disproved by testing:

Browser routing can intercept every request. In practice, an interceptor cannot see the next hop after a server-side 302 redirect.

`fetch` inside the function goes through the browser. It does not. It runs in the server process, so a browser-level stand-in has no effect.

`window.opener` survives when the popup returns to our page. As soon as the flow loads GitHub's login page, that response's COOP header severs the connection between the popup and the CMS. Navigating back afterward does not restore it.

The acceptance criterion was a real commit in the repository. "I can sign in" is only the surface. I created an article in the live CMS and a commit appeared in the repository. I deleted it from the CMS and another commit appeared; the file disappeared, and the corresponding GitHub Pages URL changed from 200 to 404. Both platforms rebuilt automatically after the push. Only then was the chain proven.

The short version: a static blog does not need a server, but writing in a web page still needs a tiny server-side function to protect that token. Twenty lines of code, and worth it.

![practice](./images/你在看什么呀.jpg)

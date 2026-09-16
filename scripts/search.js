/* CubeExplorer search page logic
   Same structure as the original Old Bing site's scripts/search.js:
   - waits for CSE elements, strips "About"/timing from the results info line
   - wires the custom Web / Images links to the native CSE tabs
   - redirects home when no ?q= is present
   Plus: builds the Windows-8-style card header (favicon thumb + title + url),
   a result-driven 1..N pagination bar with MDL2 chevrons (E76B / E76C),
   and a graceful notice if Google's widget cannot render.

   IE11 COMPATIBLE: plain ES5 only - no arrow functions, const/let, promises,
   URL/URLSearchParams, Element.closest, NodeList.forEach or smooth scrolling. */

(function () {
    'use strict';

    var searchBox = document.getElementById('textBox');
    var currentTab = 0;
    var searchQuery = getQueryParam('q');

    /* no query -> back home (replace() keeps history clean and works inside iframes) */
    if (!searchQuery) {
        window.location.replace('../index.html');
    }

    /* ---------- IE11-safe helpers ---------- */

    /* query-string parser (URLSearchParams replacement) */
    function getQueryParam(name) {
        var qs = window.location.search.substring(1);
        if (!qs) return null;
        var pairs = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var kv = pairs[i].split('=');
            if (kv[0] === name) {
                try {
                    return decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
                } catch (e) {
                    return kv[1] || '';
                }
            }
        }
        return null;
    }

    /* NodeList.forEach replacement */
    function forEachNode(list, fn) {
        if (!list) return;
        for (var i = 0; i < list.length; i++) fn(list[i], i);
    }

    /* callback-style element waiter (Promise replacement) */
    function waitForElm(selector, callback) {
        var el = document.querySelector(selector);
        if (el) {
            callback(el);
            return;
        }
        var observer = new MutationObserver(function () {
            var el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                callback(el);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* Element.closest replacement (class-name walk up the tree) */
    function closestByClass(el, cls) {
        while (el && el !== document) {
            if (el.classList && el.classList.contains(cls)) return el;
            el = el.parentNode;
        }
        return null;
    }

    /* new URL(href).hostname replacement (anchor trick) */
    function hostFromHref(href) {
        var a = document.createElement('a');
        a.href = href;
        return a.hostname || null;
    }

    /* smooth scroll with an IE11 fallback */
    function smoothTop() {
        if ('scrollBehavior' in document.documentElement.style) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo(0, 0);
        }
    }

    /* ---------- results info line: "About 1,230,000 results (0.24 seconds)" -> "1,230,000" ---------- */

    function cleanInfoLine(elm) {
        elm.textContent = elm.textContent.replace('About ', '').split(' (')[0];
    }

    waitForElm('.gsc-result-info', function (elm) {
        cleanInfoLine(elm);
        var previousContent = elm.textContent;

        var observer = new MutationObserver(function (mutationsList) {
            mutationsList.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    var currentContent = elm.textContent;
                    if (currentContent !== previousContent) {
                        cleanInfoLine(elm);
                        previousContent = elm.textContent;
                    }
                }
            });
        });

        observer.observe(elm, { childList: true });
    });

    /* ---------- Web / Images switching: click the native CSE tabs like the original did ---------- */

    waitForElm('.gsc-tabhInactive', function (elm) {
        var imageLink = document.querySelector('#img');
        var webLink = document.querySelector('#web');
        if (!imageLink || !webLink) return;

        imageLink.onclick = function () {
            if (currentTab === 0) {
                elm.click();

                imageLink.classList.add('active');
                imageLink.classList.remove('workingLink');

                webLink.classList.remove('active');
                webLink.classList.add('workingLink');
                currentTab = 1;
            }
        };

        webLink.onclick = function () {
            if (currentTab === 1) {
                elm.previousSibling.previousSibling.click();

                webLink.classList.add('active');
                webLink.classList.remove('workingLink');

                imageLink.classList.remove('active');
                imageLink.classList.add('workingLink');
                currentTab = 0;
            }
        };
    });

    /* ---------- Windows 8 card header: favicon thumbnail + title + url ---------- */

    function hostFromResult(result) {
        var a = result.querySelector('.gs-title a[href]');
        if (a && a.href) {
            try { return hostFromHref(a.href); } catch (e) {}
        }
        var u = result.querySelector('.gs-visibleUrl, .gsc-url-top, .gsc-url-bottom');
        if (u) {
            var t = (u.textContent || '').trim().replace(/^https?:\/\//, '').split('/')[0];
            if (t) return t;
        }
        return null;
    }

    function buildCardHead(result) {
        if (!result || result.dataset.cxDone) return;
        var gsResult = result.querySelector('.gs-result') || result;
        var titleBox = gsResult.querySelector('.gsc-thumbnail-inside');
        var urlBox = gsResult.querySelector('.gsc-url-top, .gsc-url-bottom');
        if (!titleBox) return;

        result.dataset.cxDone = '1';

        var head = document.createElement('div');
        head.className = 'cx-head';

        var host = hostFromResult(result);
        if (host) {
            var img = document.createElement('img');
            img.className = 'cx-fav';
            img.alt = '';
            img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
            head.appendChild(img);
        }

        var textCol = document.createElement('div');
        textCol.className = 'cx-head-text';
        textCol.appendChild(titleBox);
        if (urlBox) textCol.appendChild(urlBox);
        head.appendChild(textCol);

        gsResult.insertBefore(head, gsResult.firstChild);
    }

    function scanCards(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.classList) {
            if (root.classList.contains('gsc-webResult') && root.classList.contains('gsc-result')) buildCardHead(root);
            if (root.classList.contains('gs-result')) buildCardHead(closestByClass(root, 'gsc-result'));
        }
        if (root.querySelectorAll) forEachNode(root.querySelectorAll('.gsc-webResult.gsc-result'), buildCardHead);
    }

    var resultsObserved = false;

    function observeResults() {
        if (resultsObserved) return;
        resultsObserved = true;
        var target = document.querySelector('.gsc-resultsbox-visible') || document.body;
        var mo = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (m.addedNodes) forEachNode(m.addedNodes, scanCards);
            });
        });
        mo.observe(target, { childList: true, subtree: true });
        scanCards(target);
    }

    waitForElm('.gsc-webResult', function () { observeResults(); });
    waitForElm('.gsc-resultsbox-visible', function () { observeResults(); });

    /* ---------- pagination bar: 1..N (N = however many pages the results take)
       + MDL2 chevron prev/next buttons (E76B / E76C) ---------- */

    function pagiPages(box) {
        var pages = [];
        forEachNode(box.querySelectorAll('.gsc-cursor-page'), function (chip) {
            pages.push(chip);
        });
        return pages;
    }

    function pagiCurrentIndex(pages) {
        for (var i = 0; i < pages.length; i++) {
            if (pages[i].classList.contains('gsc-cursor-current-page')) return i;
        }
        return -1;
    }

    function updatePagiState(box) {
        var pages = pagiPages(box);
        var curIdx = pagiCurrentIndex(pages);
        var prev = box.querySelector('.cx-prev');
        var next = box.querySelector('.cx-next');

        /* IE11 classList.toggle has no second argument - use add/remove */
        if (prev) {
            if (curIdx <= 0) prev.classList.add('cx-disabled');
            else prev.classList.remove('cx-disabled');
        }
        if (next) {
            if (curIdx === -1 || curIdx >= pages.length - 1) next.classList.add('cx-disabled');
            else next.classList.remove('cx-disabled');
        }
    }

    function pagiStep(box, dir) {
        var pages = pagiPages(box);
        var target = pages[pagiCurrentIndex(pages) + dir];
        if (target) {
            target.click();
            smoothTop();
        }
    }

    function enhancePagination() {
        forEachNode(document.querySelectorAll('.gsc-cursor-box'), function (box) {
            if (!box.querySelector('.gsc-cursor-page')) return;
            if (!box.dataset.cxPagi) {
                box.dataset.cxPagi = '1';
                var cursor = box.querySelector('.gsc-cursor') || box;

                var prev = document.createElement('div');
                prev.className = 'cx-nav cx-prev';
                prev.title = 'Previous page';
                prev.textContent = '\uE76B';
                prev.onclick = function () { pagiStep(box, -1); };

                var next = document.createElement('div');
                next.className = 'cx-nav cx-next';
                next.title = 'Next page';
                next.textContent = '\uE76C';
                next.onclick = function () { pagiStep(box, 1); };

                cursor.parentNode.insertBefore(prev, cursor);
                cursor.parentNode.insertBefore(next, cursor.nextSibling);
            }
            updatePagiState(box);
        });
    }

    waitForElm('.gsc-cursor-box', function () {
        enhancePagination();
        var target = document.querySelector('.gsc-resultsbox-visible') || document.body;
        var mo = new MutationObserver(function () { enhancePagination(); });
        mo.observe(target, { childList: true, subtree: true });
    });

    /* ---------- IE11 graceful degradation: if Google's widget never renders,
       show a friendly card instead of a silently empty results area ---------- */

    if (document.documentMode) { /* true only in IE */
        window.setTimeout(function () {
            if (document.querySelector('.gsc-result') || document.querySelector('.cx-ie-note')) return;
            var area = document.getElementById('resultsArea');
            if (!area) return;
            var note = document.createElement('div');
            note.className = 'cx-ie-note';
            note.innerHTML = '<b>Results could not load in this browser.</b><br>' +
                'Google\u2019s search widget needs a newer browser version to run. ' +
                'Please try Internet Explorer 11 with the latest updates, or a modern browser such as Microsoft Edge, Firefox or Chrome.';
            area.appendChild(note);
        }, 9000);
    }

    /* ---------- misc (same as original) ---------- */

    document.title = (searchQuery || '') + ' - CubeExplorer';
    if (searchBox) searchBox.value = searchQuery || '';
})();

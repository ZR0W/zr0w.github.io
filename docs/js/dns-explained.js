/*
 * Interactive diagrams for docs/blog/dns-explained.html
 *
 * - Data-driven sequence diagrams (lanes + steps) rendered as SVG.
 * - Step-through controls with captions, scenario switcher, autoplay.
 * - Zoom / pan for every diagram: +/− buttons, Ctrl/⌘ + wheel, pinch,
 *   drag to pan, and a full-screen view where the plain wheel zooms.
 *
 * No dependencies. Figures opt in with data-diagram="<id>" (sequence
 * diagram built from DIAGRAMS below) or data-zoom (existing inline SVG).
 */
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // Diagram data
    // kind: query | answer | blocked | conn | local
    // A step with no `t` (or t === f) is drawn as a note on lane `f`.
    // ------------------------------------------------------------------
    var DIAGRAMS = {
        recursion: {
            title: 'Resolving www.example.com',
            lanes: [
                { id: 'dev', name: 'Your device', sub: 'stub resolver' },
                { id: 'res', name: 'Recursive resolver', sub: 'ISP, 1.1.1.1, 9.9.9.9…' },
                { id: 'root', name: 'Root servers', sub: '"."' },
                { id: 'tld', name: '.com servers', sub: 'top-level domain' },
                { id: 'auth', name: 'example.com NS', sub: 'authoritative' }
            ],
            scenarios: [
                {
                    id: 'cold', label: 'Cold lookup (nothing cached)',
                    steps: [
                        { f: 'dev', label: 'Need www.example.com', kind: 'local',
                          title: 'An app needs an address',
                          text: 'A browser wants www.example.com. The operating system\'s stub resolver checks its own cache first: empty.' },
                        { f: 'dev', t: 'res', label: 'A? www.example.com', kind: 'query',
                          title: 'One question to the configured resolver',
                          text: 'The stub sends a single question, usually over UDP port 53, to the resolver it was configured with, then waits. The resolver does all the remaining work.' },
                        { f: 'res', label: 'Cache: miss', kind: 'local',
                          title: 'Resolver checks its cache',
                          text: 'Nobody has asked this resolver for this name recently (or the cached answer expired), so it has to go and find out.' },
                        { f: 'res', t: 'root', label: 'A? www.example.com', kind: 'query',
                          title: 'Start at the top',
                          text: 'Every resolver ships with the addresses of the root servers: 13 names, run as hundreds of machines worldwide.' },
                        { f: 'root', t: 'res', label: 'Referral: ask .com', kind: 'answer',
                          title: 'The root refers, it doesn\'t answer',
                          text: 'The root only knows who runs each top-level domain. It replies with NS records for .com (a referral). Resolvers cache this for up to two days, so this step is rare in practice.' },
                        { f: 'res', t: 'tld', label: 'A? www.example.com', kind: 'query',
                          title: 'Ask the .com servers',
                          text: 'Same question, one level down.' },
                        { f: 'tld', t: 'res', label: 'Referral: ask ns1.dns-host…', kind: 'answer',
                          title: '.com refers again',
                          text: '.com doesn\'t hold the address either, but it knows which nameservers are authoritative for example.com.' },
                        { f: 'res', t: 'auth', label: 'A? www.example.com', kind: 'query',
                          title: 'Ask the authoritative server',
                          text: 'This server holds the actual records for example.com, published by whoever owns the domain.' },
                        { f: 'auth', t: 'res', label: '203.0.113.10 (TTL 300)', kind: 'answer',
                          title: 'The real answer, with a TTL',
                          text: 'The address comes back with a time to live: anyone may cache it for 300 seconds.' },
                        { f: 'res', label: 'Cache for 300 s', kind: 'local',
                          title: 'Resolver caches',
                          text: 'The next person to ask within 5 minutes gets an instant answer.' },
                        { f: 'res', t: 'dev', label: '203.0.113.10', kind: 'answer',
                          title: 'Back to the device',
                          text: 'The device caches it too. Four round trips in total, typically 20–150 ms.' }
                    ]
                },
                {
                    id: 'warm', label: 'Resolver has it cached',
                    steps: [
                        { f: 'dev', label: 'Cache: miss', kind: 'local',
                          title: 'Device cache is empty',
                          text: 'This device hasn\'t looked up the name recently.' },
                        { f: 'dev', t: 'res', label: 'A? www.example.com', kind: 'query',
                          title: 'Ask the resolver',
                          text: 'Same single question as before.' },
                        { f: 'res', label: 'Cache: hit (180 s left)', kind: 'local',
                          title: 'Someone asked recently',
                          text: 'Another device (or user) looked this up within the TTL. No root, .com or authoritative servers are contacted at all.' },
                        { f: 'res', t: 'dev', label: '203.0.113.10', kind: 'answer',
                          title: 'Instant answer',
                          text: 'About 1 ms from a resolver on your own network, 10–20 ms from a public one. This is what most lookups look like.' }
                    ]
                },
                {
                    id: 'local', label: 'Device has it cached',
                    steps: [
                        { f: 'dev', label: 'Cache: hit', kind: 'local',
                          title: 'No network at all',
                          text: 'The browser or OS looked this name up a moment ago and the TTL hasn\'t expired. The answer comes from memory; no packet is sent.' }
                    ]
                }
            ]
        },

        devices: {
            title: 'Who actually answers a device\'s DNS question?',
            lanes: [
                { id: 'app', name: 'App / browser', sub: 'wants an address' },
                { id: 'os', name: 'OS resolver', sub: 'stub + cache' },
                { id: 'net', name: 'Configured DNS', sub: 'router default or manual' },
                { id: 'enc', name: 'Encrypted provider', sub: 'DoH / DoT / relay' },
                { id: 'hard', name: 'Hard-coded DNS', sub: 'e.g. 8.8.8.8' }
            ],
            scenarios: [
                {
                    id: 'default', label: 'Default (most devices)',
                    steps: [
                        { f: 'app', t: 'os', label: 'Look up a name', kind: 'query',
                          title: 'Apps ask the OS',
                          text: 'Most apps call the operating system\'s resolver (getaddrinfo on Linux/macOS/Android, the DNS Client service on Windows).' },
                        { f: 'os', label: 'Server learned from router', kind: 'local',
                          title: 'Where the server address came from',
                          text: 'When the device joined the network, DHCP (IPv4) and router advertisements or DHCPv6 (IPv6) told it which DNS server to use: usually the router itself, which forwards to the ISP.' },
                        { f: 'os', t: 'net', label: 'Plain DNS, UDP 53', kind: 'query',
                          title: 'Unencrypted question',
                          text: 'Classic DNS is plain text. Anything on the path can read it, which is also what lets a network filter it.' },
                        { f: 'net', t: 'os', label: 'Answer', kind: 'answer',
                          title: 'Answer', text: 'The router (or whatever it forwards to) replies.' },
                        { f: 'os', t: 'app', label: 'Address', kind: 'answer',
                          title: 'Back to the app', text: 'Cached by the OS for the TTL.' }
                    ]
                },
                {
                    id: 'manual', label: 'Manual DNS (my PC)',
                    steps: [
                        { f: 'app', t: 'os', label: 'Look up a name', kind: 'query',
                          title: 'Same start', text: 'The app still just asks the OS.' },
                        { f: 'os', label: 'Manual: Pi-hole (v4 + v6)', kind: 'local',
                          title: 'Manual settings win',
                          text: 'A DNS server set on the network adapter replaces what the router handed out. Set it for IPv4 and IPv6: otherwise the router\'s advertised IPv6 DNS stays in the list and some lookups go there instead.' },
                        { f: 'os', t: 'net', label: 'Plain DNS to Pi-hole', kind: 'query',
                          title: 'Question goes to the Pi-hole', text: 'Every lookup from every app on this PC now passes the Pi-hole\'s blocklists.' },
                        { f: 'net', t: 'os', label: 'Answer (or 0.0.0.0)', kind: 'answer',
                          title: 'Filtered answer', text: 'Allowed names get real addresses; blocked names get 0.0.0.0.' },
                        { f: 'os', t: 'app', label: 'Address', kind: 'answer',
                          title: 'Back to the app', text: 'Cached as usual.' }
                    ]
                },
                {
                    id: 'doh', label: 'Browser with DoH',
                    steps: [
                        { f: 'app', label: 'DoH on: skip the OS', kind: 'local',
                          title: 'The browser resolves names itself',
                          text: 'Firefox (TRR), Chrome and Edge (Secure DNS) can send DNS over HTTPS directly. Firefox may enable it by default in some regions.' },
                        { f: 'app', t: 'enc', label: 'HTTPS to e.g. 1.1.1.1', kind: 'query',
                          title: 'Looks like ordinary web traffic',
                          text: 'The question travels encrypted on port 443. The configured DNS server, and any filter on it, never sees it.' },
                        { f: 'enc', t: 'app', label: 'Answer (encrypted)', kind: 'answer',
                          title: 'Answer', text: 'Straight back to the browser.' },
                        { f: 'app', label: 'Pi-hole saw nothing', kind: 'blocked',
                          title: 'Why I turned DoH off in Firefox',
                          text: 'With DoH on, the browser bypasses my Pi-hole entirely: no blocking, no Query Log entries. Other apps on the PC still use the Pi-hole.' }
                    ]
                },
                {
                    id: 'android', label: 'Android Private DNS',
                    steps: [
                        { f: 'app', t: 'os', label: 'Look up a name', kind: 'query',
                          title: 'Apps ask Android', text: 'Normal app behaviour.' },
                        { f: 'os', label: 'Private DNS: provider set', kind: 'local',
                          title: 'Settings → Network → Private DNS',
                          text: 'When a provider hostname is set, Android ignores the DNS server the Wi-Fi handed out.' },
                        { f: 'os', t: 'enc', label: 'DNS over TLS, port 853', kind: 'query',
                          title: 'Encrypted, phone-wide',
                          text: 'Every app\'s lookups go encrypted to the provider. A Pi-hole on the Wi-Fi is bypassed.' },
                        { f: 'enc', t: 'os', label: 'Answer', kind: 'answer', title: 'Answer', text: 'Back over TLS.' },
                        { f: 'os', t: 'app', label: 'Address', kind: 'answer', title: 'Back to the app', text: 'Cached by Android.' }
                    ]
                },
                {
                    id: 'relay', label: 'iPhone Private Relay',
                    steps: [
                        { f: 'app', label: 'Safari + Private Relay', kind: 'local',
                          title: 'iCloud Private Relay',
                          text: 'For Safari (and some unencrypted app traffic), Apple routes browsing and its DNS through two relays.' },
                        { f: 'app', t: 'enc', label: 'Via Apple\'s relays', kind: 'query',
                          title: 'Local DNS not used',
                          text: 'The network\'s DNS server never sees Safari\'s lookups. Other apps keep using normal DNS.' },
                        { f: 'enc', t: 'app', label: 'Answer + page', kind: 'answer',
                          title: 'Answer', text: 'Returned through the relay.' }
                    ]
                },
                {
                    id: 'hard', label: 'Hard-coded (smart TV, apps)',
                    steps: [
                        { f: 'app', label: 'Ignores all settings', kind: 'local',
                          title: 'Built-in resolver',
                          text: 'Some smart TVs, streaming sticks and apps ship with their own DNS server address.' },
                        { f: 'app', t: 'hard', label: 'UDP 53 to 8.8.8.8', kind: 'query',
                          title: 'Straight past everything',
                          text: 'Device and router settings are ignored. Only a router firewall rule that redirects all port-53 traffic can catch this, and not if it uses DoH.' },
                        { f: 'hard', t: 'app', label: 'Answer', kind: 'answer', title: 'Answer', text: 'Unfiltered.' }
                    ]
                }
            ]
        },

        mysetup: {
            title: 'One lookup through my setup',
            lanes: [
                { id: 'ff', name: 'Firefox', sub: 'DoH off' },
                { id: 'win', name: 'Windows', sub: 'DNS client + cache' },
                { id: 'ph', name: 'Pi-hole', sub: 'on zombieboi' },
                { id: 'cf', name: 'Cloudflare', sub: 'for Families 1.1.1.3' },
                { id: 'net', name: 'Internet DNS', sub: 'root → .com → NS' },
                { id: 'rt', name: 'Router / ISP', sub: 'NAT, public IP' },
                { id: 'site', name: 'Website', sub: 'e.g. Google' }
            ],
            scenarios: [
                {
                    id: 'google', label: 'Google search (SafeSearch)',
                    steps: [
                        { f: 'ff', label: '"cats" → URL', kind: 'local',
                          title: 'Firefox builds a URL',
                          text: 'Searching "cats" becomes https://www.google.com/search?q=cats. Only the hostname, www.google.com, is used for DNS. The path and search term stay inside Firefox until the encrypted connection exists.' },
                        { f: 'ff', label: 'Firefox cache: miss', kind: 'local',
                          title: 'Browser cache',
                          text: 'Firefox keeps a short-lived DNS cache. DNS over HTTPS is off, so a miss goes to the operating system.' },
                        { f: 'ff', t: 'win', label: 'A / AAAA / HTTPS?', kind: 'query',
                          title: 'Ask Windows',
                          text: 'Firefox asks for IPv4 (A), IPv6 (AAAA) and HTTPS records for www.google.com, often in parallel.' },
                        { f: 'win', label: 'Cache: miss', kind: 'local',
                          title: 'Windows DNS cache',
                          text: 'The DNS Client service\'s cache, the one Clear-DnsClientCache empties. Nothing fresh here.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query',
                          title: 'Manual DNS: Pi-hole only',
                          text: 'The adapter\'s manual settings list only the Pi-hole (IPv6 link-local first, IPv4 as fallback). No other server is configured, so nothing can slip past it.' },
                        { f: 'ph', label: 'Lists: allowed · cache: miss', kind: 'local',
                          title: 'Pi-hole decides',
                          text: 'Not on any blocklist. Not cached (or expired), so it has to ask upstream.' },
                        { f: 'ph', t: 'cf', label: 'Forward to 1.1.1.3', kind: 'query',
                          title: 'Forward upstream',
                          text: 'Plain, unencrypted DNS. My ISP can see this hostname go past.' },
                        { f: 'cf', t: 'net', label: 'Resolve (if not cached)', kind: 'query',
                          title: 'Cloudflare is a recursive resolver',
                          text: 'It would walk root → .com → Google\'s nameservers, though for www.google.com it has almost certainly cached the answer already.' },
                        { f: 'net', t: 'cf', label: 'Google\'s normal addresses', kind: 'answer',
                          title: 'The real answer', text: 'The ordinary addresses for www.google.com.' },
                        { f: 'cf', label: 'Policy: Google → SafeSearch', kind: 'local',
                          title: 'Cloudflare for Families rewrites the answer',
                          text: 'For Google search, the family service doesn\'t return the normal addresses. It answers with a CNAME: www.google.com is forcesafesearch.google.com, plus that name\'s address.' },
                        { f: 'cf', t: 'ph', label: 'CNAME forcesafesearch + IP', kind: 'answer',
                          title: 'Rewritten answer', text: 'A different Google address: the door that always applies SafeSearch.' },
                        { f: 'ph', t: 'win', label: 'Same answer (cached, logged)', kind: 'answer',
                          title: 'Pi-hole passes it on',
                          text: 'Cached for its TTL and written to the Query Log, which is how you can spot forcesafesearch there.' },
                        { f: 'win', t: 'ff', label: 'SafeSearch address', kind: 'answer',
                          title: 'DNS is done', text: 'Windows and Firefox cache it too.' },
                        { f: 'ff', t: 'rt', label: 'TCP / QUIC → :443', kind: 'conn',
                          title: 'Connect',
                          text: 'The connection leaves the PC. The router swaps my private address for our single public IP (NAT).' },
                        { f: 'rt', t: 'site', label: 'To SafeSearch front end', kind: 'conn',
                          title: 'Across the internet', text: 'Through the ISP to Google.' },
                        { f: 'site', t: 'ff', label: 'TLS: cert www.google.com ✓', kind: 'conn',
                          title: 'Genuine certificate',
                          text: 'Firefox asked for www.google.com (SNI, visible to the ISP). Google presents its real certificate, which is valid because it really is Google. Everything after this is encrypted.' },
                        { f: 'ff', t: 'site', label: 'GET /search?q=cats', kind: 'conn',
                          title: 'The search term leaves, encrypted',
                          text: 'Only now does "cats" leave the PC, inside the encrypted tunnel.' },
                        { f: 'site', label: 'Arrived on SafeSearch IP → lock', kind: 'local',
                          title: 'Google decides by address',
                          text: 'Google sees which of its addresses the connection arrived on and forces SafeSearch: "locked to filter by your network". Account settings can\'t override it.' },
                        { f: 'site', t: 'ff', label: 'Results, SafeSearch locked', kind: 'answer',
                          title: 'Page arrives', text: 'Filtered results.' },
                        { f: 'ff', label: 'Page needs more hostnames', kind: 'local',
                          title: 'And again, many times',
                          text: 'Scripts, images, fonts, maybe ads and analytics: every new hostname repeats this lookup. Ad and tracker names get 0.0.0.0 from the Pi-hole (see the Ad scenario).' }
                    ]
                },
                {
                    id: 'normal', label: 'Normal site',
                    steps: [
                        { f: 'ff', label: 'Open example.com', kind: 'local',
                          title: 'A regular site', text: 'Nothing special about this one.' },
                        { f: 'ff', t: 'win', label: 'A / AAAA?', kind: 'query', title: 'Ask Windows', text: 'Browser cache miss.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query', title: 'Ask the Pi-hole', text: 'Windows cache miss too.' },
                        { f: 'ph', label: 'Allowed · cache miss', kind: 'local', title: 'Not blocked', text: 'Forward it.' },
                        { f: 'ph', t: 'cf', label: 'Forward to 1.1.1.3', kind: 'query', title: 'Upstream', text: 'Plain DNS to Cloudflare.' },
                        { f: 'cf', t: 'net', label: 'Resolve', kind: 'query', title: 'Recursion', text: 'Root → .com → the site\'s nameservers, unless cached.' },
                        { f: 'net', t: 'cf', label: 'Real address', kind: 'answer', title: 'Answer', text: 'The site\'s address.' },
                        { f: 'cf', label: 'Policy: allowed', kind: 'local', title: 'No rewrite', text: 'Not malware, not adult, not a search engine. Passed through unchanged.' },
                        { f: 'cf', t: 'ph', label: 'Real address', kind: 'answer', title: 'Back to Pi-hole', text: 'Cached and logged.' },
                        { f: 'ph', t: 'win', label: 'Real address', kind: 'answer', title: 'Back to Windows', text: 'Cached.' },
                        { f: 'win', t: 'ff', label: 'Real address', kind: 'answer', title: 'Back to Firefox', text: 'Cached.' },
                        { f: 'ff', t: 'rt', label: 'TCP / QUIC → :443', kind: 'conn', title: 'Connect', text: 'Out through the router (NAT).' },
                        { f: 'rt', t: 'site', label: 'To the site', kind: 'conn', title: 'Across the internet', text: 'Via the ISP.' },
                        { f: 'site', t: 'ff', label: 'TLS: cert ✓', kind: 'conn', title: 'Certificate checks out', text: 'Encrypted from here.' },
                        { f: 'ff', t: 'site', label: 'GET /', kind: 'conn', title: 'Request', text: 'Encrypted.' },
                        { f: 'site', t: 'ff', label: 'Page', kind: 'answer', title: 'Page', text: 'Then sub-resources, each with its own lookup.' }
                    ]
                },
                {
                    id: 'cached', label: 'Repeat visit (cached)',
                    steps: [
                        { f: 'ff', t: 'win', label: 'A / AAAA?', kind: 'query', title: 'Ask Windows', text: 'Firefox\'s own cache expired.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query', title: 'Ask the Pi-hole', text: 'Windows\' cache expired too.' },
                        { f: 'ph', label: 'Cache: hit', kind: 'local',
                          title: 'Answered locally',
                          text: 'The Pi-hole forwarded this name earlier and the TTL hasn\'t run out. Cloudflare isn\'t contacted, so it never sees repeat lookups.' },
                        { f: 'ph', t: 'win', label: 'Real address (~1 ms)', kind: 'answer', title: 'Fast answer', text: 'Answered from the LAN in about a millisecond.' },
                        { f: 'win', t: 'ff', label: 'Real address', kind: 'answer', title: 'DNS done', text: 'Connect as usual.' },
                        { f: 'ff', t: 'rt', label: 'TCP / QUIC → :443', kind: 'conn', title: 'Connect', text: 'Same as a normal visit from here on.' },
                        { f: 'rt', t: 'site', label: 'To the site', kind: 'conn', title: 'Across the internet', text: 'Via the ISP.' }
                    ]
                },
                {
                    id: 'ad', label: 'Ad / tracker (Pi-hole block)',
                    steps: [
                        { f: 'ff', label: 'Script wants ads.tracker.example', kind: 'local',
                          title: 'A page pulls in an ad',
                          text: 'A sub-resource on a normal page, not something you typed.' },
                        { f: 'ff', t: 'win', label: 'A / AAAA?', kind: 'query', title: 'Ask Windows', text: 'Like any other name.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query', title: 'Ask the Pi-hole', text: 'Windows cache miss.' },
                        { f: 'ph', label: 'On blocklist (gravity)', kind: 'blocked',
                          title: 'Blocked by the Pi-hole itself',
                          text: 'It matches the Pi-hole\'s own blocklist. The query is not forwarded: Cloudflare never sees it. Because the block is mine, I can allowlist it if it breaks something.' },
                        { f: 'ph', t: 'win', label: '0.0.0.0 / ::', kind: 'blocked',
                          title: '"Nowhere"', text: 'A deliberate non-address for IPv4 and IPv6.' },
                        { f: 'win', t: 'ff', label: '0.0.0.0 / ::', kind: 'blocked', title: 'Passed on', text: 'Cached like any answer.' },
                        { f: 'ff', label: 'Connect to 0.0.0.0 fails', kind: 'blocked',
                          title: 'Fails instantly, on my PC',
                          text: 'Nothing is ever sent towards the tracker. That piece of the page just doesn\'t load, which is why ad blocking is mostly invisible.' }
                    ]
                },
                {
                    id: 'adult', label: 'Adult site (Cloudflare block)',
                    steps: [
                        { f: 'ff', label: 'Open adult-site.example', kind: 'local',
                          title: 'Typed into the address bar', text: 'A main-page navigation this time.' },
                        { f: 'ff', t: 'win', label: 'A / AAAA?', kind: 'query', title: 'Ask Windows', text: 'Cache miss.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query', title: 'Ask the Pi-hole', text: 'Cache miss.' },
                        { f: 'ph', label: 'Not on my lists → forward', kind: 'local',
                          title: 'The Pi-hole doesn\'t block it',
                          text: 'Its own lists don\'t include this site, so it forwards as normal.' },
                        { f: 'ph', t: 'cf', label: 'Forward to 1.1.1.3', kind: 'query', title: 'Upstream', text: 'Plain DNS.' },
                        { f: 'cf', label: 'Category: adult → block', kind: 'blocked',
                          title: 'Cloudflare\'s policy',
                          text: 'Cloudflare for Families classifies the domain and refuses to return the real address.' },
                        { f: 'cf', t: 'ph', label: '0.0.0.0 / ::', kind: 'blocked',
                          title: 'Blocked upstream',
                          text: 'The Pi-hole logs it as blocked by the upstream server. Its allowlist can\'t override this, because the real address never arrived.' },
                        { f: 'ph', t: 'win', label: '0.0.0.0 / ::', kind: 'blocked', title: 'Passed on', text: 'Cached.' },
                        { f: 'win', t: 'ff', label: '0.0.0.0 / ::', kind: 'blocked', title: 'Passed on', text: 'Cached.' },
                        { f: 'ff', label: 'Error page', kind: 'blocked',
                          title: 'What I actually see',
                          text: 'The main page couldn\'t connect, so Firefox shows an error. DNS can\'t show a nicer page for HTTPS sites: nothing but the real site can present a valid certificate for it.' }
                    ]
                },
                {
                    id: 'typo', label: 'Typo (NXDOMAIN)',
                    steps: [
                        { f: 'ff', label: 'Open gooogle-typo.com', kind: 'local', title: 'A typo', text: 'A name nobody registered.' },
                        { f: 'ff', t: 'win', label: 'A / AAAA?', kind: 'query', title: 'Ask Windows', text: 'Cache miss.' },
                        { f: 'win', t: 'ph', label: 'UDP 53 → Pi-hole', kind: 'query', title: 'Ask the Pi-hole', text: 'Not on any list.' },
                        { f: 'ph', t: 'cf', label: 'Forward to 1.1.1.3', kind: 'query', title: 'Upstream', text: 'Plain DNS.' },
                        { f: 'cf', t: 'net', label: 'Resolve', kind: 'query', title: 'Recursion', text: 'Ask .com about the name.' },
                        { f: 'net', t: 'cf', label: 'NXDOMAIN', kind: 'answer',
                          title: '"No such name"', text: '.com has no record of this domain.' },
                        { f: 'cf', t: 'ph', label: 'NXDOMAIN', kind: 'answer', title: 'Passed on', text: 'Negative answers are cached too, for a shorter time.' },
                        { f: 'ph', t: 'win', label: 'NXDOMAIN', kind: 'answer', title: 'Passed on', text: 'Logged as a normal (not blocked) query.' },
                        { f: 'win', t: 'ff', label: 'NXDOMAIN', kind: 'answer', title: 'Passed on', text: 'No address at all.' },
                        { f: 'ff', label: '"Can\'t find this site"', kind: 'local',
                          title: 'Not blocked, just nonexistent',
                          text: 'Looks like the blocked-site error, but it\'s a different answer: NXDOMAIN (no such name) rather than 0.0.0.0 (deliberately nowhere). Software can tell the two apart.' }
                    ]
                }
            ]
        }
    };

    var KIND_LABELS = {
        query: 'Question', answer: 'Answer', blocked: 'Blocked',
        conn: 'Connection / HTTPS', local: 'Local step'
    };

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function el(tag, attrs, text) {
        var n = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        }
        if (text != null) { n.textContent = text; }
        return n;
    }

    // Rough text width at 12px system-ui (good enough for layout).
    function textWidth(s, size) { return String(s).length * (size || 12) * 0.56; }

    // ------------------------------------------------------------------
    // Sequence diagram renderer → SVG markup string
    // ------------------------------------------------------------------
    var L = { margin: 100, gap: 160, headY: 10, headH: 46, top: 92, row: 44, bottom: 24 };

    function renderSequence(diagram, scenario) {
        var lanes = diagram.lanes;
        var x = {};
        lanes.forEach(function (lane, i) { x[lane.id] = L.margin + i * L.gap; });
        var width = L.margin * 2 + (lanes.length - 1) * L.gap;
        var steps = scenario.steps;
        var height = L.top + steps.length * L.row + L.bottom;

        var out = [];
        out.push('<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + width + ' ' + height +
            '" role="img" aria-label="' + esc(diagram.title + ': ' + scenario.label) + '">');

        // Lanes
        lanes.forEach(function (lane) {
            var cx = x[lane.id];
            out.push('<line class="lane-line" x1="' + cx + '" y1="' + (L.headY + L.headH) +
                '" x2="' + cx + '" y2="' + (height - 8) + '"/>');
            var w = Math.max(130, textWidth(lane.name, 13) + 20, textWidth(lane.sub, 11) + 20);
            w = Math.min(w, L.gap - 8);
            out.push('<g class="lane-head"><rect x="' + (cx - w / 2) + '" y="' + L.headY +
                '" width="' + w + '" height="' + L.headH + '" rx="7"/>' +
                '<text x="' + cx + '" y="' + (L.headY + 20) + '" text-anchor="middle">' + esc(lane.name) + '</text>' +
                '<text class="sub" x="' + cx + '" y="' + (L.headY + 37) + '" text-anchor="middle">' + esc(lane.sub) + '</text></g>');
        });

        // Steps
        steps.forEach(function (s, i) {
            var y = L.top + i * L.row + L.row / 2;
            var cls = 'step k-' + s.kind;
            var g = '<g class="' + cls + '" data-i="' + i + '" tabindex="-1">';
            var from = x[s.f];
            var badgeX;
            if (!s.t || s.t === s.f) {
                var bw = Math.max(90, textWidth(s.label) + 22);
                // Keep the note (and its number badge) inside the canvas.
                var bx = Math.min(Math.max(from - bw / 2, 30), width - 8 - bw);
                g += '<rect class="note" x="' + bx + '" y="' + (y - 14) + '" width="' + bw +
                    '" height="28" rx="14"/>';
                g += '<text class="label" x="' + (bx + bw / 2) + '" y="' + (y + 4) + '" text-anchor="middle">' + esc(s.label) + '</text>';
                badgeX = bx - 13;
            } else {
                var to = x[s.t];
                var dir = to > from ? 1 : -1;
                var x1 = from + dir * 6, x2 = to - dir * 6;
                g += '<line x1="' + x1 + '" y1="' + y + '" x2="' + (x2 - dir * 8) + '" y2="' + y + '"/>';
                g += '<polygon points="' + x2 + ',' + y + ' ' + (x2 - dir * 11) + ',' + (y - 5.5) + ' ' +
                    (x2 - dir * 11) + ',' + (y + 5.5) + '"/>';
                var mid = (from + to) / 2;
                g += '<text class="label" x="' + mid + '" y="' + (y - 7) + '" text-anchor="middle">' + esc(s.label) + '</text>';
                badgeX = from - dir * 15;
            }
            g += '<circle class="badge" cx="' + badgeX + '" cy="' + y + '" r="9"/>';
            g += '<text class="num" x="' + badgeX + '" y="' + (y + 3.5) + '" text-anchor="middle">' + (i + 1) + '</text>';
            g += '<title>' + esc((i + 1) + '. ' + s.title) + '</title>';
            g += '</g>';
            out.push(g);
        });

        out.push('</svg>');
        return out.join('');
    }

    // ------------------------------------------------------------------
    // Zoom / pan controller for an <svg> with a viewBox
    // ------------------------------------------------------------------
    function Zoomer(stage) {
        this.stage = stage;
        this.overlay = false;
        this.dragged = false;
        this.pointers = {};
        this.bind();
    }

    Zoomer.prototype.attach = function (svg) {
        this.svg = svg;
        var vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
        this.base = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
        this.vb = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
        this.apply();
    };

    Zoomer.prototype.apply = function () {
        var v = this.vb;
        this.svg.setAttribute('viewBox', [v.x, v.y, v.w, v.h].map(function (n) {
            return Math.round(n * 100) / 100;
        }).join(' '));
    };

    Zoomer.prototype.isZoomed = function () { return this.vb.w < this.base.w * 0.98; };

    Zoomer.prototype.clamp = function () {
        var b = this.base, v = this.vb;
        v.x = Math.min(Math.max(v.x, b.x), b.x + b.w - v.w);
        v.y = Math.min(Math.max(v.y, b.y), b.y + b.h - v.h);
    };

    // factor > 1 zooms in. (cx, cy) in SVG coordinates; default: centre.
    Zoomer.prototype.zoomBy = function (factor, cx, cy) {
        var b = this.base, v = this.vb;
        var newW = Math.min(b.w, Math.max(b.w / 8, v.w / factor));
        var ratio = newW / v.w;
        if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
        v.x = cx - (cx - v.x) * ratio;
        v.y = cy - (cy - v.y) * ratio;
        v.w = newW;
        v.h = newW * b.h / b.w;
        this.clamp();
        this.apply();
    };

    // On narrow screens, start zoomed in so text stays readable
    // (minScale = minimum on-screen pixels per SVG unit), anchored top-left.
    Zoomer.prototype.fitSmallScreen = function (minScale) {
        var cw = this.stage.clientWidth;
        if (!cw || cw >= 600) { return; }   // phones only
        var targetW = cw / minScale;
        if (targetW >= this.base.w) { return; }
        this.vb = { x: this.base.x, y: this.base.y, w: targetW, h: targetW * this.base.h / this.base.w };
        this.apply();
    };

    Zoomer.prototype.reset = function () {
        this.vb = { x: this.base.x, y: this.base.y, w: this.base.w, h: this.base.h };
        this.apply();
    };

    // Centre the view on an element (used to follow the active step).
    Zoomer.prototype.focusOn = function (node) {
        if (!this.isZoomed() || !node || !node.getBBox) { return; }
        var bb = node.getBBox();
        var v = this.vb;
        v.x = bb.x + bb.width / 2 - v.w / 2;
        v.y = bb.y + bb.height / 2 - v.h / 2;
        this.clamp();
        this.apply();
    };

    Zoomer.prototype.toSvg = function (clientX, clientY) {
        var m = this.svg.getScreenCTM();
        if (!m) { return null; }
        var p = this.svg.createSVGPoint();
        p.x = clientX; p.y = clientY;
        return p.matrixTransform(m.inverse());
    };

    Zoomer.prototype.bind = function () {
        var self = this;
        var stage = this.stage;
        var start = null, pinch = null;

        stage.addEventListener('wheel', function (e) {
            if (!self.svg || !(self.overlay || e.ctrlKey || e.metaKey)) { return; }
            e.preventDefault();
            var p = self.toSvg(e.clientX, e.clientY);
            self.zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, p && p.x, p && p.y);
        }, { passive: false });

        stage.addEventListener('pointerdown', function (e) {
            if (!self.svg || e.target.closest('button')) { return; }
            if (e.pointerType === 'mouse' && e.button !== 0) { return; }
            self.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            self.dragged = false;
            var ids = Object.keys(self.pointers);
            if (ids.length === 1) {
                start = { x: e.clientX, y: e.clientY, vx: self.vb.x, vy: self.vb.y };
            } else if (ids.length === 2) {
                var a = self.pointers[ids[0]], b = self.pointers[ids[1]];
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: self.vb.w };
                start = null;
            }
        });

        stage.addEventListener('pointermove', function (e) {
            if (!self.pointers[e.pointerId]) { return; }
            self.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            var ids = Object.keys(self.pointers);
            if (ids.length === 2 && pinch) {
                var a = self.pointers[ids[0]], b = self.pointers[ids[1]];
                var d = Math.hypot(a.x - b.x, a.y - b.y);
                var mid = self.toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
                var targetW = pinch.w * pinch.d / Math.max(d, 1);
                self.zoomBy(self.vb.w / targetW, mid && mid.x, mid && mid.y);
                self.dragged = true;
                e.preventDefault();
            } else if (ids.length === 1 && start) {
                var dx = e.clientX - start.x, dy = e.clientY - start.y;
                if (!self.dragged && Math.hypot(dx, dy) < 5) { return; }
                if (!self.isZoomed()) { return; }
                if (!self.dragged) {
                    self.dragged = true;
                    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                    self.svg.classList.add('dragging');
                }
                var m = self.svg.getScreenCTM();
                var scale = m ? m.a : 1;
                self.vb.x = start.vx - dx / scale;
                self.vb.y = start.vy - dy / scale;
                self.clamp();
                self.apply();
            }
        });

        function end(e) {
            delete self.pointers[e.pointerId];
            if (Object.keys(self.pointers).length < 2) { pinch = null; }
            if (Object.keys(self.pointers).length === 0) {
                start = null;
                if (self.svg) { self.svg.classList.remove('dragging'); }
            }
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);
        stage.addEventListener('pointerleave', function (e) {
            if (e.pointerType === 'mouse') { end(e); }
        });
    };

    // ------------------------------------------------------------------
    // Shared figure chrome: zoom bar + full-screen overlay
    // ------------------------------------------------------------------
    function addZoomBar(figure, stage, zoomer, title) {
        var bar = el('div', { 'class': 'dx-zoombar' });
        var bIn = el('button', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in' }, '+');
        var bOut = el('button', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out' }, '−');
        var bReset = el('button', { type: 'button', 'aria-label': 'Reset zoom', title: 'Reset zoom' }, '⟲');
        var bFull = el('button', { type: 'button', 'aria-label': 'Full screen', title: 'Full screen' }, '⛶');
        bIn.addEventListener('click', function () { zoomer.zoomBy(1.4); });
        bOut.addEventListener('click', function () { zoomer.zoomBy(1 / 1.4); });
        bReset.addEventListener('click', function () { zoomer.reset(); });
        bFull.addEventListener('click', function () { openOverlay(figure, zoomer, title, bFull); });
        bar.appendChild(bIn); bar.appendChild(bOut); bar.appendChild(bReset); bar.appendChild(bFull);
        stage.insertAdjacentElement('beforebegin', bar);

        var hint = el('p', { 'class': 'dx-hint' },
            'Zoom: + / − buttons, pinch, or Ctrl/⌘ + scroll. Drag to pan when zoomed. ⛶ for full screen.');
        stage.insertAdjacentElement('afterend', hint);
    }

    function openOverlay(figure, zoomer, title, returnFocus) {
        var placeholder = document.createComment('dx-placeholder');
        figure.parentNode.insertBefore(placeholder, figure);

        var overlay = el('div', { 'class': 'dx-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
        var bar = el('div', { 'class': 'dx-overlay-bar' });
        bar.appendChild(el('strong', null, title));
        var close = el('button', { type: 'button' }, 'Close ✕');
        bar.appendChild(close);
        overlay.appendChild(bar);
        overlay.appendChild(figure);
        document.body.appendChild(overlay);
        document.body.classList.add('dx-noscroll');
        zoomer.overlay = true;
        if (!zoomer.isZoomed()) { zoomer.fitSmallScreen(0.85); }
        close.focus();

        function onKey(e) { if (e.key === 'Escape') { shut(); } }
        function shut() {
            document.removeEventListener('keydown', onKey);
            placeholder.parentNode.insertBefore(figure, placeholder);
            placeholder.remove();
            overlay.remove();
            document.body.classList.remove('dx-noscroll');
            zoomer.overlay = false;
            if (returnFocus) { returnFocus.focus(); }
        }
        close.addEventListener('click', shut);
        document.addEventListener('keydown', onKey);
    }

    // ------------------------------------------------------------------
    // Interactive sequence figure
    // ------------------------------------------------------------------
    function buildSequenceFigure(figure, diagram) {
        figure.innerHTML = '';
        figure.appendChild(el('p', { 'class': 'dx-title' }, diagram.title));

        var scenarioBar = null;
        if (diagram.scenarios.length > 1) {
            scenarioBar = el('div', { 'class': 'dx-scenarios', role: 'group', 'aria-label': 'Scenario' });
            figure.appendChild(scenarioBar);
        }

        var stage = el('div', { 'class': 'dx-stage', tabindex: '0',
            'aria-label': 'Diagram. Use the left and right arrow keys to step through.' });
        figure.appendChild(stage);
        var zoomer = new Zoomer(stage);
        addZoomBar(figure, stage, zoomer, diagram.title);

        var legend = el('div', { 'class': 'dx-legend', 'aria-hidden': 'true' });
        figure.appendChild(legend);

        var controls = el('div', { 'class': 'dx-controls' });
        var bStart = el('button', { type: 'button', 'aria-label': 'Back to overview' }, '⏮');
        var bPrev = el('button', { type: 'button' }, '◀ Prev');
        var bNext = el('button', { type: 'button' }, 'Next ▶');
        var bPlay = el('button', { type: 'button' }, '▶ Play');
        var count = el('span', { 'class': 'dx-count' });
        [bStart, bPrev, bNext, bPlay, count].forEach(function (n) { controls.appendChild(n); });
        figure.appendChild(controls);

        var caption = el('div', { 'class': 'dx-caption', 'aria-live': 'polite' });
        figure.appendChild(caption);

        var details = el('details');
        details.appendChild(el('summary', null, 'All steps as text'));
        var list = el('ol');
        details.appendChild(list);
        figure.appendChild(details);

        var state = { scenario: diagram.scenarios[0], i: -1, timer: null };

        function stopPlay() {
            if (state.timer) { clearInterval(state.timer); state.timer = null; }
            bPlay.textContent = '▶ Play';
        }

        function show(i) {
            var steps = state.scenario.steps;
            state.i = Math.max(-1, Math.min(i, steps.length - 1));
            var nodes = stage.querySelectorAll('.step');
            var active = null;
            nodes.forEach(function (n) {
                var k = Number(n.getAttribute('data-i'));
                n.classList.remove('future', 'done', 'active');
                if (state.i === -1) { return; }
                if (k < state.i) { n.classList.add('done'); }
                else if (k === state.i) { n.classList.add('active'); active = n; }
                else { n.classList.add('future'); }
            });
            caption.innerHTML = '';
            if (state.i === -1) {
                caption.appendChild(el('strong', null, state.scenario.label + ' · ' + steps.length + ' steps'));
                caption.appendChild(el('p', null, 'Press Next (or the → key) to walk through it, or click any step in the diagram.'));
                count.textContent = 'Overview';
            } else {
                var s = steps[state.i];
                caption.appendChild(el('strong', null, (state.i + 1) + '. ' + s.title));
                caption.appendChild(el('p', null, s.text));
                count.textContent = 'Step ' + (state.i + 1) + ' / ' + steps.length;
                zoomer.focusOn(active);
            }
            bPrev.disabled = state.i <= -1;
            bStart.disabled = state.i === -1;
            bNext.disabled = state.i >= steps.length - 1;
        }

        function load(scenario) {
            stopPlay();
            state.scenario = scenario;
            stage.querySelectorAll('svg').forEach(function (n) { n.remove(); });
            stage.insertAdjacentHTML('afterbegin', renderSequence(diagram, scenario));
            var svg = stage.querySelector('svg');
            zoomer.attach(svg);
            zoomer.fitSmallScreen(0.85);

            svg.addEventListener('click', function (e) {
                if (zoomer.dragged) { zoomer.dragged = false; return; }
                var g = e.target.closest('.step');
                if (g) { stopPlay(); show(Number(g.getAttribute('data-i'))); }
            });

            // Legend for the kinds used here
            legend.innerHTML = '';
            var kinds = [];
            scenario.steps.forEach(function (s) { if (kinds.indexOf(s.kind) < 0) { kinds.push(s.kind); } });
            kinds.forEach(function (k) {
                legend.appendChild(el('span', { 'class': 'k-' + k }, KIND_LABELS[k]));
            });

            // Text version
            list.innerHTML = '';
            scenario.steps.forEach(function (s) {
                var li = el('li');
                li.appendChild(el('strong', null, s.title + ': '));
                li.appendChild(document.createTextNode(s.text));
                list.appendChild(li);
            });

            if (scenarioBar) {
                scenarioBar.querySelectorAll('button').forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === scenario.id));
                });
            }
            show(-1);
        }

        if (scenarioBar) {
            diagram.scenarios.forEach(function (sc) {
                var b = el('button', { type: 'button', 'data-id': sc.id, 'aria-pressed': 'false' }, sc.label);
                b.addEventListener('click', function () { load(sc); });
                scenarioBar.appendChild(b);
            });
        }

        bStart.addEventListener('click', function () { stopPlay(); show(-1); });
        bPrev.addEventListener('click', function () { stopPlay(); show(state.i - 1); });
        bNext.addEventListener('click', function () { stopPlay(); show(state.i + 1); });
        bPlay.addEventListener('click', function () {
            if (state.timer) { stopPlay(); return; }
            if (state.i >= state.scenario.steps.length - 1) { show(-1); }
            bPlay.textContent = '⏸ Pause';
            show(state.i + 1);
            state.timer = setInterval(function () {
                if (state.i >= state.scenario.steps.length - 1) { stopPlay(); return; }
                show(state.i + 1);
            }, 2600);
        });

        figure.addEventListener('keydown', function (e) {
            if (e.target.closest('.dx-scenarios') || e.altKey || e.ctrlKey || e.metaKey) { return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); show(state.i + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); show(state.i - 1); }
        });

        load(diagram.scenarios[0]);
    }

    // ------------------------------------------------------------------
    // Plain zoomable figure (inline SVG already in the page)
    // ------------------------------------------------------------------
    function buildZoomFigure(figure) {
        var stage = figure.querySelector('.dx-stage');
        var svg = stage && stage.querySelector('svg');
        if (!svg) { return; }
        var zoomer = new Zoomer(stage);
        zoomer.attach(svg);
        zoomer.fitSmallScreen(0.75);
        var titleNode = figure.querySelector('.dx-title');
        addZoomBar(figure, stage, zoomer, titleNode ? titleNode.textContent : 'Diagram');
    }

    function init() {
        document.querySelectorAll('figure[data-diagram]').forEach(function (fig) {
            var d = DIAGRAMS[fig.getAttribute('data-diagram')];
            if (d) { buildSequenceFigure(fig, d); }
        });
        document.querySelectorAll('figure[data-zoom]').forEach(buildZoomFigure);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

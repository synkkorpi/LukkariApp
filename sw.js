const CACHE_NAME = 'perheen-viikko-shell-v1';
const DATA_CACHE_NAME = 'perheen-viikko-data-v1';

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
];

// Asennus - Esiladataan sovelluksen runko (App Shell)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Esiladataan sovelluksen tiedostoja...');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Aktivointi - Poistetaan vanhat välimuistit
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('[Service Worker] Poistetaan vanha välimuisti:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Pyyntöjen käsittely (Fetch)
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // 1. Google Apps Script API -pyynnöt (Network-First, fallback cacheen)
    if (requestUrl.hostname.includes('script.google.com') || requestUrl.hostname.includes('script.googleusercontent.com')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Tallenna kopio API-vastauksesta välimuistiin
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(DATA_CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    console.log('[Service Worker] Verkkovirhe, haetaan kalenteridata välimuistista');
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Jos dataa ei löydy edes välimuistista
                        return new Response(JSON.stringify({
                            status: "error",
                            message: "Olet offline-tilassa eikä aiempaa kalenteridataa löydy välimuistista."
                        }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    });
                })
        );
        return;
    }

    // 2. Staattiset tiedostot (Stale-While-Revalidate)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch((err) => {
                console.log('[Service Worker] Verkkovirhe staattisessa resurssissa:', err);
            });

            return cachedResponse || fetchPromise;
        })
    );
});

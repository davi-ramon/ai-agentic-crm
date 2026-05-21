/**
 * ============================================================
 *  PWA.GS - Manifesto e Service Worker do Milvolts CRM
 * ============================================================
 */

function _isPwaAssetRequest_(params) {
  var page = String((params && params.page) || '').toLowerCase();
  return page === 'manifest' || page === 'sw';
}

function _renderPwaAsset_(params) {
  var page = String((params && params.page) || '').toLowerCase();
  if (page === 'manifest') {
    return ContentService
      .createTextOutput(JSON.stringify(_buildPwaManifest_()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (page === 'sw') {
    return ContentService
      .createTextOutput(_buildServiceWorkerSource_())
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function _buildPwaManifest_() {
  var appUrl = _buildPageUrl_('app');
  var loginUrl = _buildPageUrl_('login');
  return {
    name: 'Milvolts CRM',
    short_name: 'Milvolts',
    description: 'CRM operacional da Milvolts com dashboard, atendimento e automações.',
    start_url: appUrl || loginUrl || '',
    scope: appUrl || loginUrl || '',
    display: 'standalone',
    orientation: 'landscape-primary',
    background_color: '#091224',
    theme_color: '#1d4ed8',
    icons: [
      {
        src: 'https://i.imgur.com/eBPowrl.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: 'https://i.imgur.com/eBPowrl.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    shortcuts: [
      {
        name: 'Abrir CRM',
        short_name: 'CRM',
        url: appUrl || '',
        icons: [{ src: 'https://i.imgur.com/eBPowrl.png', sizes: '192x192', type: 'image/png' }]
      },
      {
        name: 'Abrir Login',
        short_name: 'Login',
        url: loginUrl || '',
        icons: [{ src: 'https://i.imgur.com/eBPowrl.png', sizes: '192x192', type: 'image/png' }]
      }
    ]
  };
}

function _buildServiceWorkerSource_() {
  var appUrl = _buildPageUrl_('app');
  return [
    "self.addEventListener('install', function(event) {",
    "  self.skipWaiting();",
    "});",
    "self.addEventListener('activate', function(event) {",
    "  event.waitUntil(self.clients.claim());",
    "});",
    "self.addEventListener('fetch', function() {});",
    "self.addEventListener('notificationclick', function(event) {",
    "  event.notification.close();",
    "  var targetUrl = " + JSON.stringify(appUrl || '') + ";",
    "  event.waitUntil(",
    "    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {",
    "      for (var i = 0; i < clientList.length; i++) {",
    "        var client = clientList[i];",
    "        if ('focus' in client) {",
    "          client.postMessage({ type: 'focus-crm', url: targetUrl });",
    "          return client.focus();",
    "        }",
    "      }",
    "      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);",
    "    })",
    "  );",
    "});"
  ].join('\n');
}

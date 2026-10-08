export function getSwaggerHtml(specUrl = '/api/docs/spec'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAWABA Grooming Studio — REST API Documentation</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #141418;
      --gold: #d4af37;
      --text: #f4f4f6;
      --border: #27272a;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .custom-header {
      background: linear-gradient(180deg, #111116 0%, #09090b 100%);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
    }
    .custom-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: 1px solid rgba(212, 175, 55, 0.4);
      background: rgba(212, 175, 55, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--gold);
      font-weight: 700;
      font-size: 16px;
    }
    .brand-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--text);
    }
    .brand-badge {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--gold);
      font-weight: 600;
    }
    .links-wrap {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .header-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .header-link:hover {
      border-color: var(--gold);
      color: var(--gold);
    }
    .swagger-ui {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 16px 60px;
    }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: var(--text) !important; font-size: 26px; }
    .swagger-ui .info p, .swagger-ui .info li { color: #a1a1aa !important; }
    .swagger-ui .scheme-container {
      background: var(--card-bg) !important;
      border: 1px solid var(--border) !important;
      border-radius: 12px;
      box-shadow: none !important;
      padding: 16px;
      margin-bottom: 24px;
    }
    .swagger-ui select {
      background: #1e1e24 !important;
      color: var(--text) !important;
      border: 1px solid var(--border) !important;
      border-radius: 6px;
      padding: 6px 10px;
    }
    .swagger-ui .opblock {
      border-radius: 10px !important;
      margin-bottom: 12px !important;
    }
    .swagger-ui .btn.authorize {
      border-color: var(--gold) !important;
      color: var(--gold) !important;
    }
    .swagger-ui .btn.authorize svg {
      fill: var(--gold) !important;
    }
  </style>
</head>
<body>
  <header class="custom-header">
    <div class="custom-brand">
      <div class="brand-logo">✂</div>
      <div>
        <div class="brand-title">SAWABA GROOMING STUDIO</div>
        <div class="brand-badge">API Documentation</div>
      </div>
    </div>
    <div class="links-wrap">
      <a href="/" class="header-link">Home</a>
      <a href="/health" class="header-link" target="_blank">Health</a>
      <a href="${specUrl}" class="header-link" target="_blank">OpenAPI JSON</a>
    </div>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.min.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`
}

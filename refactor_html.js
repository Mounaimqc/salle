const fs = require('fs');
const path = require('path');

const htmlFiles = [
    'index.html',
    'reservations.html',
    'clients.html',
    'employees.html',
    'stock.html',
    'charges.html',
    'reports.html',
    'settings.html'
];

const dirPath = 'C:\\Users\\ATC\\.gemini\\antigravity\\scratch\\sallepro';

const loaderHtml = `
  <!-- Loader Screen -->
  <div class="loader-overlay" id="loading-overlay">
    <div class="spinner"></div>
  </div>
`;

const logoFieldHtml = `
              <!-- Hall Logo -->
              <div class="form-group">
                <label class="form-label" for="settings-logo-file">Logo de la salle</label>
                <div style="display:flex; gap:15px; align-items:center; margin-bottom:10px;">
                  <img id="settings-logo-preview" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-secondary);">
                  <div class="file-input-wrapper" style="flex:1; margin-top:0;">
                    <button type="button" class="btn btn-outline" style="width: 100%;">Changer le logo...</button>
                    <input type="file" id="settings-logo-file" accept="image/*">
                  </div>
                </div>
              </div>
`;

htmlFiles.forEach(fileName => {
  const filePath = path.join(dirPath, fileName);
  if (!fs.existsSync(filePath)) {
    console.log("File not found: " + fileName);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // Inject loader if missing
  if (!content.includes('id="loading-overlay"')) {
    content = content.replace(/(<body[^>]*>)/, '$1' + loaderHtml);
  }

  // Refactor script tags to module
  content = content.replace(/<script\s+src="js\//g, '<script type="module" src="js/');

  // Inject logo upload form group in settings
  if (fileName === 'settings.html' && !content.includes('id="settings-logo-file"')) {
    content = content.replace(
      /(<form id="settings-hall-form">)/,
      '$1\n' + logoFieldHtml
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Refactored: " + fileName);
});

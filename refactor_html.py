import os
import re

html_files = [
    'index.html',
    'reservations.html',
    'clients.html',
    'employees.html',
    'stock.html',
    'charges.html',
    'reports.html',
    'settings.html'
]

dir_path = r'C:\Users\ATC\.gemini\antigravity\scratch\sallepro'

loader_html = """
  <!-- Loader Screen -->
  <div class="loader-overlay" id="loading-overlay">
    <div class="spinner"></div>
  </div>
"""

logo_field_html = """
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
"""

for file_name in html_files:
    file_path = os.path.join(dir_path, file_name)
    if not os.path.exists(file_path):
        print(f"File not found: {file_name}")
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 1. Inject loader right after <body> tag
    if 'id="loading-overlay"' not in content:
        content = re.sub(r'(<body[^>]*>)', r'\1' + loader_html, content, count=1)
        
    # 2. Refactor script tags to type="module"
    content = re.sub(r'<script\s+src="js/', '<script type="module" src="js/', content)
    
    # 3. Add file upload field in settings.html
    if file_name == 'settings.html' and 'id="settings-logo-file"' not in content:
        content = re.sub(
            r'(<form id="settings-hall-form">)',
            r'\1\n' + logo_field_html,
            content,
            count=1
        )
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Refactored: {file_name}")

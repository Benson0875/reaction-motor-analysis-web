"""Bundle a self-contained offline dashboard. No dependencies or network."""
from pathlib import Path
import hashlib, base64, re
r = Path(__file__).resolve().parents[1] / 'src'
s = (r / 'reaction-index.html').read_text()
styles = [(r / n).read_text() for n in ['style.css', 'reaction.css', 'dashboard.css']]
names = ['dashboard-theme.js', 'sequential-core.js', 'reaction-demo.js', 'environment-series.js', 'reaction-analysis.js', 'reaction-import.js', 'reaction-usb.js', 'assistant-facts.js', 'poster-comparison.js', 'reaction-assistant.js', 'reaction-app.js', 'dashboard-ui.js']
scripts = [(r / n).read_text() for n in names]
for name, code in zip(['style.css', 'reaction.css', 'dashboard.css'], styles):
    s = s.replace(f'<link rel="stylesheet" href="{name}">', '<style>' + code + '</style>')
for name, code in zip(names, scripts):
    s = s.replace(f'<script src="{name}"></script>', '<script>' + code + '</script>')
def digest(code):
    return "'sha256-" + base64.b64encode(hashlib.sha256(code.encode()).digest()).decode() + "'"
csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' " + ' '.join(map(digest, scripts)) + '; style-src ' + ' '.join(map(digest, styles)) + "; img-src data:; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com; worker-src 'self'; base-uri 'none'; form-action 'none'"
s = re.sub(r'content="default-src [^"]+"', lambda _: 'content="' + csp + '"', s, count=1)
(r.parent / 'index.html').write_text(s)
print('Built web/reaction-report.html (self contained, CSP hashes, no network)')

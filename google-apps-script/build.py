"""Generate self-contained HTML for Apps Script and the offline presentation."""
from pathlib import Path
import re
import base64

root = Path(__file__).resolve().parent.parent
html = (root / 'main.html').read_text()
html, styles = re.subn(
    r'<link\s+rel="stylesheet"\s+href="assets/style\.css"\s*/?>',
    lambda _: '<style>\n' + (root / 'assets/style.css').read_text() + '\n</style>',
    html,
)
html, scripts = re.subn(
    r'<script src="assets/index\.js"></script>',
    lambda _: '<script>\n' + (root / 'assets/index.js').read_text() + '\n</script>',
    html,
)
assert styles == scripts == 1, 'HTML source changed: check asset tags.'
# Embed the uploaded photo so presentation and Apps Script need no public image URL.
photo = base64.b64encode((root / 'viatura prf.jpg').read_bytes()).decode('ascii')
assert 'src="viatura%20prf.jpg"' in html, 'Homepage photo tag changed.'
html = html.replace('src="viatura%20prf.jpg"', 'src="data:image/jpeg;base64,' + photo + '"')
html = html.replace('href="main.html"', 'href="#"')
(root / 'apresentacao.html').write_text(html)
(root / 'google-apps-script/Index.html').write_text(html.replace('<head>', '<head><base target="_top">'))
print('Gerados apresentacao.html e google-apps-script/Index.html')

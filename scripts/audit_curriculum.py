#!/usr/bin/env python3
"""Audit the 81 authored lesson pages without network or third-party packages."""
import argparse
import ast
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

# These two lessons teach learning behavior rather than Python. The exception is
# deliberately allowlisted by filename and still requires a machine-checkable
# practice structure, so a code lesson cannot silently remove its editor.
NON_CODE_LESSONS = {
    'meta-04-clumsiness-patience-and-four-stages.html',
    'meta-05-thoroughness-and-atomization.html',
}
NON_CODE_MARKER = 'data-curriculum-exception="non-code-learning-behavior"'
NON_CODE_REQUIREMENTS = (
    '预测',
    '任务',
    '验收证据',
    '参考答案',
)


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids = []
        self.links = []
        self.handlers = []
        self.cards = []
        self.editors = []
        self.capture = None
        self.chunks = []
        self.scripts = []
        self.headings = 0
        self.tiers = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for attr in ('href', 'src'):
            if attrs.get(attr):
                self.links.append(attrs[attr])
        if attrs.get('onclick'):
            self.handlers.append(attrs['onclick'])
        classes = (attrs.get('class') or '').split()
        if tag == 'a' and 'lesson-card' in classes:
            self.cards.append(attrs.get('href', ''))
        if tag == 'h2':
            self.headings += 1
        self.tiers.update(c for c in classes if c in ('level-1', 'level-2', 'level-3'))
        if tag == 'script':
            self.scripts.append(attrs.get('src', ''))
        if tag == 'textarea':
            self.capture = attrs.get('id', '')
            self.chunks = []

    def handle_data(self, data):
        if self.capture is not None:
            self.chunks.append(data)

    def handle_endtag(self, tag):
        if tag == 'textarea' and self.capture is not None:
            self.editors.append((self.capture, ''.join(self.chunks)))
            self.capture = None


def audit():
    paths = sorted((ROOT / 'lessons').glob('*.html'))
    pages = {}
    errors = []
    metrics = []
    for path in paths:
        page = Page(path)
        source = path.read_text()
        page.feed(source)
        pages[path.resolve()] = page
        for key, count in Counter(page.ids).items():
            if count > 1:
                errors.append(f'{path.name}: duplicate id {key}')
        if '../assets/course.js' not in page.scripts:
            errors.append(f'{path.name}: shared runtime missing')
        if path.name == 'index.html':
            continue
        if page.tiers != {'level-1', 'level-2', 'level-3'}:
            errors.append(f'{path.name}: incomplete Level 1/2/3 exercises')
        if not page.editors:
            if path.name not in NON_CODE_LESSONS:
                errors.append(f'{path.name}: no Python exercise')
            else:
                body = source.split('<!-- Main Content -->', 1)[-1].split('<!-- Completion Tracking Bar -->')[0]
                if NON_CODE_MARKER not in body:
                    errors.append(f'{path.name}: non-code exception marker missing')
                for requirement in NON_CODE_REQUIREMENTS:
                    if requirement not in body:
                        errors.append(f'{path.name}: non-code practice missing {requirement}')
        for editor_id, code in page.editors:
            try:
                ast.parse(code)
            except SyntaxError as error:
                errors.append(f'{path.name}#{editor_id}: Python line {error.lineno}: {error.msg}')
        for handler in page.handlers:
            match = re.search(r'executeCode\([\'"]([^\'"]+)[\'"]\s*,\s*[\'"]([^\'"]+)', handler)
            if match:
                for target in match.groups():
                    if target not in page.ids:
                        errors.append(f'{path.name}: executeCode target missing: {target}')
        for token in re.findall(r'lab/[\w/.-]+\.py', source):
            if not (ROOT / token).exists():
                errors.append(f'{path.name}: missing lab file: {token}')
        # A byte count is descriptive; it is never a teaching quality pass/fail gate.
        body = source.split('<!-- Main Content -->', 1)[-1].split('<!-- Completion Tracking Bar -->')[0]
        metrics.append({'lesson': path.stem, 'html_bytes': len(source.encode()),
                        'body_bytes': len(body.encode()), 'h2': page.headings,
                        'editors': len(page.editors), 'checks': source.count('class="check-item"')})
    for path, page in pages.items():
        for link in page.links:
            url = urlsplit(link)
            if url.scheme or url.netloc:
                continue
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            if not target.is_relative_to(ROOT):
                errors.append(f'{path.name}: link escapes project: {link}')
            elif not target.exists():
                errors.append(f'{path.name}: broken link: {link}')
            elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
                errors.append(f'{path.name}: missing anchor: {link}')
    portal = pages[(ROOT / 'lessons/index.html').resolve()]
    expected = {p.name for p in paths if p.name != 'index.html'}
    if len(expected) != 81:
        errors.append(f'Expected 81 lessons, found {len(expected)}')
    if set(portal.cards) != expected or len(portal.cards) != len(expected):
        errors.append('Portal cards do not map one-to-one to lesson files')
    try:
        records = json.loads((ROOT / 'assets/curriculum.json').read_text())
    except (OSError, ValueError) as error:
        errors.append(f'Cannot read curriculum manifest: {error}')
        records = []
    if {r['id'] + '.html' for r in records} != expected:
        errors.append('Curriculum manifest does not match lesson files')
    for record in records:
        if not (ROOT / 'lab' / record['lab']).is_dir():
            errors.append(f"{record['id']}: missing lab module {record['lab']}")
    for position, card in enumerate(portal.cards):
        source = (ROOT / 'lessons' / card).read_text()
        nav = re.search(r'<nav class="bottom-nav">(.*?)</nav>', source, re.S)
        actual = re.findall(r'href="([^"]+)"', nav[1]) if nav else []
        neighbors = portal.cards[max(0, position - 1):position] + portal.cards[position + 1:position + 2]
        # Endpoints may include a portal link in addition to the next/previous lesson.
        if [n for n in actual if n != 'index.html'] != neighbors:
            errors.append(f'{card}: previous/next navigation differs from portal order')
    return {'lessons': len(expected), 'pages': len(paths), 'python_editors': sum(m['editors'] for m in metrics),
            'errors': sorted(set(errors)), 'metrics': metrics}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', type=Path, help='Write complete audit artifact')
    args = parser.parse_args()
    result = audit()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"{result['lessons']} lessons / {result['pages']} HTML pages / {result['python_editors']} Python editors")
    for error in result['errors']:
        print('ERROR:', error)
    print(f"{len(result['errors'])} errors")
    return bool(result['errors'])


if __name__ == '__main__':
    raise SystemExit(main())

import './style.css';
import {
  analyzeRepository,
  PALETTE,
  buildTree,
  layoutTree,
  relatedFiles,
  buildContext,
  suggestContext,
  reportMarkdown,
} from './core.js';
import { demoEntries } from './demo.js';
import { zh } from './i18n.js';

const $ = (id) => document.getElementById(id);
const english = new Map(
  [...document.querySelectorAll('[data-i18n]')].map((node) => [node.dataset.i18n, node.innerHTML]),
);
let lang = 'en';
let repo,
  active,
  selected = new Set(),
  prefix = '',
  view = 'map',
  filter = '',
  listLimit = 300,
  recommendation;
let worker,
  workerObjectUrl,
  importing = false,
  toastTimeout,
  importTimeout;
const format = (n) => Number(n).toLocaleString();
const t = (en, cn) => (lang === 'zh' ? cn : en);
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
function button(text, className, callback) {
  const node = el('button', className, text);
  node.addEventListener('click', callback);
  return node;
}
function svgEl(tag, attrs = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $('toast').hidden = true;
  }, 4000);
}
function showNotice(message, canCancel = false) {
  $('notice').hidden = false;
  $('notice-message').textContent = message;
  $('cancel-import').hidden = !canCancel;
}
function download(text, name, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = el('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const safeName = (name) => name.replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 80) || 'repository';
function setRepo(next, demo = false) {
  repo = next;
  prefix = '';
  filter = '';
  $('search').value = '';
  listLimit = 300;
  active =
    repo.files.find((file) => file.path === 'src/App.tsx')?.path ||
    repo.files.find((file) => /readme\.md$/i.test(file.path))?.path ||
    repo.files[0]?.path;
  recommendation = suggestContext(repo, $('task').value, Number($('budget').value));
  selected = new Set(recommendation.selected);
  $('repo-name').textContent = repo.name;
  $('repo-meta').textContent = demo
    ? t('Illustrative repository · in-memory only', '演示仓库 · 仅保存在内存中')
    : t(
        `${repo.skipped.length} files skipped · in-memory only`,
        `跳过 ${repo.skipped.length} 个文件 · 仅保存在内存中`,
      );
  $('repo-meta').dataset.demo = String(demo);
  for (const key of ['files', 'lines', 'languages', 'tokens'])
    $('stat-' + key).textContent = format(repo.totals[key]);
  $('stat-links').textContent = format(repo.edges.length);
  $('notice').hidden = Boolean(repo.files.length);
  if (!repo.files.length)
    showNotice(
      t(
        'No eligible text files found. Try a source folder or a UTF-8 repository ZIP.',
        '没有找到可分析的文本文件。请选择源码文件夹或 UTF-8 仓库 ZIP。',
      ),
    );
  renderAll();
}
function inspect(path) {
  active = path;
  renderFiles();
  renderDetail();
  renderVisualization();
}
function toggleFile(path) {
  if (selected.has(path)) selected.delete(path);
  else selected.add(path);
  recommendation = null;
  renderFiles();
  renderDetail();
  renderContext();
}
function visibleFiles() {
  return repo.files.filter(
    (file) =>
      (!prefix || file.path.startsWith(prefix + '/')) && file.path.toLowerCase().includes(filter),
  );
}
function renderFiles() {
  const list = $('file-list'),
    scrollTop = list.scrollTop;
  const previousFocus = list.contains(document.activeElement)
    ? {
        path: document.activeElement.closest('.file-row')?.dataset.path,
        type: document.activeElement.tagName.toLowerCase(),
      }
    : null;
  let restoreFocus;
  list.replaceChildren();
  const files = visibleFiles();
  for (const file of files.slice(0, listLimit)) {
    const row = el('div', 'file-row' + (file.path === active ? ' active' : ''));
    row.setAttribute('role', 'listitem');
    row.dataset.path = file.path;
    const check = el('input');
    check.type = 'checkbox';
    check.checked = selected.has(file.path);
    check.setAttribute('aria-label', t('Include ', '包含 ') + file.path);
    check.addEventListener('change', () => toggleFile(file.path));
    const dot = el('span', 'file-dot');
    dot.style.backgroundColor = PALETTE[file.language];
    const open = button(file.path, 'file-open', () => inspect(file.path));
    open.title = file.path;
    row.append(check, dot, open);
    list.append(row);
    if (previousFocus?.path === file.path)
      restoreFocus = previousFocus.type === 'input' ? check : open;
  }
  if (!files.length) list.append(el('div', 'empty', t('No matching files.', '没有匹配的文件。')));
  if (files.length > listLimit)
    list.append(
      button(t('Show 300 more', '再显示 300 个'), 'button ghost', () => {
        listLimit += 300;
        renderFiles();
      }),
    );
  $('file-count').textContent = t(
    `${Math.min(files.length, listLimit)} of ${files.length} files shown`,
    `显示 ${Math.min(files.length, listLimit)} / ${files.length} 个文件`,
  );
  list.scrollTop = scrollTop;
  restoreFocus?.focus({ preventScroll: true });
}
function renderBreadcrumb() {
  const container = $('breadcrumb');
  container.replaceChildren();
  container.append(
    button(repo.name, '', () => {
      prefix = '';
      renderFiles();
      renderVisualization();
    }),
  );
  const parts = prefix ? prefix.split('/') : [];
  parts.forEach((part, index) => {
    container.append(
      el('span', '', '/'),
      button(part, '', () => {
        prefix = parts.slice(0, index + 1).join('/');
        renderFiles();
        renderVisualization();
      }),
    );
  });
  if (view === 'graph')
    container.append(
      el('span', '', t(' / static imports · JS/TS + Python', ' / 静态导入 · JS/TS + Python')),
    );
}
function colorFor(file) {
  const mode = $('color-mode').value;
  if (mode === 'tokens')
    return file.tokens > 2000 ? '#e99d89' : file.tokens > 500 ? '#c69cdd' : '#899de8';
  if (mode === 'risk')
    return file.findings.length
      ? '#ea9d93'
      : file.lines > 300
        ? '#dfbc83'
        : file.importedBy.length >= 4
          ? '#a395ff'
          : '#638c84';
  return PALETTE[file.language] || PALETTE.Other;
}
function renderLegend() {
  const legend = $('legend');
  legend.replaceChildren();
  const mode = $('color-mode').value;
  const items =
    mode === 'language'
      ? Object.keys(repo.languages).map((name) => [name, PALETTE[name]])
      : mode === 'tokens'
        ? [
            [t('Small', '较小'), '#899de8'],
            [t('Medium', '中等'), '#c69cdd'],
            [t('Large', '较大'), '#e99d89'],
          ]
        : [
            [t('Credential', '凭据线索'), '#ea9d93'],
            [t('Large file', '大文件'), '#dfbc83'],
            [t('Shared', '共享模块'), '#a395ff'],
            [t('Other', '其他'), '#638c84'],
          ];
  for (const [text, color] of items) {
    const item = el('span', 'legend-item');
    const dot = el('i');
    dot.style.backgroundColor = color;
    item.append(dot, document.createTextNode(text));
    legend.append(item);
  }
}
function makeMap() {
  const width = 720,
    height = 390;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'group',
    'aria-label': t(
      'Repository file map. Folders support Enter; use the explorer to select files.',
      '仓库文件地图。文件夹支持回车打开；文件可通过左侧列表选择。',
    ),
    xmlns: 'http://www.w3.org/2000/svg',
  });
  svg.append(svgEl('rect', { width, height, fill: '#10151f', rx: 6 }));
  const tree = buildTree(visibleFiles(), prefix);
  const layout = layoutTree(tree, width, height);
  for (const { node, x, y, w, h, depth } of layout) {
    if (w < 2 || h < 2) continue;
    const group = svgEl('g', {
      class: 'map-cell',
      role: 'button',
      tabindex: node.file ? -1 : 0,
      'aria-label': node.path,
      'aria-pressed': node.path === active,
    });
    const color = node.file ? colorFor(node.file) : '#66728f';
    const isActive = node.path === active;
    group.append(
      svgEl('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 3,
        fill: node.file ? color : '#171f2b',
        'fill-opacity': node.file ? (isActive ? 0.48 : 0.2) : 1,
        stroke: isActive ? '#ded5ff' : color,
        'stroke-opacity': isActive ? 1 : 0.45,
        'stroke-width': isActive ? 2 : 0.8,
      }),
    );
    group.append(
      svgEl(
        'title',
        {},
        `${node.path}${node.file ? `\n${node.file.lines} lines · ~${node.file.tokens} tokens` : '\nClick to open folder'}`,
      ),
    );
    if (w > 42 && h > 19) {
      const fontSize = node.file ? 10 : 9;
      const maxChars = Math.max(3, Math.floor((w - 16) / (fontSize * 0.58)));
      const name = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + '…' : node.name;
      group.append(
        svgEl(
          'text',
          {
            x: x + 8,
            y: y + 16,
            fill: node.file ? '#e1e5ef' : '#9aa9be',
            'font-size': fontSize,
            'font-family': 'Consolas, monospace',
            'font-weight': node.file ? 400 : 600,
          },
          name,
        ),
      );
      if (node.file && h > 44 && w > 82)
        group.append(
          svgEl(
            'text',
            {
              x: x + 8,
              y: y + 32,
              fill: color,
              'font-size': 8,
              'font-family': 'Consolas, monospace',
            },
            `${format(node.file.lines)} lines`,
          ),
        );
    }
    group.addEventListener('click', () => {
      if (node.file) inspect(node.path);
      else {
        prefix = node.path;
        renderFiles();
        renderVisualization();
      }
    });
    if (!node.file)
      group.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        prefix = node.path;
        renderFiles();
        renderVisualization();
        $('breadcrumb').lastElementChild?.focus();
      });
    svg.append(group);
  }
  return svg;
}
function makeGraph() {
  const width = 720,
    height = 390;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Static import graph',
    xmlns: 'http://www.w3.org/2000/svg',
  });
  svg.append(svgEl('rect', { width, height, fill: '#10151f', rx: 6 }));
  const definitions = svgEl('defs');
  const arrow = svgEl('marker', {
    id: 'import-arrow',
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 5,
    markerHeight: 5,
    orient: 'auto-start-reverse',
  });
  arrow.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: '#a395ff' }));
  definitions.append(arrow);
  svg.append(definitions);
  const focusedFile = repo.files.find((file) => file.path === active);
  const neighborhood = new Set(
    focusedFile ? [active, ...focusedFile.imports, ...focusedFile.importedBy] : [],
  );
  const files = [...visibleFiles()]
    .sort(
      (a, b) =>
        Number(b.path === active) - Number(a.path === active) ||
        Number(neighborhood.has(b.path)) - Number(neighborhood.has(a.path)) ||
        b.imports.length + b.importedBy.length - (a.imports.length + a.importedBy.length),
    )
    .slice(0, 120);
  const groups = new Map();
  for (const file of files) {
    const key = file.path.includes('/') ? file.path.split('/')[0] : '/';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const positions = new Map();
  const entries = [...groups.entries()];
  entries.forEach(([name, members], i) => {
    const angle = (i / entries.length) * Math.PI * 2 - Math.PI / 2;
    const cx = width / 2 + Math.cos(angle) * (entries.length === 1 ? 0 : 205),
      cy = height / 2 + Math.sin(angle) * (entries.length === 1 ? 0 : 105);
    const radius = Math.min(65, 25 + members.length * 1.3);
    members.forEach((file, j) => {
      const theta = (j / members.length) * Math.PI * 2;
      positions.set(file.path, {
        x: cx + Math.cos(theta) * radius,
        y: cy + Math.sin(theta) * radius,
        file,
      });
    });
    svg.append(
      svgEl(
        'text',
        {
          x: cx,
          y: cy - radius - 15,
          fill: '#8796b1',
          'text-anchor': 'middle',
          'font-size': 10,
          'font-family': 'Consolas, monospace',
        },
        name,
      ),
    );
  });
  for (const edge of repo.edges) {
    const from = positions.get(edge.from),
      to = positions.get(edge.to);
    if (!from || !to) continue;
    const highlight = edge.from === active || edge.to === active;
    const path = svgEl('path', {
      d: `M${from.x},${from.y} Q${width / 2},${height / 2} ${to.x},${to.y}`,
      class: 'graph-edge' + (highlight ? ' highlight' : ''),
      fill: 'none',
      stroke: '#a395ff',
      'stroke-opacity': highlight ? 0.8 : 0.15,
      'stroke-width': highlight ? 2 : 1,
      'marker-end': highlight ? 'url(#import-arrow)' : '',
    });
    path.append(svgEl('title', {}, `${edge.from} → ${edge.to}`));
    svg.append(path);
  }
  for (const { x, y, file } of positions.values()) {
    const group = svgEl('g', {
      class: 'graph-node',
      role: 'button',
      tabindex: -1,
      'aria-label': file.path,
    });
    const radius = Math.min(9, 3 + Math.sqrt(file.imports.length + file.importedBy.length));
    group.append(
      svgEl('circle', {
        cx: x,
        cy: y,
        r: file.path === active ? radius + 3 : radius,
        fill: colorFor(file),
        'fill-opacity': file.path === active ? 1 : 0.75,
        stroke: file.path === active ? '#f1ecff' : '#10151f',
        'stroke-width': 1.5,
      }),
    );
    group.append(
      svgEl(
        'title',
        {},
        `${file.path}\n${file.imports.length} imports · ${file.importedBy.length} callers`,
      ),
    );
    if (file.path === active)
      group.append(
        svgEl(
          'text',
          {
            x: x + 13,
            y: y + 4,
            fill: '#e7e2ff',
            'font-size': 10,
            'font-family': 'Consolas, monospace',
          },
          file.path.split('/').at(-1),
        ),
      );
    group.addEventListener('click', () => inspect(file.path));
    svg.append(group);
  }
  svg.append(
    svgEl(
      'text',
      {
        x: 14,
        y: height - 12,
        fill: '#71809b',
        'font-size': 8,
        'font-family': 'Consolas, monospace',
      },
      t(
        `${files.length} nodes · arrows point to imports · JS/TS parsed + Python heuristic`,
        `显示 ${files.length} 个节点 · 箭头指向被导入文件 · JS/TS 语法解析 + Python 启发式`,
      ),
    ),
  );
  return svg;
}
function renderVisualization() {
  renderBreadcrumb();
  renderLegend();
  const container = $('visualization');
  container.replaceChildren();
  if (!visibleFiles().length) {
    container.append(el('div', 'empty', t('No files in this view.', '此视图没有文件。')));
    return;
  }
  container.append(view === 'map' ? makeMap() : makeGraph());
}
function renderDetail() {
  const detail = $('file-detail');
  detail.replaceChildren();
  const file = repo.files.find((file) => file.path === active);
  if (!file) {
    detail.append(el('div', 'empty', t('Select a file to inspect.', '选择文件以查看详情。')));
    return;
  }
  detail.append(el('h3', 'detail-path', file.path));
  const tags = el('div', 'detail-tags');
  tags.append(el('span', 'badge', file.language));
  if (file.findings.length)
    tags.append(
      el('span', 'badge', t(`${file.findings.length} masked`, `遮盖 ${file.findings.length} 处`)),
    );
  detail.append(tags);
  const numbers = el('div', 'detail-numbers');
  for (const [value, label] of [
    [format(file.lines), t('lines', '行')],
    ['~' + format(file.tokens), 'tokens'],
    [(file.bytes / 1024).toFixed(1), 'KiB'],
  ]) {
    const item = el('div');
    item.append(el('strong', '', value), el('span', '', label));
    numbers.append(item);
  }
  detail.append(numbers);
  const actions = el('div', 'detail-actions');
  actions.append(
    button(
      selected.has(file.path) ? t('− Remove', '− 移出上下文') : t('+ Include', '+ 加入上下文'),
      'button primary',
      () => toggleFile(file.path),
    ),
  );
  actions.append(
    button(t('+ Dependencies', '+ 本地依赖'), 'button secondary', () => {
      relatedFiles(repo, file.path, 2).forEach((path) => selected.add(path));
      recommendation = null;
      renderFiles();
      renderDetail();
      renderContext();
      toast(t('Added file and local dependencies (up to 2 hops).', '已加入文件及两层本地依赖。'));
    }),
  );
  detail.append(actions);
  if (file.parseDiagnostic)
    detail.append(
      el(
        'div',
        'detail-warning',
        t(file.parseDiagnostic, '此文件存在语法解析问题，导入关系可能不完整。'),
      ),
    );
  if (file.unresolved?.length)
    detail.append(
      el(
        'div',
        'detail-warning',
        t('Unresolved local imports: ', '未解析的本地导入：') + file.unresolved.join(', '),
      ),
    );
  if (file.findings.length)
    detail.append(
      el(
        'div',
        'detail-warning',
        t(
          'Known credential patterns have been masked. Review the original file locally; detection is not exhaustive.',
          '匹配到的常见凭据已遮盖。请在本机检查原文件；检测不能覆盖所有秘密。',
        ),
      ),
    );
  for (const [label, paths] of [
    [t('IMPORTS', '导入文件'), file.imports],
    [t('IMPORTED BY', '被这些文件导入'), file.importedBy],
  ]) {
    detail.append(el('h4', 'detail-heading', label + ' / ' + paths.length));
    if (!paths.length)
      detail.append(
        el('p', 'small muted', t('No resolved local imports.', '没有解析到本地导入。')),
      );
    for (const path of paths) {
      const link = button('↗ ' + path, 'relation-button', () => inspect(path));
      link.title = path;
      detail.append(link);
    }
  }
  if (file.external.length) {
    detail.append(
      el('h4', 'detail-heading', t('EXTERNAL IMPORTS', '外部导入')),
      el('p', 'small muted', file.external.join(', ')),
    );
  }
  detail.append(el('h4', 'detail-heading', t('REDACTED SOURCE', '遮盖后的源码')));
  const lines = file.content.split('\n');
  const preview = el('pre', 'source-preview', lines.slice(0, 250).join('\n'));
  detail.append(preview);
  if (lines.length > 250)
    detail.append(
      button(
        t(`Show all ${lines.length} lines`, `显示全部 ${lines.length} 行`),
        'button ghost',
        (event) => {
          preview.textContent = file.content;
          event.currentTarget.remove();
        },
      ),
    );
}
function renderSignals() {
  $('signal-count').textContent = repo.signals.length + t(' signals', ' 条线索');
  const container = $('signals');
  container.replaceChildren();
  if (!repo.signals.length)
    container.append(
      el(
        'div',
        'empty',
        t(
          'No heuristic signals found. This does not mean the repository is free of issues.',
          '没有发现启发式线索。这并不代表仓库不存在问题。',
        ),
      ),
    );
  for (const signal of repo.signals.slice(0, 100)) {
    const node = el('button', 'signal ' + signal.severity);
    node.append(
      el(
        'span',
        'signal-marker',
        signal.severity === 'high' ? '◈' : signal.severity === 'medium' ? '△' : '↗',
      ),
    );
    const titles = {
      secret: `${signal.title.replace(' redacted', '')} · 已遮盖`,
      large: `单文件 ${format(repo.files.find((file) => file.path === signal.path)?.lines || 0)} 行`,
      hub: `被 ${repo.files.find((file) => file.path === signal.path)?.importedBy.length || 0} 个文件导入`,
      todo: signal.title.replace(' markers', ' 标记'),
      excluded: '敏感文件名已排除',
      cycle: `${signal.members?.length || 0} 个文件构成导入循环`,
      parse: '导入解析需要核查',
      unresolved: '存在未解析的本地导入',
      config: '路径别名配置需要核查',
    };
    const details = {
      secret: '匹配到的值已从预览与导出中遮盖，请在本地检查原文件。',
      large: '较大的文件可能降低代码审查与 AI 上下文的聚焦程度。',
      hub: '共享模块的修改可能影响多个调用方。',
      todo: '注释标记可作为审查线索，并不代表代码质量。',
      excluded: '该文件内容没有进入分析或上下文。',
      cycle: '互相可达的模块：' + (signal.members || []).join(', '),
      parse: '此文件存在语法解析问题，导入关系可能不完整。',
      unresolved:
        '这些本地导入未能链接到已导入的文件：' +
        (repo.files.find((file) => file.path === signal.path)?.unresolved || []).join(', '),
      config: '路径别名配置未完整应用，请核对配置语法、本地继承或项目引用。',
    };
    const copy = el('span');
    copy.append(
      el(
        'span',
        'signal-title',
        lang === 'zh' ? titles[signal.type] || signal.title : signal.title,
      ),
      el('span', 'signal-path', signal.path + (signal.line ? ':' + signal.line : '')),
      el(
        'span',
        'signal-detail',
        lang === 'zh' ? details[signal.type] || signal.detail : signal.detail,
      ),
    );
    node.append(copy);
    node.addEventListener('click', () => {
      if (repo.files.some((file) => file.path === signal.path)) inspect(signal.path);
      else
        toast(
          t(
            'This file was excluded; its source was not analyzed.',
            '该文件已排除，没有分析其源码。',
          ),
        );
    });
    container.append(node);
  }
  if (repo.signals.length > 100)
    container.append(
      el(
        'p',
        'small muted',
        t(
          'Showing first 100 signals. Export a report for the full list.',
          '显示前 100 条，导出报告可查看全部。',
        ),
      ),
    );
}
function context() {
  return buildContext(repo, [...selected], $('task').value);
}
function renderContext() {
  const result = context(),
    budget = Number($('budget').value);
  $('budget-used').textContent = `~${format(result.tokens)} / ${format(budget)} tokens`;
  $('selection-count').textContent = result.files + t(' files selected', ' 个文件已选');
  $('budget-fill').style.width = Math.min(100, (result.tokens / budget) * 100) + '%';
  $('budget-fill').classList.toggle('over', result.tokens > budget);
  $('copy-context').disabled = !result.files;
  $('download-context').disabled = !result.files;
  $('preview-context').disabled = !result.files;
  $('context-warning').classList.toggle('warning', result.tokens > budget);
  $('context-warning').textContent =
    result.tokens > budget
      ? t(
          'Over the estimated budget. Remove files or raise the budget; exports are never silently truncated.',
          '已超出估算预算。请移除文件或增加预算；导出不会静默截断源码。',
        )
      : t(
          'Token estimates use a character heuristic, not a model tokenizer. Inspect exports before sharing.',
          'Token 按字符估算，非模型精确分词。分享前请检查导出内容。',
        );
  const list = $('selection-list');
  list.replaceChildren();
  for (const path of selected) {
    const chip = button(path + ' ×', 'selection-chip', () => toggleFile(path));
    chip.title = t('Remove ', '移除 ') + path;
    list.append(chip);
  }
  if (!selected.size)
    list.append(
      el(
        'span',
        'small muted',
        t(
          'Select files in the explorer or ask for suggestions.',
          '在文件列表中选择，或点击推荐文件。',
        ),
      ),
    );
  const note = $('recommendation-note');
  note.replaceChildren();
  if (recommendation?.matched === false)
    note.append(
      el(
        'p',
        '',
        t(
          'No task keywords matched. Suggestions use project entry files and shared modules; check the selection.',
          '没有匹配到任务关键词。推荐基于入口与共享模块，请核对选择。',
        ),
      ),
    );
  if (recommendation?.excluded.length) {
    note.append(
      el(
        'span',
        '',
        t(
          `${recommendation.excluded.length} ranked candidates did not fit the budget. Full files were not truncated.`,
          `${recommendation.excluded.length} 个候选文件未放入预算，源码没有被截断。`,
        ),
      ),
    );
    const omitted = [...recommendation.excluded].sort(
      (a, b) => Number(b.tokens > budget) - Number(a.tokens > budget) || b.score - a.score,
    );
    for (const file of omitted.slice(0, 3))
      note.append(
        button(`${file.path} · ~${format(file.tokens)} tokens ↗`, '', () => inspect(file.path)),
      );
  }
}
function renderAll() {
  renderFiles();
  renderVisualization();
  renderDetail();
  renderSignals();
  renderContext();
}

function stopImport(feedback = false) {
  worker?.terminate();
  worker = null;
  importing = false;
  clearTimeout(importTimeout);
  if (workerObjectUrl) {
    URL.revokeObjectURL(workerObjectUrl);
    workerObjectUrl = null;
  }
  $('dropzone').classList.remove('loading');
  $('cancel-import').hidden = true;
  if (feedback)
    showNotice(
      t(
        'Import cancelled. Your current repository and selection are unchanged.',
        '已取消导入，当前仓库与选择已保留。',
      ),
    );
}
function importRepository(payload) {
  stopImport();
  importing = true;
  showNotice(
    t(
      'Reading and analyzing locally… Your files are not uploaded.',
      '正在本地读取与分析……不会上传你的文件。',
    ),
    true,
  );
  $('dropzone').classList.add('loading');
  if (typeof __PORTABLE_WORKER_SOURCE__ !== 'undefined') {
    workerObjectUrl = URL.createObjectURL(
      new Blob([__PORTABLE_WORKER_SOURCE__], { type: 'application/javascript' }),
    );
    worker = new Worker(workerObjectUrl);
  } else worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
  const currentWorker = worker;
  const finish = () => {
    if (worker !== currentWorker) return false;
    stopImport();
    return true;
  };
  currentWorker.onmessage = ({ data }) => {
    if (!finish()) return;
    if (!data.ok) {
      showNotice(t('Import failed: ', '导入失败：') + data.error);
      return;
    }
    $('notice').hidden = true;
    setRepo(data.repo);
    toast(t('Repository ready. Nothing left your device.', '分析完成，文件没有离开你的设备。'));
  };
  currentWorker.onerror = () => {
    if (finish())
      showNotice(
        t(
          'Analysis worker failed. Try a smaller source folder.',
          '分析线程失败，请尝试较小的源码文件夹。',
        ),
      );
  };
  importTimeout = setTimeout(() => {
    if (finish())
      showNotice(
        t(
          'Import exceeded 60 seconds and was stopped. Try a smaller source folder.',
          '导入超过 60 秒，已停止。请尝试较小的源码文件夹。',
        ),
      );
  }, 60000);
  currentWorker.postMessage(payload);
}
$('cancel-import').addEventListener('click', () => stopImport(true));
$('open-folder').addEventListener('click', () => $('folder-input').click());
$('open-zip').addEventListener('click', () => $('zip-input').click());
$('folder-input').addEventListener('change', (event) => {
  if (event.target.files.length)
    importRepository({ type: 'folder', files: [...event.target.files] });
  event.target.value = '';
});
$('zip-input').addEventListener('change', (event) => {
  if (event.target.files[0]) importRepository({ type: 'zip', file: event.target.files[0] });
  event.target.value = '';
});
$('dropzone').addEventListener('dragover', (event) => {
  event.preventDefault();
  $('dropzone').classList.add('dragover');
});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragover'));
$('dropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  $('dropzone').classList.remove('dragover');
  const files = [...event.dataTransfer.files];
  if (files.length === 1 && /\.zip$/i.test(files[0].name))
    importRepository({ type: 'zip', file: files[0] });
  else
    toast(
      t(
        'Drop a single ZIP, or use Open folder for a complete repository.',
        '请拖入单个 ZIP；完整文件夹请使用“打开文件夹”。',
      ),
    );
});
$('demo').addEventListener('click', () => {
  stopImport();
  $('notice').hidden = true;
  setRepo(analyzeRepository(demoEntries(), 'prism-demo'), true);
  toast(t('Demo loaded. These are illustrative files.', '已载入示例，文件内容为演示数据。'));
});
$('search').addEventListener('input', (event) => {
  filter = event.target.value.toLowerCase();
  listLimit = 300;
  renderFiles();
  renderVisualization();
});
$('clear-filter').addEventListener('click', () => {
  filter = '';
  prefix = '';
  $('search').value = '';
  renderFiles();
  renderVisualization();
});
$('color-mode').addEventListener('change', renderVisualization);
for (const mode of ['map', 'graph'])
  $('view-' + mode).addEventListener('click', () => {
    view = mode;
    for (const candidate of ['map', 'graph']) {
      $('view-' + candidate).classList.toggle('active', mode === candidate);
      $('view-' + candidate).setAttribute('aria-pressed', String(mode === candidate));
    }
    renderVisualization();
  });
$('task').addEventListener('input', () => {
  recommendation = null;
  renderContext();
});
$('budget').addEventListener('change', () => {
  recommendation = null;
  renderContext();
});
$('auto-select').addEventListener('click', () => {
  recommendation = suggestContext(repo, $('task').value, Number($('budget').value));
  selected = new Set(recommendation.selected);
  renderFiles();
  renderDetail();
  renderContext();
  toast(
    t(
      'Suggestions are based on text matches, entry files and imports. Adjust the selection before sharing.',
      '已按文本匹配、入口文件和导入关系推荐。分享前请调整选择。',
    ),
  );
});
$('clear-selection').addEventListener('click', () => {
  selected.clear();
  recommendation = null;
  renderFiles();
  renderDetail();
  renderContext();
});
$('preview-context').addEventListener('click', () => {
  const result = context();
  $('preview-text').value = result.text;
  $('preview-meta').textContent = t(
    `${result.files} files · ~${format(result.tokens)} estimated tokens · ${result.redactions} source matches masked`,
    `${result.files} 个文件 · 估算 ${format(result.tokens)} tokens · 遮盖 ${result.redactions} 处源码匹配`,
  );
  $('context-preview').showModal();
});
$('close-preview').addEventListener('click', () => $('context-preview').close());
$('download-context').addEventListener('click', () =>
  download(context().text, safeName(repo.name) + '.context.md', 'text/markdown;charset=utf-8'),
);
$('copy-context').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(context().text);
    toast(t('Redacted context copied.', '已复制遮盖后的上下文。'));
  } catch {
    toast(
      t('Clipboard unavailable. Use Markdown download instead.', '剪贴板不可用，请下载 Markdown。'),
    );
  }
});
$('export-report').addEventListener('click', () =>
  download(reportMarkdown(repo), safeName(repo.name) + '.report.md', 'text/markdown;charset=utf-8'),
);
$('export-map').addEventListener('click', () => {
  const visualization = $('visualization').querySelector('svg');
  if (!visualization) return toast(t('No map to export.', '没有可导出的地图。'));
  const svg = visualization.cloneNode(true);
  svg.setAttribute('width', '1440');
  svg.setAttribute('height', '780');
  // Map labels may contain filenames, but never source content.
  download(
    new XMLSerializer().serializeToString(svg),
    safeName(repo.name) + '.' + view + '.svg',
    'image/svg+xml',
  );
});
$('lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'zh' : 'en';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.innerHTML =
      lang === 'zh'
        ? zh[node.dataset.i18n] || english.get(node.dataset.i18n)
        : english.get(node.dataset.i18n);
  });
  $('lang').textContent = lang === 'zh' ? 'English' : '中文';
  $('lang').setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  $('search').placeholder = t('Find a file…', '搜索文件……');
  $('task').placeholder = t(
    'e.g. Understand authentication and fix session expiry',
    '例如：理解认证逻辑，修复会话过期问题',
  );
  const colorNames =
    lang === 'zh'
      ? ['语言', '上下文大小', '审查线索']
      : ['Language', 'Context size', 'Review signals'];
  [...$('color-mode').options].forEach((option, index) => {
    option.textContent = colorNames[index];
  });
  $('repo-meta').textContent =
    $('repo-meta').dataset.demo === 'true'
      ? t('Illustrative repository · in-memory only', '演示仓库 · 仅保存在内存中')
      : t(
          `${repo.skipped.length} files skipped · in-memory only`,
          `跳过 ${repo.skipped.length} 个文件 · 仅保存在内存中`,
        );
  renderAll();
});
setRepo(analyzeRepository(demoEntries(), 'prism-demo'), true);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Cache only the shipped application; imported repositories stay in memory.
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
}

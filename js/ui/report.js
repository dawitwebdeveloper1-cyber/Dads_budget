// The PDF export: a clean printable page. On iPhone the Print screen has a
// Share button, and from there "Save to Files" saves it as a PDF.

import { h } from './dom.js';
import { money, dateLabel } from './format.js';

export function printReport(report) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = h('div', { id: 'print-root' });
    document.body.append(root);
  }
  const thisYear = null;
  root.replaceChildren(...[
    h('h1', {}, 'Budget'),
    h('p', { class: 'print-sub' }, report.title),
    h('table', { class: 'print-totals' },
      h('tbody', {},
        h('tr', {}, h('th', {}, 'Total money in'), h('td', {}, money(report.inCents))),
        h('tr', {}, h('th', {}, 'Total money out'), h('td', {}, money(report.outCents))),
        h('tr', {}, h('th', {}, 'Left over'), h('td', {}, money(report.leftCents))))),
    report.byGroup.length > 0 && [
      h('h2', {}, 'Money out by category'),
      h('table', {},
        h('tbody', {}, report.byGroup.map((g) => h('tr', {}, h('th', {}, g.name), h('td', {}, money(g.cents)))))),
    ],
    h('h2', {}, 'Every payment'),
    h('table', { class: 'print-rows' },
      h('thead', {}, h('tr', {}, ['Date', 'In / out', 'Name', 'Category', 'Personal / business', 'Amount'].map((t) => h('th', {}, t)))),
      h('tbody', {}, report.rows.map((r) => h('tr', {},
        h('td', {}, dateLabel(r.date, thisYear)),
        h('td', {}, r.kind === 'in' ? 'In' : 'Out'),
        h('td', {}, r.name),
        h('td', {}, r.group),
        h('td', {}, r.tag === 'business' ? 'Business' : 'Personal'),
        h('td', { class: 'num' }, money(r.cents)))))),
    h('p', { class: 'print-foot' }, `Made with the Budget app. ${report.rows.length} payments.`),
  ].flat().filter(Boolean));
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

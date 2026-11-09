// The PDF export: a clean printable page. On iPhone the Print screen has a
// Share button, and from there "Save to Files" saves it as a PDF.

import { h } from './dom.js';
import { money, dateLabel } from './format.js';

function printRoot() {
  let root = document.getElementById('print-root');
  if (!root) {
    root = h('div', { id: 'print-root' });
    document.body.append(root);
  }
  return root;
}

function printNow() {
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/** The CRA mileage logbook as a printable page. */
export function printLogbook(book) {
  const km = (n) => (n === null ? '' : `${n.toLocaleString('en-CA')} km`);
  printRoot().replaceChildren(...[
    h('h1', {}, 'Mileage logbook'),
    h('p', { class: 'print-sub' }, book.title.replace('Mileage logbook: ', '')),
    h('table', { class: 'print-rows' },
      h('thead', {}, h('tr', {}, ['Truck', 'Odometer at first trip', 'Odometer at last trip', 'Total', 'Business', 'Personal', 'Business use'].map((t) => h('th', {}, t)))),
      h('tbody', {},
        book.perTruck.map((t) => h('tr', {}, h('td', {}, t.name), h('td', { class: 'num' }, km(t.startKm)), h('td', { class: 'num' }, km(t.endKm)),
          h('td', { class: 'num' }, km(t.totalKm)), h('td', { class: 'num' }, km(t.businessKm)), h('td', { class: 'num' }, km(t.personalKm)), h('td', { class: 'num' }, t.businessPct))),
        book.perTruck.length > 1 && h('tr', {}, h('th', {}, 'All'), h('td'), h('td'), h('th', { class: 'num' }, km(book.totalKm)),
          h('th', { class: 'num' }, km(book.businessKm)), h('th', { class: 'num' }, km(book.personalKm)), h('th', { class: 'num' }, book.businessPct)))),
    h('h2', {}, 'Every trip'),
    h('table', { class: 'print-rows' },
      h('thead', {}, h('tr', {}, ['Date', 'Truck', 'Start', 'End', 'Km', 'Business / personal', 'Where', 'Purpose'].map((t) => h('th', {}, t)))),
      h('tbody', {}, book.rows.map((r) => h('tr', {},
        h('td', {}, dateLabel(r.date)), h('td', {}, r.truck),
        h('td', { class: 'num' }, r.startKm.toLocaleString('en-CA')), h('td', { class: 'num' }, r.endKm.toLocaleString('en-CA')),
        h('td', { class: 'num' }, r.km.toLocaleString('en-CA')),
        h('td', {}, r.tag === 'business' ? 'Business' : 'Personal'), h('td', {}, r.where), h('td', {}, r.purpose))))),
    h('p', { class: 'print-foot' }, `Made with the Budget app. ${book.rows.length} trips.`),
  ].flat().filter(Boolean));
  printNow();
}

export function printReport(report) {
  const root = printRoot();
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
  printNow();
}

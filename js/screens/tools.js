// Screens opened from More: savings goals, spending limits, and export.

import { h, ask, openSheet } from '../ui/dom.js';
import {
  row, list, section, empty, bigButton, askAmount, showMeHow, segmented, checkWarning,
} from '../ui/components.js';
import { money, dateLabel, monthLabel, plural } from '../ui/format.js';
import {
  addGoal, editGoal, deleteGoal, addToGoal, removeDeposit, setLimit,
} from '../data/model.js';
import { goalPlan } from '../insights/goals.js';
import { limitStatus, groupName } from '../insights/limits.js';
import { buildExport, toCSV, exportFileName, exportChoices, periodLabel } from '../data/export.js';
import { saveFile } from '../ui/files.js';
import { printReport } from '../ui/report.js';
import { parseAmount, centsToInput } from '../maths/money.js';
import { dayNumber, ymd, isValidDate } from '../maths/dates.js';

// ---------------------------------------------------------------- savings goals

function progressBar(percent, done = false) {
  return h('span', { class: 'bar-track goal-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
    h('span', { class: `bar-fill${done ? ' done' : ''}`, style: `width:${Math.max(percent, 2)}%` }));
}

function planLine(goal, plan, thisYear) {
  if (plan.done) return 'Goal reached. Well done!';
  if (!goal.byDate) return `${money(plan.remaining)} to go`;
  if (plan.daysLeft < 0) return `${money(plan.remaining)} to go (the date has passed)`;
  return `${money(plan.remaining)} to go by ${dateLabel(goal.byDate, thisYear)} · about ${money(plan.perWeek)} a week`;
}

function goalHow(goal, plan) {
  const lines = [];
  if (goal.deposits.length) {
    lines.push({ kind: 'main', text: goal.deposits.length > 1
      ? `${goal.deposits.map((d) => money(d.cents)).join(' + ')} = ${money(plan.saved)} saved`
      : `${money(plan.saved)} saved` });
  } else {
    lines.push({ kind: 'main', text: 'Nothing saved yet.' });
  }
  lines.push({ kind: 'line', text: `Goal ${money(goal.targetCents)} − saved ${money(plan.saved)} = ${money(plan.remaining)} to go` });
  lines.push({ kind: 'line', text: `${money(plan.saved)} ÷ ${money(goal.targetCents)} = ${plan.percent}% (rounded down)` });
  if (plan.perWeek !== null) {
    lines.push({ kind: 'line', text: `${money(plan.remaining)} ÷ ${plural(plan.weeksLeft, 'week')} left = ${money(plan.perWeek)} a week (rounded up)` });
  }
  return lines;
}

function openGoalForm(ctx, goal = null) {
  const name = h('input', { id: 'g-name', class: 'input', type: 'text', value: goal?.name ?? '', placeholder: 'For example: Truck repairs', maxlength: '40', autocapitalize: 'sentences' });
  const amount = h('input', { id: 'g-amount', class: 'input amount-input', type: 'text', inputmode: 'decimal', placeholder: '0.00', value: goal ? centsToInput(goal.targetCents) : '' });
  const date = h('input', { id: 'g-date', class: 'input', type: 'date', value: goal?.byDate ?? '' });
  const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
  const save = async () => {
    error.textContent = '';
    const parsed = parseAmount(amount.value);
    if (!parsed.ok) { error.textContent = parsed.message; return; }
    const byDate = isValidDate(date.value) ? date.value : null;
    try {
      ctx.change(
        (s) => (goal ? editGoal(s, goal.id, { name: name.value, targetCents: parsed.cents, byDate }) : addGoal(s, { name: name.value, targetCents: parsed.cents, byDate }, ctx.today)),
        goal ? 'Goal saved' : 'Goal added',
      );
      sheet.close();
    } catch (err) {
      error.textContent = err.message;
    }
  };
  const body = h('form', { class: 'entry-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'g-name' }, 'What are you saving for?'), name),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'g-amount' }, 'How much do you need?'),
      h('div', { class: 'amount-wrap' }, h('span', { class: 'amount-sign', 'aria-hidden': 'true' }, '$'), amount)),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'g-date' }, 'By when? (you can leave this empty)'), date,
      h('p', { class: 'hint' }, 'With a date, the app works out how much to put away each week.')),
    error,
    h('button', { type: 'submit', class: 'btn btn-primary btn-save' }, 'Save goal'));
  const sheet = openSheet({ title: goal ? 'Change goal' : 'New savings goal', onCancel: () => sheet.close(), body });
  setTimeout(() => (goal ? amount : name).focus(), 50);
}

export async function addMoneyToGoal(ctx, goal) {
  const { value, cents } = await askAmount({
    title: `Add to ${goal.name}`,
    message: 'How much did you put away?',
    buttons: [{ label: 'Add', value: 'add', kind: 'primary' }, { label: 'Cancel', value: null }],
  });
  if (value !== 'add') return;
  ctx.change((s) => addToGoal(s, goal.id, cents, ctx.today), `${money(cents)} added to ${goal.name}`);
}

export function goalView(goalId) {
  return {
    title: 'Savings goal',
    render(ctx) {
      const goal = (ctx.state.goals ?? []).find((g) => g.id === goalId);
      if (!goal) return h('div', { class: 'screen' }, empty('This goal was deleted.'));
      const plan = goalPlan(goal, ctx.today);
      const thisYear = ymd(dayNumber(ctx.today)).y;
      return h('div', { class: 'screen' },
        h('div', { class: 'card goal-card big' },
          h('h2', { class: 'goal-name' }, goal.name),
          h('p', { class: 'goal-amount' }, money(plan.saved), h('span', { class: 'goal-of' }, ` of ${money(goal.targetCents)}`)),
          progressBar(plan.percent, plan.done),
          h('p', { class: 'goal-plan' }, `${plan.percent}% · ${planLine(goal, plan, thisYear)}`),
          showMeHow(() => goalHow(goal, plan))),
        bigButton('+ Add money', () => addMoneyToGoal(ctx, goal)),
        h('p', { class: 'muted small-note' }, 'This keeps track of your savings. It doesn\'t change your monthly numbers.'),
        goal.deposits.length > 0 && section('Money put away',
          list([...goal.deposits].reverse().map((d) => row({
            title: money(d.cents),
            sub: dateLabel(d.date, thisYear),
            onClick: async () => {
              const { value } = await ask({
                title: 'Remove this?',
                message: `Remove ${money(d.cents)} from ${dateLabel(d.date, thisYear)}?`,
                buttons: [{ label: 'Remove', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
              });
              if (value) ctx.change((s) => removeDeposit(s, goal.id, d.id), 'Removed');
            },
          })))),
        bigButton('Change goal', () => openGoalForm(ctx, goal), 'secondary'),
        h('button', {
          type: 'button',
          class: 'btn btn-danger-plain',
          onclick: async () => {
            const { value } = await ask({
              title: 'Delete this goal?',
              message: `Delete "${goal.name}"? Your monthly numbers won't change.`,
              buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
            });
            if (!value) return;
            ctx.back();
            ctx.change((s) => deleteGoal(s, goal.id), 'Goal deleted');
          },
        }, 'Delete goal'));
    },
  };
}

export const goalsView = {
  title: 'Savings goals',
  render(ctx) {
    const goals = ctx.state.goals ?? [];
    const thisYear = ymd(dayNumber(ctx.today)).y;
    return h('div', { class: 'screen' },
      h('p', { class: 'muted' }, 'Set something to save for, then add money as you put it away.'),
      !goals.length && empty('No goals yet.'),
      goals.map((goal) => {
        const plan = goalPlan(goal, ctx.today);
        return h('button', { type: 'button', class: 'card goal-card tappable', onclick: () => ctx.push(goalView(goal.id)) },
          h('span', { class: 'goal-top' },
            h('span', { class: 'goal-name' }, goal.name),
            h('span', { class: 'goal-nums' }, `${money(plan.saved)} of ${money(goal.targetCents)}`)),
          progressBar(plan.percent, plan.done),
          h('span', { class: 'row-sub' }, `${plan.percent}% · ${planLine(goal, plan, thisYear)}`));
      }),
      bigButton('+ New goal', () => openGoalForm(ctx)));
  },
};

// ---------------------------------------------------------------- spending limits

async function editLimit(ctx, key, name, current) {
  const buttons = [{ label: 'Save limit', value: 'save', kind: 'primary' }];
  if (current) buttons.push({ label: 'Remove limit', value: 'remove', kind: 'danger' });
  buttons.push({ label: 'Cancel', value: null });
  const { value, cents } = await askAmount({
    title: `Monthly limit for ${name}`,
    message: 'You\'ll get a gentle note when you\'ve used 80% of it.',
    current: current ? centsToInput(current) : '',
    buttons,
  });
  if (value === 'save') ctx.change((s) => setLimit(s, key, cents), `Limit for ${name} saved`);
  if (value === 'remove') ctx.change((s) => setLimit(s, key, null), `Limit for ${name} removed`);
}

export const limitsView = {
  title: 'Spending limits',
  render(ctx) {
    const s = ctx.state;
    const status = new Map(limitStatus(s, ctx.today).map((l) => [l.key, l]));
    const { y, m } = ymd(dayNumber(ctx.today));
    const groups = [
      ...s.categories.map((c) => ({ key: `c:${c.id}`, name: c.name, isFolder: false })),
      ...s.folders.map((f) => ({ key: `f:${f.id}`, name: f.name, isFolder: true })),
    ];
    return h('div', { class: 'screen' },
      h('p', { class: 'muted' }, `Set a monthly limit for any category or folder. Showing ${monthLabel(y, m)} so far.`),
      h('div', { class: 'bars' }, groups.map((g) => {
        const l = status.get(g.key);
        const name = `${g.isFolder ? '📁 ' : ''}${groupName(s, g.key)}`;
        return h('button', { type: 'button', class: 'bar-row tappable', onclick: () => editLimit(ctx, g.key, g.name, l?.limitCents ?? null) },
          h('span', { class: 'bar-top' },
            h('span', { class: 'bar-name' }, name),
            h('span', { class: 'bar-amount' }, l ? `${money(l.usedCents)} of ${money(l.limitCents)}` : 'No limit')),
          l && h('span', { class: 'bar-track' }, h('span', {
            class: `bar-fill${l.percent >= 100 ? ' over' : l.percent >= 80 ? ' near' : ''}`,
            style: `width:${Math.min(100, Math.max(2, l.percent))}%`,
          })),
          h('span', { class: 'row-sub' }, l
            ? (l.leftCents >= 0 ? `${l.percent}% used · ${money(l.leftCents)} left` : `${money(-l.leftCents)} over`)
            : 'Tap to set a limit'));
      })));
  },
};

// ---------------------------------------------------------------- export

export const exportView = {
  title: 'Export for taxes',
  render(ctx) {
    const prefs = (ctx.prefs.export ??= { type: 'month', index: 0, filter: 'all' });
    const choices = exportChoices(ctx.state, ctx.today);
    if (!choices.months.length) {
      return h('div', { class: 'screen' }, empty('Once you\'ve added some money in or out, you can export it here.'));
    }
    const options = prefs.type === 'month'
      ? choices.months.map((mo, i) => ({ value: String(i), label: monthLabel(mo.y, mo.m), period: { type: 'month', y: mo.y, m: mo.m } }))
      : choices.years.map((y, i) => ({ value: String(i), label: String(y), period: { type: 'year', y } }));
    if (prefs.index >= options.length) prefs.index = 0;
    const period = options[prefs.index].period;
    const report = buildExport(ctx.state, period, prefs.filter);

    const picker = h('select', {
      class: 'input select',
      'aria-label': prefs.type === 'month' ? 'Which month' : 'Which year',
      onchange: (e) => { prefs.index = Number(e.target.value); ctx.render(); },
    }, options.map((o) => h('option', { value: o.value, selected: Number(o.value) === prefs.index }, o.label)));

    return h('div', { class: 'screen' },
      h('p', { class: 'muted' }, 'Make a spreadsheet or a PDF of any month or year, for example for your accountant at tax time.'),
      segmented({
        label: 'Month or year',
        value: prefs.type,
        options: [{ value: 'month', label: 'A month' }, { value: 'year', label: 'A year' }],
        onChange: (v) => { prefs.type = v; prefs.index = 0; ctx.render(); },
      }),
      h('div', { class: 'field' }, picker),
      segmented({
        label: 'Personal, business or both',
        small: true,
        value: prefs.filter,
        options: [{ value: 'all', label: 'Both' }, { value: 'personal', label: 'Personal' }, { value: 'business', label: 'Business' }],
        onChange: (v) => { prefs.filter = v; ctx.render(); },
      }),
      !report.ok
        ? checkWarning()
        : h('div', { class: 'card summary-card' },
          h('p', { class: 'month-card-title' }, report.title),
          h('div', { class: 'summary-line' }, h('span', {}, 'Money in'), h('span', { class: 'up' }, money(report.inCents))),
          h('div', { class: 'summary-line' }, h('span', {}, 'Money out'), h('span', { class: 'down' }, money(report.outCents))),
          h('div', { class: 'summary-line total' }, h('span', {}, 'Left over'), h('span', {}, money(report.leftCents))),
          h('p', { class: 'summary-words' }, `${plural(report.rows.length, 'payment')} in this export.`)),
      report.ok && bigButton('Spreadsheet (CSV)', async () => {
        const result = await saveFile(exportFileName(period, prefs.filter, 'csv'), toCSV(report), 'text/csv');
        if (result !== 'cancelled') ctx.toast('Spreadsheet ready');
      }),
      report.ok && bigButton('PDF (print or save)', () => printReport(report), 'secondary'),
      report.ok && h('p', { class: 'muted small-note' }, `For a PDF on iPhone: on the Print screen, tap the Share button, then "Save to Files". ${periodLabel(period)} includes every payment with its date.`));
  },
};

// Small pieces used by more than one screen.

import { segmented } from '../ui/components.js';

/** The All / Personal / Business switch. Only shown once something is tagged business. */
export function filterSwitch(ctx) {
  if (!ctx.state.entries.some((e) => e.tag === 'business')) {
    ctx.prefs.filter = 'all';
    return null;
  }
  return segmented({
    label: 'Show personal, business or both',
    small: true,
    value: ctx.prefs.filter,
    options: [
      { value: 'all', label: 'Both' },
      { value: 'personal', label: 'Personal' },
      { value: 'business', label: 'Business' },
    ],
    onChange: (v) => { ctx.prefs.filter = v; ctx.render(); },
  });
}

// The tabs along the bottom of the screen, in order.
// To add a new section: make js/screens/<name>.js the same way as the others,
// import it here, add it to this list, and add the new file to the list in
// sw.js. A tab can set `onAdd(ctx)` to decide what the big + button does on it.

import home from './screens/home.js';
import breakdown from './screens/breakdown.js';
import history from './screens/history.js';
import mileage from './screens/mileage.js';
import more from './screens/more.js';

export const TABS = [home, breakdown, history, mileage, more];

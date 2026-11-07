// The tabs along the bottom of the screen, in order.
// To add a new section later (like Mileage): make js/screens/mileage.js the
// same way as the others, import it here, add it to this list, and add the
// new file to the list in sw.js. Nothing else needs to change.

import home from './screens/home.js';
import breakdown from './screens/breakdown.js';
import history from './screens/history.js';
import more from './screens/more.js';

export const TABS = [home, breakdown, history, more];

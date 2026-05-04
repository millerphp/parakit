import { Location } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Walk the history back if there's somewhere to walk back to, otherwise fall
 * back to the given route. Use this for "Back" buttons instead of always
 * pushing `/` — `Location.back()` preserves the user's mental model.
 */
export function goBackOr(location: Location, router: Router, fallback = '/'): void {
  // Approximate "is there real history above us?" — if so, go back; otherwise
  // route to fallback so we never end up on an empty white page after a
  // deep-link or fresh app launch.
  if (window.history.length > 1) {
    location.back();
    return;
  }
  void router.navigateByUrl(fallback);
}

/** Hash router: #/name/param. The last route is persisted through the API (README §7.4). */
export interface Route { name: string; params: string[] }

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? '', params: parts.slice(1) };
}

export const router = $state<{ route: Route }>({ route: parse(location.hash) });

window.addEventListener('hashchange', () => { router.route = parse(location.hash); });

export function go(name: string, ...params: string[]) {
  const hash = '#/' + [name, ...params].map(encodeURIComponent).join('/');
  if (location.hash === hash) router.route = parse(hash);
  else location.hash = hash;
}

export function replace(name: string, ...params: string[]) {
  const hash = '#/' + [name, ...params].map(encodeURIComponent).join('/');
  history.replaceState(null, '', hash);
  router.route = parse(hash);
}

export const currentHash = () => location.hash;

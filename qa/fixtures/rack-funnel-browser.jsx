// Synthetic in-memory adapters only. No token, OAuth provider, email or database connection.
import { useSyncExternalStore } from 'react';
import Portal from '../../src/components/partners/PublicEventPage';
import Detail from '../../src/app/hackathons/[id]/page';
import Login from '../../src/app/login/page';
import Onboarding from '../../src/app/onboarding/page';
import RackFunnel from '../../src/components/partners/RackFunnel';
import { RACK_IT_UP_2026 } from '../../src/lib/partners/rackItUp2026';

export const EVENT = '00000000-0000-4000-8000-000000000006';
const USER = '00000000-0000-4000-8000-000000000007';
const saved = JSON.parse(sessionStorage.getItem('m09_synthetic_fixture') || 'null');
const state = window.__qa = saved || { signedIn: false, profile: { id: USER, is_banned: false, onboarding_completed: false,
  full_name: 'Synthetic Journey Builder', college: 'Synthetic Campus', skills: ['React'], show_track_record: true },
  registration: null, writes: [], reads: [], rpcs: [], callbacks: [], events: [], legacyEvents: [] };
const persist = () => sessionStorage.setItem('m09_synthetic_fixture', JSON.stringify(state));
const navigate = href => { history.pushState(null, '', href); window.dispatchEvent(new PopStateEvent('popstate')); };
const subscribe = fn => { window.addEventListener('popstate', fn); return () => window.removeEventListener('popstate', fn); };
function useLocation() { return useSyncExternalStore(subscribe, () => location.pathname + location.search); }
export const usePathname = () => new URL(useLocation(), location.origin).pathname;
export const useSearchParams = () => new URLSearchParams(new URL(useLocation(), location.origin).search);
export const useParams = () => ({ id: EVENT });
const router = { push: navigate, replace: href => { history.replaceState(null, '', href); window.dispatchEvent(new PopStateEvent('popstate')); } };
export const useRouter = () => router;
export default function Link({ href, children, ...props }) {
  return <a href={href} {...props} onClick={e => { props.onClick?.(e); if (!e.defaultPrevented && !e.ctrlKey && !e.metaKey) { e.preventDefault(); navigate(href); } }}>{children}</a>;
}
export const useNotification = () => ({ showToast() {}, confirm() { throw Error('No destructive action is approved in this fixture'); } });
export const trackEvent = (name, properties) => state.legacyEvents.push({ name, properties });
export const identifyUser = () => {};
window.va = () => {};
export function track(name, properties) { if (state.analyticsFailure) throw Error('Synthetic analytics unavailable'); state.events.push({ name, properties }); persist(); }

const event = { id: EVENT, name: RACK_IT_UP_2026.name, description: 'Synthetic Rack It Up event details. No live participant data.',
  status: 'approved', archived: false, type: 'external', website_url: RACK_IT_UP_2026.registrationUrl,
  start_date: '2026-12-11', end_date: '2026-12-13', location: 'Online', mode: 'online', min_team_size: 1, max_team_size: 4,
  max_participants: null, tags: [], rounds_info: [], organizer_id: null, prize_pool: null };
const builder = { user_id: '00000000-0000-4000-8000-000000000008', full_name: 'Synthetic Public Builder', college: 'Synthetic Campus', skills: ['React', 'Python'], avatar_url: null };
export const supabase = {
  auth: {
    async getSession() { return { data: { session: state.signedIn ? { user: { id: USER } } : null }, error: null }; },
    async getUser() { return { data: { user: state.signedIn ? { id: USER } : null }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithOAuth(options) {
      state.callbacks.push(options.options.redirectTo); state.signedIn = true; persist();
      const next = new URL(options.options.redirectTo).searchParams.get('next');
      // External OAuth/callback is simulated here; the actual server callback is tested offline separately.
      navigate(state.profile.onboarding_completed ? next : '/onboarding?next=' + encodeURIComponent(next));
      return { error: null };
    },
  },
  async rpc(name, args) {
    state.rpcs.push({ name, args });
    if (name === 'get_hackathon_registration_counts') return { data: [{ registration_count: 0, confirmed_count: 0, waitlisted_count: 0 }], error: null };
    if (name !== 'list_event_discovery_builders') throw Error('Unexpected RPC ' + name);
    if (state.discoveryFailure) return { data: null, error: { code: '42501' } };
    const rows = state.empty ? [] : [builder];
    return { data: { total: rows.length, items: rows.slice(args.p_offset, args.p_offset + args.p_limit), offset: args.p_offset, limit: args.p_limit }, error: null };
  },
  from(table) {
    if (!['hackathons', 'profiles', 'hackathon_registrations', 'teams', 'team_hackathons', 'partner_configs', 'saved_hackathons', 'hackathon_resources', 'hackathon_stages'].includes(table)) throw Error('Unexpected relation ' + table);
    let columns = '', operation = 'read', payload, single = false; const filters = [];
    const query = {
      select(value) { columns = value; return this; }, eq(key, value) { filters.push([key, value]); return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      update(value) { operation = 'update'; payload = value; return this; }, insert(value) { operation = 'insert'; payload = value; return this; },
      async single() { single = true; return execute(); }, async maybeSingle() { single = true; return execute(); }, then(resolve, reject) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if (!state.signedIn && table !== 'hackathons') throw Error('Guest raw private read: ' + table);
      if (operation !== 'read') {
        if (!state.signedIn) throw Error('Guest mutation');
        if (table === 'profiles' && operation === 'update') { Object.assign(state.profile, payload); }
        else if (table === 'hackathon_registrations') {
          if (!filters.some(([key, value]) => key === 'user_id' && value === USER) && payload.user_id !== USER) throw Error('Unscoped fixture mutation');
          state.registration = { id: 'synthetic-registration', user_id: USER, team_id: null, metadata: null, ...state.registration, ...payload };
        } else throw Error('Unexpected write ' + table);
        state.writes.push({ table, operation, payload }); persist();
        return { data: table === 'profiles' ? { id: USER } : state.registration, error: null };
      }
      state.reads.push({ table, columns, filters });
      // Preserve the unchanged member page's unrestricted stage/resource reads.
      // Guests still cannot reach these relations; restricted projections stay explicit.
      if (columns.includes('*') && !['hackathon_stages', 'hackathon_resources'].includes(table)) throw Error('Unexpected wildcard');
      let rows = table === 'hackathons' ? [event] : table === 'profiles' ? [state.profile]
        : table === 'hackathon_registrations' ? state.registration ? [state.registration] : [] : [];
      if (table === 'hackathon_registrations' && !filters.some(([key, value]) => key === 'user_id' && value === USER)) throw Error('Unscoped registration read');
      return { data: single ? rows[0] || null : rows, error: null };
    }
    return query;
  },
};
export function App() {
  const route = useLocation();
  const path = new URL(route, location.origin).pathname;
  const config = { slug: RACK_IT_UP_2026.slug, name: RACK_IT_UP_2026.name, logoUrl: '/partners/rack-it-up-2026/RackItUp-mark.png',
    portalVersion: 'organizer-v1', approvedLinks: [], registrationMode: 'external' };
  const publicEvent = { id: EVENT, name: event.name, registrationUrl: event.website_url, isExternal: true };
  return <><RackFunnel />{path.startsWith('/partners/') ? <Portal config={config} event={publicEvent} />
    : path === '/login' ? <Login /> : path === '/onboarding' ? <Onboarding /> : <Detail key={path} />}</>;
}

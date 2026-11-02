// k6 load test for the Udaan API. Choose one scenario per run:
//   SCENARIO=browse | login | register | enquiry | dashboard   VUS=50   DURATION=30s
//   BASE=http://nginx (inside the test stack network)   PASSWORD=<LOADTEST_PASSWORD used by seed-loadtest.ts>
// Accounts come from loadtest/seed-loadtest.ts. Run only against the disposable test stack, never production.
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://nginx';
const ORIGIN = __ENV.ORIGIN || 'http://127.0.0.1:8088';
const SCENARIO = __ENV.SCENARIO || 'browse';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '30s';
const PASSWORD = __ENV.PASSWORD || '';
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');

const json = { headers: { 'Content-Type': 'application/json', Origin: ORIGIN } };

export const options = {
  scenarios:
    SCENARIO === 'enquiry'
      ? { main: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '5m' } }
      : { main: { executor: 'constant-vus', vus: VUS, duration: DURATION } },
  thresholds: { http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function login(email) {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), json);
  if (r.status !== 200) fail(`login ${email}: ${r.status}`);
  return r;
}

export function setup() {
  const colleges = http.get(`${BASE}/api/colleges?limit=12`).json('data') || [];
  const courses = http.get(`${BASE}/api/courses`).json('data') || [];
  return { slugs: colleges.map((c) => c.slug), college: colleges[0] && colleges[0].id, course: courses[0] && courses[0].id };
}

function count(r) {
  const x = r.headers['X-Cache'];
  if (x === 'HIT') cacheHits.add(1);
  else if (x === 'MISS') cacheMisses.add(1);
}

export default function (data) {
  if (SCENARIO === 'browse') {
    // A visitor: college list, a college page, course browser, site settings.
    const pages = [`/api/colleges?page=${1 + (__ITER % 3)}`, `/api/courses/offerings`, `/api/site`];
    if (data.slugs.length) pages.push(`/api/colleges/${data.slugs[__ITER % data.slugs.length]}`);
    for (const p of pages) {
      const r = http.get(`${BASE}${p}`, { tags: { name: p.split('?')[0].replace(/colleges\/[a-z0-9-]+$/, 'colleges/:slug') } });
      count(r);
      check(r, { '200': (x) => x.status === 200 });
    }
  } else if (SCENARIO === 'login') {
    const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: `loadtest-student-${(__VU - 1) % 200}@example.com`, password: PASSWORD }), json);
    check(r, { '200': (x) => x.status === 200 });
  } else if (SCENARIO === 'register') {
    const id = `${__VU}-${__ITER}-${Date.now()}`;
    const r = http.post(`${BASE}/api/auth/register`, JSON.stringify({ name: 'Load Test Applicant', email: `lt-reg-${id}@example.com`, mobile: `98${String(10000000 + ((__VU * 1000 + __ITER) % 89999999)).padStart(8, '0')}`, password: PASSWORD }), json);
    check(r, { '201': (x) => x.status === 201 });
  } else if (SCENARIO === 'enquiry') {
    // Each virtual user is a different verified student submitting one enquiry at the same moment.
    login(`loadtest-student-${__VU - 1}@example.com`);
    const body = { idempotencyKey: `lt-${__VU}-${Date.now()}`, courses: [data.course], colleges: data.college ? [data.college] : [], locations: [], hostel: false, admissionYear: new Date().getFullYear(), counsellingRequest: 'Load test' };
    const r = http.post(`${BASE}/api/enquiries`, JSON.stringify(body), json);
    check(r, { '201': (x) => x.status === 201 });
  } else if (SCENARIO === 'dashboard') {
    if (__ITER === 0) login('loadtest-admin@example.com');
    const r = http.get(`${BASE}/api/admin/dashboard/summary`);
    check(r, { '200': (x) => x.status === 200 });
  }
}

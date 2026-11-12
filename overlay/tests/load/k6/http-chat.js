import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:18080';
const TOKEN = __ENV.TOKEN || '';
const ROOM_ID = __ENV.ROOM_ID || '1';
const PAGE = __ENV.PAGE || '1';
const SEND_TIME = __ENV.SEND_TIME || '2099-01-01T00:00:00';

const payloadBytes = new Trend('chat_history_payload_bytes', true);
const jsonParseRate = new Rate('json_parse_success');
const errorResponses = new Counter('http_error_responses');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    history: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 10),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.MAX_VUS || 100),
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    json_parse_success: ['rate==1'],
  },
};

function headers() {
  const result = { 'Content-Type': 'application/json' };
  if (TOKEN) result.Authorization = `Bearer ${TOKEN}`;
  return result;
}

export default function () {
  const response = http.post(
    `${BASE_URL}/chat/${ROOM_ID}/messages?page=${PAGE}`,
    JSON.stringify({ sendTime: SEND_TIME }),
    { headers: headers(), tags: { endpoint: 'chat-history' } },
  );

  payloadBytes.add(Number(response.headers['Content-Length'] || response.body.length));
  const parsed = response.status >= 200 && response.status < 300 ? response.json() : null;
  const parsedOk = parsed !== null && Array.isArray(parsed);
  jsonParseRate.add(parsedOk);
  if (response.status < 200 || response.status >= 300) errorResponses.add(1);

  check(response, {
    'history status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'history response is JSON array': () => parsedOk,
  });
  sleep(Number(__ENV.SLEEP || 0));
}

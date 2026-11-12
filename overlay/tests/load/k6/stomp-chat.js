import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://127.0.0.1:18080/ws';
const TOKENS = (__ENV.TOKENS || '').split(',').map((value) => value.trim()).filter(Boolean);
const MEMBER_IDS = (__ENV.MEMBER_IDS || '').split(',').map(Number).filter(Boolean);
const ROOM_ID = __ENV.ROOM_ID || '1';
const RECEIVE_ID = Number(__ENV.RECEIVE_ID || MEMBER_IDS[1] || 2);
const MESSAGES_PER_VU = Number(__ENV.MESSAGES_PER_VU || 1);
const MESSAGE_INTERVAL_MS = Number(__ENV.MESSAGE_INTERVAL_MS || 1000);

const connectSuccess = new Rate('stomp_connect_success');
const sendSuccess = new Rate('stomp_send_success');
const receiveSuccess = new Rate('stomp_receive_success');
const duplicateRate = new Rate('stomp_duplicate_receive');
const orderError = new Counter('stomp_order_errors');
const stompErrorEvents = new Counter('stomp_error_events');
const methodMissingRate = new Rate('stomp_method_missing');
const responseTime = new Trend('stomp_message_response_ms', true);

export const options = {
  scenarios: {
    stomp: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    stomp_connect_success: ['rate==1'],
    stomp_send_success: ['rate==1'],
    stomp_receive_success: ['rate==1'],
    stomp_duplicate_receive: ['rate==0'],
    stomp_order_errors: ['count==0'],
    stomp_method_missing: ['rate==0'],
  },
};

function frame(command, headers = {}, body = '') {
  const headerText = Object.entries(headers).map(([key, value]) => `${key}:${value}`).join('\n');
  return `${command}\n${headerText}\n\n${body}\0`;
}

export default function () {
  if (!TOKENS[__VU - 1] || !MEMBER_IDS[__VU - 1]) {
    throw new Error(`TOKEN and MEMBER_IDS must contain one value per VU; missing VU ${__VU}`);
  }
  const memberId = MEMBER_IDS[__VU - 1];
  const token = TOKENS[__VU - 1];
  const received = new Set();
  const sentAt = new Map();
  let sequence = 0;
  let sent = false;

  function sendWork(socket) {
    if (sent) return;
    sent = true;
    socket.send(frame('SUBSCRIBE', { id: `sub-${memberId}`, destination: `/sub/chat/${memberId}`, ack: 'auto' }));
    socket.send(frame('SEND', { destination: '/pub/stomp/connect', Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, '{}'));

    for (let i = 0; i < MESSAGES_PER_VU; i += 1) {
      const id = `${__VU}-${i}-${Date.now()}`;
      sentAt.set(id, Date.now());
      socket.send(frame('SEND', {
        destination: '/pub/chat/messages', Authorization: `Bearer ${token}`, 'content-type': 'application/json', id,
      }, JSON.stringify({ roomId: Number(ROOM_ID), receiveId: RECEIVE_ID, content: `load-test:${id}` })));
      sendSuccess.add(1);
      sleep(MESSAGE_INTERVAL_MS / 1000);
    }
  }

  const result = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      socket.send(frame('CONNECT', { 'accept-version': '1.2', host: 'localhost', Authorization: `Bearer ${token}` }));
    });

    socket.on('message', (raw) => {
      const body = raw.split('\n\n')[1]?.replace(/\0$/, '') || '';
      if (raw.startsWith('CONNECTED')) {
        connectSuccess.add(1);
        sendWork(socket);
      }
      if (raw.startsWith('ERROR')) stompErrorEvents.add(1);
      if (__ENV.DEBUG) console.log(raw);
      try {
        const parsed = JSON.parse(body);
        methodMissingRate.add(!Object.prototype.hasOwnProperty.call(parsed, 'method'));
        const id = parsed.content?.replace('load-test:', '');
        if (!id) return;
        if (received.has(id)) duplicateRate.add(1);
        received.add(id);
        if (sentAt.has(id)) responseTime.add(Date.now() - sentAt.get(id));
        receiveSuccess.add(1);
        const currentSequence = Number(id.split('-')[1]);
        if (currentSequence < sequence) orderError.add(1);
        sequence = currentSequence;
      } catch (_) {
        // Non-message status events are intentionally ignored.
      }
    });

    socket.setTimeout(() => socket.close(), Number(__ENV.CLOSE_AFTER_MS || 5000));
  });

  check(result, { 'websocket status is 101': (r) => r && r.status === 101 });
}

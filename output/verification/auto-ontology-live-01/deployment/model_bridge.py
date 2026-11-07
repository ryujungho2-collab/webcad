from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import math
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB / 'pydeps'))

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

config = dict(line.split('=', 1) for line in (LAB / '.env').read_text().splitlines())
key = config['DEFAULT_MODELS_API_KEY']
tokenizer = Tokenizer.from_file(str(LAB / 'rerank-model' / 'tokenizer.json'))
tokenizer.enable_truncation(max_length=512)
tokenizer.enable_padding()
session_options = ort.SessionOptions()
session_options.intra_op_num_threads = 3
reranker = ort.InferenceSession(str(LAB / 'rerank-model' / 'model.onnx'), sess_options=session_options,
                                providers=['CPUExecutionProvider'])
features = {value.name for value in reranker.get_inputs()}

def rank(payload):
    query, documents = payload['query'], payload['documents']
    if len(documents) > 100:
        raise ValueError('rerank budget exceeded')
    if not documents:
        return {'results': []}
    pairs = tokenizer.encode_batch([(query, document) for document in documents])
    inputs = {
        'input_ids': np.array([pair.ids for pair in pairs], dtype=np.int64),
        'attention_mask': np.array([pair.attention_mask for pair in pairs], dtype=np.int64),
        'token_type_ids': np.array([pair.type_ids for pair in pairs], dtype=np.int64),
    }
    logits = reranker.run(None, {name: value for name, value in inputs.items() if name in features})[0].reshape(-1)
    ordered = sorted(enumerate(logits), key=lambda item: -item[1])
    return {'results': [{'index': idx, 'relevance_score': 1 / (1 + math.exp(-float(logit)))}
                        for idx, logit in ordered[:payload.get('top_n', len(ordered))]]}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, value):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        start = time.monotonic()
        status = 500
        try:
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + key):
                status = 401
                self.reply(status, {'error': 'Unauthorized'})
                return
            size = int(self.headers['Content-Length'])
            if not 0 < size <= 1_000_000:
                raise ValueError('request budget exceeded')
            payload = json.loads(self.rfile.read(size))
            if self.path == '/v1/rerank':
                value = rank(payload)
                status = 200
                self.reply(status, value)
                return
            if self.path in ('/reason/v1/chat/completions', '/extract/v1/chat/completions'):
                route = '/v1/chat/completions'
                payload['model'] = config.get('LAB_CHAT_MODEL', 'webcad-auto-ontology-qwen3:14b')
                structured = payload.get('response_format') is not None or bool(payload.get('tools'))
                if config.get('LAB_CHAT_THINK', 'true') == 'true':
                    payload['reasoning_effort'] = 'low' if self.path.startswith('/reason') and not structured else 'none'
                # LangChain uses max_completion_tokens. Ollama's /v1 endpoint uses max_tokens.
                limit = payload.pop('max_completion_tokens', None) or payload.get('max_tokens') or 2400
                payload['max_tokens'] = min(int(limit), 2400)
            elif self.path == '/v1/embeddings':
                route = self.path
                payload['model'] = 'nomic-embed-text'
                payload['encoding_format'] = 'float'
                input_type = payload.pop('input_type', None)
                prefix = {'query': 'search_query: ', 'passage': 'search_document: '}.get(input_type)
                if prefix is not None:
                    texts = payload['input']
                    payload['input'] = prefix + texts if isinstance(texts, str) else [prefix + text for text in texts]
            else:
                status = 404
                self.reply(status, {'error': 'Unsupported model route'})
                return
            request = Request('http://127.0.0.1:11434' + route, data=json.dumps(payload).encode(),
                              headers={'Content-Type': 'application/json'})
            try:
                upstream = urlopen(request, timeout=420)
            except HTTPError as error:
                upstream = error
            with upstream:
                status = upstream.status
                if route == '/v1/embeddings' and status == 200:
                    value = json.load(upstream)
                    # The NVIDIA catalog fixes pgvector at 2048 dimensions. Appending
                    # zeros to every 768-dimensional Nomic vector preserves cosine scores.
                    for item in value['data']:
                        embedding = item['embedding']
                        if len(embedding) != 768:
                            raise ValueError('unexpected Nomic dimension')
                        item['embedding'] = embedding + [0.0] * (2048 - len(embedding))
                    self.reply(status, value)
                    return
                self.send_response(status)
                self.send_header('Content-Type', upstream.headers.get('Content-Type', 'application/json'))
                self.end_headers()
                if payload.get('stream') and status == 200:
                    for line in upstream:
                        self.wfile.write(line)
                        self.wfile.flush()
                else:
                    self.wfile.write(upstream.read())
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            status = 502
            self.reply(status, {'error': type(error).__name__})
        finally:
            print(f'{self.path} {status} {time.monotonic() - start:.3f}s', flush=True)

print('Local model bridge ready', flush=True)
ThreadingHTTPServer(('127.0.0.1', 38114), Handler).serve_forever()





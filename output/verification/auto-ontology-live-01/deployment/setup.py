from pathlib import Path
import hashlib
import secrets
import shutil

lab = Path.cwd()
source = Path(__file__).resolve().parent / 'source.sqlite3'
if not source.exists():
    raise SystemExit('fixture copy required')
sha = hashlib.sha256(source.read_bytes()).hexdigest()
if sha != 'baaed1af1334c5e7ce76b3c72c17ba8a1f1494ba06285c97092e9eaf2348ce75':
    raise SystemExit('unexpected synthetic fixture digest')
env = lab / '.env'
if not env.exists():
    key = secrets.token_hex(32)
    values = {
        'POSTGRES_USER': 'ontology',
        'POSTGRES_PASSWORD': secrets.token_hex(24),
        'POSTGRES_DATABASE': 'ontology_live01',
        'POSTGRES_HOST': 'postgres',
        'POSTGRES_PORT': '5432',
        'CONNECTION_STRINGS': 'sqlite:////fixtures/source.sqlite3',
        'AUTH_SECRET': secrets.token_hex(32),
        'AUTO_ONTOLOGY_ADMIN_EMAIL': 'lab@localhost.test',
        'AUTO_ONTOLOGY_ADMIN_PASSWORD': secrets.token_hex(20),
        'APP_URL': 'http://localhost:38100',
        'PYTHON_API_URL': 'http://auto-ontology:3001',
        'INGESTION_SERVICE_URL': 'http://ingestion-service:3002',
        'NEXT_TELEMETRY_DISABLED': '1',
        'OTEL_SDK_DISABLED': 'true',
        'DEFAULT_MODELS_API_KEY': key,
        'DEFAULT_MODELS_ENDPOINT': 'http://host.docker.internal:38114/reason/v1',
        'DEFAULT_MODELS_MODEL': 'openai/qwen3-14b-local',
        'NON_REASONING_ENDPOINT': 'http://host.docker.internal:38114/extract/v1',
        'EMBED_ENDPOINT': 'http://host.docker.internal:38114/v1',
        'EMBED_MODEL': 'nomic-embed-text',
        'RERANK_ENDPOINT': 'http://host.docker.internal:38114/v1/rerank',
        'RERANK_MODEL': 'cross-encoder/ms-marco-MiniLM-L6-v2',
        'LANGCHAIN_TRACING_V2': 'false',
        'LANGSMITH_TRACING': 'false',
    }
    env.write_text(''.join(f'{k}={v}\n' for k, v in values.items()), encoding='utf-8')
print(f'Isolated fixture SHA256 {sha}')


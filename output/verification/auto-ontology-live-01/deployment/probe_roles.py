import json, os, time, urllib.request

auth = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['DEFAULT_MODELS_API_KEY']}
chat_model = os.environ['DEFAULT_MODELS_MODEL']
chat_message = [{'role':'user','content':'Reply with OK.'}]
model_calls = (
    ('reasoning', os.environ['DEFAULT_MODELS_ENDPOINT'] + '/chat/completions',
     {'model':chat_model,'messages':chat_message,'max_completion_tokens':160}),
    ('nonReasoning', os.environ['NON_REASONING_ENDPOINT'] + '/chat/completions',
     {'model':chat_model,'messages':[{'role':'user','content':'Return JSON with field ok set to true.'}],
      'response_format':{'type':'json_object'},'max_completion_tokens':40}),
    ('embedding', os.environ['EMBED_ENDPOINT'] + '/embeddings',
     {'model':os.environ['EMBED_MODEL'],'input':['A synthetic health check.'],'input_type':'query'}),
    ('reranking', os.environ['RERANK_ENDPOINT'],
     {'model':os.environ['RERANK_MODEL'],'query':'red planet','documents':['Mars is red.','A violin plays music.'],'top_n':2}),
)
evidence = {}
for name, url, payload in model_calls:
    started = time.monotonic()
    req = urllib.request.Request(url, json.dumps(payload).encode(), auth)
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.load(response)
        row = {'http':response.status, 'elapsedMs':round((time.monotonic()-started)*1000), 'model':payload['model']}
        if name in ('reasoning', 'nonReasoning'):
            message = result['choices'][0]['message']
            row['runtimeModel'] = result['model']
            row['usage'] = result.get('usage')
            if name == 'reasoning':
                row['nonEmptyResponse'] = bool(message['content'])
                assert row['nonEmptyResponse']
            else:
                row['verifiedJson'] = json.loads(message['content']) == {'ok':True}
                assert row['verifiedJson']
        elif name == 'embedding':
            vector = result['data'][0]['embedding']
            assert len(vector) == 2048 and any(vector[:768]) and not any(vector[768:])
            row['nativeDimensions'] = 768
            row['catalogDimensions'] = len(vector)
            row['zeroExtensionVerified'] = True
        else:
            row['rankedIndices'] = [hit['index'] for hit in result['results']]
            assert row['rankedIndices'] == [0, 1]
        evidence[name] = row
print(json.dumps(evidence, indent=2))


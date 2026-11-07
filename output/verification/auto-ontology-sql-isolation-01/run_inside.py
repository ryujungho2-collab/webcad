"""Run the NVIDIA internal calculation stream in the isolated backend container."""

import json
import logging
from pathlib import Path
import sys
from time import perf_counter

from auto_ontology.connectors import get_connectors
from auto_ontology.retrieval.text_to_sql.main import stream_agent_response
from auto_ontology.server.chat.settings_dal import fetch_acronyms, fetch_custom_prompts
from auto_ontology.utils import get_data_objects_retriever, get_semantic_objects_retriever


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def emit(value):
    print(json.dumps(value, ensure_ascii=False, default=str), flush=True)


def main():
    connectors = get_connectors()
    if len(connectors) != 1 or connectors[0].database_name != "source" or connectors[0].dialect != "sqlite":
        raise RuntimeError("Expected only the isolated synthetic SQLite connector")
    payload = {
        "calculation_only": True,
        "connectors": connectors,
        "data_retriever": get_data_objects_retriever(),
        "semantic_retriever": get_semantic_objects_retriever(),
        "acronyms": fetch_acronyms(),
        "custom_prompts": fetch_custom_prompts(),
    }
    questions = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    for question in questions:
        direction = question["id"]
        logging.info("Isolation request started: %s", direction)
        emit({"direction": direction, "type": "request", "request": question["request"], "calculationOnly": True})
        started = perf_counter()
        for event in stream_agent_response({**payload, **question["request"]}):
            emit({"direction": direction, **event})
        emit({"direction": direction, "type": "duration", "elapsedMs": round((perf_counter() - started) * 1000)})


if __name__ == "__main__":
    main()

import os
import sys
import types
from pathlib import Path

pipeline_dir = Path(__file__).resolve().parent.parent
if str(pipeline_dir) not in sys.path:
    sys.path.insert(0, str(pipeline_dir))

if "apps" not in sys.modules:
    apps_mod = types.ModuleType("apps")
    sys.modules["apps"] = apps_mod
else:
    apps_mod = sys.modules["apps"]

if "apps.web_reader" not in sys.modules:
    web_reader_mod = types.ModuleType("apps.web_reader")
    sys.modules["apps.web_reader"] = web_reader_mod
    setattr(apps_mod, "web_reader", web_reader_mod)
else:
    web_reader_mod = sys.modules["apps.web_reader"]

if "apps.web_reader.pipeline" not in sys.modules:
    pipeline_mod = types.ModuleType("apps.web_reader.pipeline")
    pipeline_mod.__path__ = [str(pipeline_dir)]
    sys.modules["apps.web_reader.pipeline"] = pipeline_mod
    setattr(web_reader_mod, "pipeline", pipeline_mod)

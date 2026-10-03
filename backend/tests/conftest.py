import os
import sys
import types
from pathlib import Path
import pytest

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

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

if "apps.web_reader.backend" not in sys.modules:
    backend_mod = types.ModuleType("apps.web_reader.backend")
    backend_mod.__path__ = [str(backend_dir)]
    sys.modules["apps.web_reader.backend"] = backend_mod
    setattr(web_reader_mod, "backend", backend_mod)

import inspect
import asyncio

def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: mark test as asyncio")

def pytest_pyfunc_call(pyfuncitem):
    if inspect.iscoroutinefunction(pyfuncitem.obj):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(pyfuncitem.obj(**{k: pyfuncitem.funcargs[k] for k in pyfuncitem._fixtureinfo.argnames}))
        finally:
            loop.close()
        return True

@pytest.fixture(autouse=True)
def setup_test_audiobooks_dir(request, monkeypatch):
    if "tmp_path" in request.fixturenames:
        tmp_path = request.getfixturevalue("tmp_path")
        monkeypatch.setenv("AUDIOBOOKS_DIR", str(tmp_path))
        try:
            from apps.web_reader.backend.config import settings
            settings.AUDIOBOOKS_DIR = str(tmp_path)
            from apps.web_reader.backend.main import clear_api_caches
            clear_api_caches()
        except (ImportError, AttributeError):
            pass

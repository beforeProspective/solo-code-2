import os
import sys

os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
os.environ['PYTHONUNBUFFERED'] = '1'

cache_dirs = []
for root, dirs, files in os.walk('.'):
    for d in dirs:
        if d == '__pycache__':
            cache_dirs.append(os.path.join(root, d))

for d in cache_dirs:
    try:
        import shutil
        shutil.rmtree(d)
    except:
        pass

for mod_name in list(sys.modules.keys()):
    if 'app' in mod_name or 'main' in mod_name:
        del sys.modules[mod_name]

from main import app

import uvicorn
print("=" * 50)
print("STARTING FRESH SERVER")
print("=" * 50)
uvicorn.run(
    "main:app",
    host="0.0.0.0",
    port=8000,
    reload=False,
    access_log=True
)

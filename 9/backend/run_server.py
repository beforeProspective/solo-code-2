import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

for mod_name in list(sys.modules.keys()):
    if 'app' in mod_name or 'main' in mod_name:
        del sys.modules[mod_name]

from main import app

if __name__ == "__main__":
    import uvicorn
    print("Starting server with fresh module imports...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )
